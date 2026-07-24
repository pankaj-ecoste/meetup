import { requireUser, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'

// POST /api/extensions — the assignee requests a deadline extension on a task.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const body = (await request.json().catch(() => ({}))) as {
      task_id?: string
      reason?: string
      proposed_deadline?: string
    }
    if (!body.task_id || !body.proposed_deadline) {
      throw new HttpError(400, 'Missing task_id or proposed_deadline')
    }
    const admin = supabaseAdmin()

    const { data: task } = await admin
      .from('tasks')
      .select('id, assignee_id, status')
      .eq('id', body.task_id)
      .single()
    if (!task) throw new HttpError(404, 'Task not found')
    if (task.assignee_id !== user.id) {
      throw new HttpError(403, 'Only the assignee can request an extension')
    }
    if (task.status === 'completed') {
      throw new HttpError(400, 'Cannot request extension on a completed task')
    }

    const { data: existing } = await admin
      .from('task_extensions')
      .select('id')
      .eq('task_id', body.task_id)
      .eq('status', 'requested')
    if (existing && existing.length > 0) {
      throw new HttpError(400, 'An extension request is already pending for this task')
    }

    const { data: created, error } = await admin
      .from('task_extensions')
      .insert({
        task_id: body.task_id,
        requested_by: user.id,
        reason: body.reason,
        proposed_deadline: body.proposed_deadline,
        status: 'requested',
      })
      .select('*')
      .single()
    if (error) throw error

    return Response.json(created, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
