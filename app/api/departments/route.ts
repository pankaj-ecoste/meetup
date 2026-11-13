import { requireUser } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import type { Department } from '@/lib/types'

// GET /api/departments — active departments, for the record-screen dropdown.
export async function GET(request: Request) {
  try {
    await requireUser(request)
    const { data, error } = await supabaseAdmin()
      .from('departments')
      .select('id, name, is_active')
      .eq('is_active', true)
      .order('name')
    if (error) throw error
    // Same list for every employee and it rarely changes, so let the browser
    // reuse it for a minute (private = never stored by a shared cache). Short on
    // purpose: a department an admin just added shows up within 60 s. Only this
    // success response carries it — errors (401 etc.) are never cached.
    return Response.json((data ?? []) as Department[], {
      headers: { 'Cache-Control': 'private, max-age=60', Vary: 'Authorization' },
    })
  } catch (e) {
    return jsonError(e)
  }
}
