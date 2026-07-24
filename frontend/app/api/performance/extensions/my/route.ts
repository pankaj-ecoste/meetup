import { requireUser } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'

// GET /api/performance/extensions/my — the caller's extension request history.
export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    const { data, error } = await supabaseAdmin()
      .from('task_extensions')
      .select('*, tasks(description, deadline, original_deadline)')
      .eq('requested_by', user.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    return Response.json(data ?? [])
  } catch (e) {
    return jsonError(e)
  }
}
