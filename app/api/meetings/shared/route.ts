import { requireUser } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import type { SharedMeetingRow } from '@/lib/types'

const PAGE_SIZE = 20

type ShareRow = {
  created_at: string
  meetings: { id: string; mom_summary: string | null; created_at: string } | null
  sharer: { name: string } | null
}

// GET /api/meetings/shared?page= — meetings someone else shared with the
// caller (plan.md §8.10), separate from meetings the caller recorded.
export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    const page = Math.max(1, parseInt(new URL(request.url).searchParams.get('page') ?? '1', 10) || 1)
    const offset = (page - 1) * PAGE_SIZE
    const admin = supabaseAdmin()

    const { data, error } = await admin
      .from('meeting_shares')
      .select('created_at, meetings(id, mom_summary, created_at), sharer:users!shared_by(name)')
      .eq('shared_with_user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error

    const rows = (data ?? []) as unknown as ShareRow[]

    const results: SharedMeetingRow[] = await Promise.all(
      rows
        .filter((r) => r.meetings !== null)
        .map(async (r) => {
          const meeting = r.meetings!
          const { count } = await admin
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('meeting_id', meeting.id)
          return {
            id: meeting.id,
            mom_summary: meeting.mom_summary ?? undefined,
            created_at: meeting.created_at,
            task_count: count ?? 0,
            shared_by_name: r.sharer?.name ?? 'Unknown',
            shared_at: r.created_at,
          }
        }),
    )
    return Response.json(results)
  } catch (e) {
    return jsonError(e)
  }
}
