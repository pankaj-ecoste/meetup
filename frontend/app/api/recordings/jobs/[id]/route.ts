import { requireUser, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'

// GET /api/recordings/jobs/{id} — poll fallback for job status. Realtime is
// the primary path; this exists so a missed/dropped Realtime event can never
// leave the user staring at a spinner forever (RELIABLE: never an infinite
// spinner — see plan.md §0).
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request)
    const { id } = await ctx.params

    const { data, error } = await supabaseAdmin()
      .from('recording_jobs')
      .select('id, status, transcript, result, error_msg, created_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
    if (error || !data) throw new HttpError(404, 'Job not found')

    return Response.json(data)
  } catch (e) {
    return jsonError(e)
  }
}
