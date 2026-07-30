import { requireUser, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'

// GET /api/meetings/{id} — one meeting (caller's own) plus its tasks.
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request)
    const { id } = await ctx.params
    const admin = supabaseAdmin()

    const { data: meeting } = await admin
      .from('meetings')
      .select('*')
      .eq('id', id)
      .single()
    if (!meeting) throw new HttpError(404, 'Meeting not found')

    // Visible to the recorder, or to anyone the MoM was shared with.
    if (meeting.recorded_by !== user.id) {
      const { data: share } = await admin
        .from('meeting_shares')
        .select('id')
        .eq('meeting_id', id)
        .eq('shared_with_user_id', user.id)
        .maybeSingle()
      if (!share) throw new HttpError(404, 'Meeting not found')
    }

    const { data: tasks, error: tErr } = await admin
      .from('tasks')
      .select('*, assignees:users!assignee_id(name), report_tos:users!report_to_id(name)')
      .eq('meeting_id', id)
    if (tErr) throw tErr

    return Response.json({ ...meeting, tasks: tasks ?? [] })
  } catch (e) {
    return jsonError(e)
  }
}
