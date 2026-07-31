import { requireUser, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import { TASK_SELECT, enrichTasks } from '@/lib/server/tasks'
import { sendPushToUser } from '@/lib/server/webpush'

type BatchTask = {
  assignee_id: string
  description: string
  deadline: string
  original_deadline: string
  report_to_id: string
}
type BatchBody = {
  tasks?: BatchTask[]
}

// POST /api/tasks/batch — save one or more task delegations from a single
// recording in one call (plan.md §8.12). assignor is the caller for every
// row. Same shape and same per-row company restriction as
// /api/meetings/batch's task insertion — the two flows share this pattern
// on purpose so there is exactly one way tasks get delegated.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const body = (await request.json().catch(() => ({}))) as BatchBody
    const admin = supabaseAdmin()

    const tasks = body.tasks ?? []
    if (tasks.length === 0) throw new HttpError(400, 'At least one task is required')

    const required: (keyof BatchTask)[] = [
      'assignee_id',
      'description',
      'deadline',
      'original_deadline',
      'report_to_id',
    ]
    for (const t of tasks) {
      for (const key of required) {
        if (!t[key]) throw new HttpError(400, `Missing field: ${key}`)
      }
    }

    // Standard employees and managers may only delegate within their own
    // company; CEO (leadership tier) can delegate across all three. Enforced
    // here too, not just by scoping the /api/users dropdown.
    if (user.capability_tier !== 'leadership') {
      const ids = tasks.flatMap((t) => [t.assignee_id, t.report_to_id])
      const { data: targets, error: targetsErr } = await admin
        .from('users')
        .select('id, company_id')
        .in('id', ids)
      if (targetsErr) throw targetsErr
      const outsideCompany = (targets ?? []).some((t) => t.company_id !== user.company_id)
      if (outsideCompany) {
        throw new HttpError(403, 'You can only delegate tasks within your own company')
      }
    }

    const taskRows = tasks.map((t) => ({
      source: 'task_delegation',
      meeting_id: null,
      assignor_id: user.id,
      assignee_id: t.assignee_id,
      description: t.description,
      deadline: t.deadline,
      original_deadline: t.original_deadline,
      report_to_id: t.report_to_id,
      status: 'open',
    }))

    const { data: inserted, error: insErr } = await admin.from('tasks').insert(taskRows).select('id')
    if (insErr) throw insErr

    // Best-effort push to each assignee (plan.md §8.14) — sendPushToUser never
    // throws, so a notification failure can never affect this response.
    const uniqueAssignees = [...new Set(taskRows.map((t) => t.assignee_id))]
    await Promise.all(
      uniqueAssignees.map((assigneeId) =>
        sendPushToUser(assigneeId, {
          title: 'New task assigned',
          body: `${user.name} assigned you a task`,
          url: '/received',
        }),
      ),
    )

    const { data: enriched, error: selErr } = await admin
      .from('tasks')
      .select(TASK_SELECT)
      .in('id', (inserted ?? []).map((r) => r.id))
    if (selErr) throw selErr

    return Response.json(enrichTasks(enriched ?? []), { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
