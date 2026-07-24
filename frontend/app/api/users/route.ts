import { requireUser } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import type { UserBrief } from '@/lib/types'

// GET /api/users?search= — active users for Doer / Report-To dropdowns.
// Name + company so same-name people across companies stay distinguishable.
// Ports backend /users.
export async function GET(request: Request) {
  try {
    await requireUser(request) // auth gate only
    const search = new URL(request.url).searchParams.get('search') ?? ''

    let query = supabaseAdmin()
      .from('users')
      .select('id, name, email, company_id, companies(name)')
      .eq('is_active', true)
      .order('name')

    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

    const { data, error } = await query
    if (error) throw error

    // supabase-js types a to-one embed as an array; at runtime it's a single
    // object, so cast through unknown to the real shape.
    const rows = (data ?? []) as unknown as Array<{
      id: string
      name: string
      email: string
      company_id: string
      companies: { name: string } | null
    }>

    const result: UserBrief[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      company_id: row.company_id,
      company_name: row.companies?.name ?? '',
    }))

    return Response.json(result)
  } catch (e) {
    return jsonError(e)
  }
}
