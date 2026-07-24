import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'

const LIMIT = 20

// GET /api/auth/pending?search= — PUBLIC (pre-login). Powers the /claim
// name-picker. Only people who haven't finished one-time setup yet, and only
// name + company — never email, so the dropdown can't be used to harvest
// the org's email list. Search-as-you-type (not a giant <select>) so this
// scales cleanly to 150-200 people.
export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams.get('search')?.trim() ?? ''

    let q = supabaseAdmin()
      .from('users')
      .select('id, name, companies(name)')
      .eq('is_active', true)
      .eq('password_set', false)
    if (search) q = q.ilike('name', `%${search}%`)

    const { data, error } = await q.order('name').limit(LIMIT)
    if (error) throw error

    const result = (data ?? []).map((raw) => {
      const row = raw as Record<string, unknown>
      const company = Array.isArray(row.companies) ? row.companies[0] : row.companies
      return {
        id: row.id as string,
        name: row.name as string,
        company_name: (company as { name?: string } | null)?.name ?? '',
      }
    })
    return Response.json(result)
  } catch (e) {
    return jsonError(e)
  }
}
