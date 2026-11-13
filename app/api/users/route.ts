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
    return Response.json((data ?? []) as UserBrief[])
  } catch (e) {
    return jsonError(e)
  }
}
