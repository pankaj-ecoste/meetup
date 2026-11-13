import { requireUser } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import type { UserBrief } from '@/lib/types'

// GET /api/users — active employee names, for the assignee / reporting-to
// suggestions on the review screen.
export async function GET(request: Request) {
  try {
    await requireUser(request)
    const { data, error } = await supabaseAdmin()
      .from('users')
      .select('id, name, email')
      .eq('is_active', true)
      .order('name')
    if (error) throw error
    // Only used for name suggestions on the review screen; the employee list
    // changes rarely, so the browser may reuse it for 5 minutes (private = never
    // stored by a shared cache). Success responses only — errors are not cached.
    return Response.json((data ?? []) as UserBrief[], {
      headers: { 'Cache-Control': 'private, max-age=300', Vary: 'Authorization' },
    })
  } catch (e) {
    return jsonError(e)
  }
}
