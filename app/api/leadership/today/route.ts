import { requireUser, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import { istTodayBoundsUtc } from '@/lib/server/istDate'
import type { TodaySnapshot } from '@/lib/types'

// GET /api/leadership/today — LEADERSHIP or MANAGER. "Today" snapshot
// (plan.md §7.5 Part B / §8.11): assigned today, completed today, pending
// now — org-wide for leadership, scoped to the doer's own company for a
// manager. `tasks` has no company_id of its own, so scoping goes through
// the assignee's company (same convention as `leadership_task_register`).
export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    if (user.capability_tier !== 'leadership' && user.capability_tier !== 'manager') {
      throw new HttpError(403, 'Access denied — leadership or manager tier required')
    }

    const { start, end } = istTodayBoundsUtc()
    const admin = supabaseAdmin()

    let companyAssigneeIds: string[] | null = null
    if (user.capability_tier !== 'leadership') {
      const { data: companyUsers, error: cuErr } = await admin
        .from('users')
        .select('id')
        .eq('company_id', user.company_id)
      if (cuErr) throw cuErr
      companyAssigneeIds = (companyUsers ?? []).map((u) => u.id)
    }

    async function assignedTodayCount(): Promise<number> {
      if (companyAssigneeIds && companyAssigneeIds.length === 0) return 0
      let q = admin
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', start)
        .lt('created_at', end)
      if (companyAssigneeIds) q = q.in('assignee_id', companyAssigneeIds)
      const { count, error } = await q
      if (error) throw error
      return count ?? 0
    }

    async function completedTodayCount(): Promise<number> {
      if (companyAssigneeIds && companyAssigneeIds.length === 0) return 0
      let q = admin
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('completed_at', start)
        .lt('completed_at', end)
      if (companyAssigneeIds) q = q.in('assignee_id', companyAssigneeIds)
      const { count, error } = await q
      if (error) throw error
      return count ?? 0
    }

    async function pendingNowCount(): Promise<number> {
      if (companyAssigneeIds && companyAssigneeIds.length === 0) return 0
      let q = admin
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .in('status', ['open', 'overdue'])
      if (companyAssigneeIds) q = q.in('assignee_id', companyAssigneeIds)
      const { count, error } = await q
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
