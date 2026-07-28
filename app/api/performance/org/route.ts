import { requireUser, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'

// GET /api/performance/org?search= — LEADERSHIP ONLY. Org-wide scores.
// Unpaginated on purpose: the org is ~150-200 people total, and the leadership
// scoring dashboard (plan.md §7.5 Part C) needs every row to bucket into
// colour bands and count them correctly — a truncated page would undercount.
export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    if (user.capability_tier !== 'leadership') {
      throw new HttpError(403, 'Access denied — leadership tier required')
    }
    const sp = new URL(request.url).searchParams
    const search = sp.get('search') ?? ''

    let q = supabaseAdmin().from('user_performance').select('*')
    if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%`)

    const { data, error } = await q.order('on_time_pct', { ascending: false })
    if (error) throw error

    return Response.json(data ?? [])
  } catch (e) {
    return jsonError(e)
  }
}
