import { requireUser, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import { istDateToUtcStart } from '@/lib/server/istDate'

const PAGE_SIZE = 50
const DAY_MS = 24 * 60 * 60 * 1000

// GET /api/leadership/tasks — LEADERSHIP or MANAGER. Task register (plan.md
// §7.5 Part A / §8.11): leadership sees every task across all companies;
// manager sees only their own company's rows. Metadata only either way — the
// underlying view never selects `description` (locked privacy decision).
export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    if (user.capability_tier !== 'leadership' && user.capability_tier !== 'manager') {
      throw new HttpError(403, 'Access denied — leadership or manager tier required')
    }

    const sp = new URL(request.url).searchParams
    const assignedFrom = sp.get('assigned_from')
    const assignedTo = sp.get('assigned_to')
    const deadlineFrom = sp.get('deadline_from')
    const deadlineTo = sp.get('deadline_to')
    const search = sp.get('search') ?? ''
    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)
    const offset = (page - 1) * PAGE_SIZE

    let q = supabaseAdmin().from('leadership_task_register').select('*')

    if (user.capability_tier !== 'leadership') {
      q = q.eq('company_id', user.company_id)
    }

    if (assignedFrom) q = q.gte('assigned_date', istDateToUtcStart(assignedFrom).toISOString())
    if (assignedTo) {
      const endExclusive = new Date(istDateToUtcStart(assignedTo).getTime() + DAY_MS)
      q = q.lt('assigned_date', endExclusive.toISOString())
    }
    if (deadlineFrom) q = q.gte('deadline', istDateToUtcStart(deadlineFrom).toISOString())
    if (deadlineTo) {
      const endExclusive = new Date(istDateToUtcStart(deadlineTo).getTime() + DAY_MS)
      q = q.lt('deadline', endExclusive.toISOString())
    }
    if (search) {
      q = q.or(`assignor_email.ilike.%${search}%,assignee_email.ilike.%${search}%`)
    }

    const { data, error } = await q
      .order('assigned_date', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error

    return Response.json(data ?? [])
  } catch (e) {
    return jsonError(e)
  }
}
