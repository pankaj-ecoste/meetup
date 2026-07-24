import { requireUser, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'

// PATCH /api/extensions/{id}/decide — the task assignor approves/denies.
// An approved extension moves the task deadline (and reopens it if the new
// deadline is in the future) — this is how approved extensions protect score.
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request)
    const { id } = await ctx.params
    const body = (await request.json().catch(() => ({}))) as { decision?: string }
    if (body.decision !== 'approved' && body.decision !== 'denied') {
      throw new HttpError(400, "decision must be 'approved' or 'denied'")
    }
    const admin = supabaseAdmin()

    const { data: ext } = await admin
      .from('task_extensions')
      .select('*, tasks(assignor_id, deadline)')
      .eq('id', id)
      .single()
    if (!ext) throw new HttpError(404, 'Extension not found')

    const taskJoin = (Array.isArray(ext.tasks) ? ext.tasks[0] : ext.tasks) as
      | { assignor_id: string; deadline: string }
      | null
    if (!taskJoin || taskJoin.assignor_id !== user.id) {
      throw new HttpError(403, 'Only the task assignor can decide on extensions')
    }
    if (ext.status !== 'requested') {
      throw new HttpError(400, 'Extension already decided')
    }

    const now = new Date().toISOString()
    const { error: upErr } = await admin
      .from('task_extensions')
      .update({ status: body.decision, decided_by: user.id, decided_at: now })
      .eq('id', id)
    if (upErr) throw upErr

    if (body.decision === 'approved') {
      const newDeadline = ext.proposed_deadline as string
      const taskUpdate: { deadline: string; status?: string } = { deadline: newDeadline }
      if (new Date(newDeadline).getTime() > Date.now()) taskUpdate.status = 'open'
      const { error: tErr } = await admin.from('tasks').update(taskUpdate).eq('id', ext.task_id)
      if (tErr) throw tErr
    }

    const { data: updated, error: selErr } = await admin
      .from('task_extensions')
      .select('*')
      .eq('id', id)
      .single()
    if (selErr) throw selErr

    return Response.json(updated)
  } catch (e) {
    return jsonError(e)
  }
}
