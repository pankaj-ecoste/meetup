import { requireUser } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import type { MeetingResponse } from '@/lib/types'

const PAGE_SIZE = 20

// GET /api/meetings?page= — meetings the caller recorded, each with task_count.
export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    const page = Math.max(1, parseInt(new URL(request.url).searchParams.get('page') ?? '1', 10) || 1)
    const offset = (page - 1) * PAGE_SIZE
    const admin = supabaseAdmin()

    const { data, error } = await admin
      .from('meetings')
      .select('id, recorded_by, company_id, mom_summary, audio_url, created_at')
      .eq('recorded_by', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error

    const rows = (data ?? []) as Omit<MeetingResponse, 'task_count'>[]
    const results: MeetingResponse[] = await Promise.all(
      rows.map(async (row) => {
        const { count } = await admin
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('meeting_id', row.id)
        return { ...row, task_count: count ?? 0 }
      }),
    )
    return Response.json(results)
  } catch (e) {
    return jsonError(e)
  }
}
