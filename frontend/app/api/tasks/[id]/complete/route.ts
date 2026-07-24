import { requireUser, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import { TASK_SELECT, enrichTasks } from '@/lib/server/tasks'

// PATCH /api/tasks/{id}/complete — mark the caller's received task complete.
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request)
    const { id } = await ctx.params
    const body = (await request.json().catch(() => ({}))) as {
      completion_note?: string | null
    }

    const admin = supabaseAdmin()
    // Only the assignee may complete their own task.
    const { data: existing } = await admin
      .from('tasks')
      .select('id')
      .eq('id', id)
      .eq('assignee_id', user.id)
      .single()
    if (!existing) throw new HttpError(404, 'Task not found or not your task')

    const { error: upErr } = await admin
      .from('tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completion_note: body.completion_note ?? null,
      })
      .eq('id', id)
    if (upErr) throw upErr

    const { data: enriched, error: selErr } = await admin
      .from('tasks')
      .select(TASK_SELECT)
      .eq('id', id)
      .single()
    if (selErr) throw selErr

    return Response.json(enrichTasks([enriched])[0])
  } catch (e) {
    return jsonError(e)
  }
}
