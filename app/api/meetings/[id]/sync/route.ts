import { requireAdmin, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import { syncMeeting } from '@/lib/server/meetingSync'

export const runtime = 'nodejs'

// POST /api/meetings/{id}/sync — ADMIN. Re-send one meeting to the sheet
// (retry after a failure). Upsert-by-Meeting-ID, so it never duplicates a row.
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin(request)
    const { id } = await ctx.params
    const { data } = await supabaseAdmin().from('meetings').select('id').eq('id', id).single()
    if (!data) throw new HttpError(404, 'Meeting not found')
    return Response.json(await syncMeeting(id))
  } catch (e) {
    return jsonError(e)
  }
}
