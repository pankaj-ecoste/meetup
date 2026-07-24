import { requireUser, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import { TASK_SELECT, enrichTasks } from '@/lib/server/tasks'

type CreateBody = {
  source?: string
  meeting_id?: string | null
  assignee_id?: string
  description?: string
  deadline?: string
  original_deadline?: string
  report_to_id?: string
}

// POST /api/tasks — create a task delegation. assignor is the caller.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const body = (await request.json().catch(() => ({}))) as CreateBody

    const required: (keyof CreateBody)[] = [
      'source',
      'assignee_id',
      'description',
      'deadline',
      'original_deadline',
      'report_to_id',
    ]
    for (const key of required) {
      if (!body[key]) throw new HttpError(400, `Missing field: ${key}`)
    }

    const admin = supabaseAdmin()
    const { data: inserted, error: insErr } = await admin
      .from('tasks')
      .insert({
        source: body.source,
        meeting_id: body.meeting_id ?? null,
        assignor_id: user.id,
        assignee_id: body.assignee_id,
        description: body.description,
        deadline: body.deadline,
        original_deadline: body.original_deadline,
        report_to_id: body.report_to_id,
        status: 'open',
      })
      .select('id')
      .single()
    if (insErr) throw insErr

    const { data: enriched, error: selErr } = await admin
      .from('tasks')
      .select(TASK_SELECT)
      .eq('id', inserted.id)
      .single()
    if (selErr) throw selErr

    return Response.json(enrichTasks([enriched])[0], { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
