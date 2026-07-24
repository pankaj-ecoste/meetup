import { requireUser } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import type { DashboardCounts } from '@/lib/types'

// GET /api/tasks/dashboard — the caller's task counts. Ports backend /tasks/dashboard.
export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    const uid = user.id
    const admin = supabaseAdmin()

    async function count(col: 'assignor_id' | 'assignee_id', status: string): Promise<number> {
      const { count, error } = await admin
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq(col, uid)
        .eq('status', status)
      if (error) throw error
      return count ?? 0
    }

    const [given_open, received_open, completed, overdue] = await Promise.all([
      count('assignor_id', 'open'),
      count('assignee_id', 'open'),
      count('assignee_id', 'completed'),
      count('assignee_id', 'overdue'),
    ])

    const result: DashboardCounts = { given_open, received_open, completed, overdue }
    return Response.json(result)
  } catch (e) {
    return jsonError(e)
  }
}
