import { requireAdmin } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import { syncMeeting } from '@/lib/server/meetingSync'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/admin/sheet/retry — ADMIN. Re-send every meeting that has not
// reached the sheet (failed or still pending). Safe to run repeatedly: rows are
// keyed by Meeting ID, so nothing is duplicated.
export async function POST(request: Request) {
  try {
    await requireAdmin(request)
    const { data } = await supabaseAdmin()
      .from('meetings')
      .select('id')
      .neq('sheet_status', 'synced')
      .order('created_at', { ascending: true })
      .limit(100)

    let synced = 0
    let failed = 0
    for (const m of data ?? []) {
      const r = await syncMeeting(m.id)
      if (r.status === 'synced') synced++
      else failed++
    }
    return Response.json({ synced, failed })
  } catch (e) {
    return jsonError(e)
  }
}
