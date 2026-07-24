import { requireUser, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'

const PAGE_SIZE = 50

// GET /api/performance/org?search=&page= — LEADERSHIP ONLY. Org-wide scores.
export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    if (user.capability_tier !== 'leadership') {
      throw new HttpError(403, 'Access denied — leadership tier required')
    }
    const sp = new URL(request.url).searchParams
    const search = sp.get('search') ?? ''
    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)
    const offset = (page - 1) * PAGE_SIZE

    let q = supabaseAdmin().from('user_performance').select('*')
    if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%`)

    const { data, error } = await q
      .order('on_time_pct', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error

    return Response.json(data ?? [])
  } catch (e) {
    return jsonError(e)
  }
}
