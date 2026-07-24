import { requireUser, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'

// GET /api/performance/me — the caller's own performance row.
export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    const { data, error } = await supabaseAdmin()
      .from('user_performance')
      .select('*')
      .eq('user_id', user.id)
      .single()
    if (error || !data) throw new HttpError(404, 'Performance data not found')
    return Response.json(data)
  } catch (e) {
    return jsonError(e)
  }
}
