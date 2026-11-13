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
    return Response.json((data ?? []) as Department[])
  } catch (e) {
    return jsonError(e)
  }
}
