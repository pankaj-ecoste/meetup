import { requireUser, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import { istTodayBoundsUtc } from '@/lib/server/istDate'
import type { TodaySnapshot } from '@/lib/types'

// GET /api/leadership/today — LEADERSHIP ONLY. Org-wide "today" snapshot
// (plan.md §7.5 Part B): assigned today, completed today, pending now.
export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    if (user.capability_tier !== 'leadership') {
      throw new HttpError(403, 'Access denied — leadership tier required')
    }

    const { start, end } = istTodayBoundsUtc()
    const admin = supabaseAdmin()

    async function assignedTodayCount(): Promise<number> {
      const { count, error } = await admin
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', start)
        .lt('created_at', end)
      if (error) throw error
      return count ?? 0
    }

    async function completedTodayCount(): Promise<number> {
      const { count, error } = await admin
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('completed_at', start)
        .lt('completed_at', end)
      if (error) throw error
      return count ?? 0
    }

    async function pendingNowCount(): Promise<number> {
      const { count, error } = await admin
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .in('status', ['open', 'overdue'])
      if (error) throw error
      return count ?? 0
    }

    const [assignedToday, completedToday, pendingNow] = await Promise.all([
      assignedTodayCount(),
      completedTodayCount(),
      pendingNowCount(),
    ])

    const result: TodaySnapshot = {
      assigned_today: assignedToday,
      completed_today: completedToday,
      pending_now: pendingNow,
    }
    return Response.json(result)
  } catch (e) {
    return jsonError(e)
  }
}
