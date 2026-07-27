import { requireUser, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// GET /api/admin/employees — LEADERSHIP ONLY. Employee roster + the small
// lookup lists (companies, designations) the "add employee" form needs.
export async function GET(request: Request) {
  try {
    const caller = await requireUser(request)
    if (caller.capability_tier !== 'leadership') {
      throw new HttpError(403, 'Access denied — leadership tier required')
    }

    const admin = supabaseAdmin()

    const [employeesRes, companiesRes, designationsRes] = await Promise.all([
      admin
        .from('users')
        .select('id, name, email, phone, is_active, password_set, company_id, companies(name), designation_id, designations(name), created_at')
        .order('created_at', { ascending: false }),
      admin.from('companies').select('id, name').order('id'),
      admin.from('designations').select('id, name').order('id'),
    ])
    if (employeesRes.error) throw employeesRes.error
    if (companiesRes.error) throw companiesRes.error
    if (designationsRes.error) throw designationsRes.error

    // supabase-js types a to-one embed as an array; at runtime it's a single
    // object, so cast through unknown to the real shape (same pattern as
    // /api/users).
    const employees = (employeesRes.data ?? []).map((row) => {
      const r = row as unknown as {
        id: string
        name: string
        email: string
        phone: string | null
        is_active: boolean
        password_set: boolean
        company_id: number
        companies: { name: string } | null
        designation_id: string | null
        designations: { name: string } | null
        created_at: string
      }
      return {
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone ?? undefined,
        is_active: r.is_active,
        password_set: r.password_set,
        company_id: r.company_id,
        company_name: r.companies?.name ?? '',
        designation_id: r.designation_id ?? undefined,
        designation_name: r.designations?.name ?? '',
        created_at: r.created_at,
      }
    })

    return Response.json({
      employees,
      companies: companiesRes.data ?? [],
      designations: designationsRes.data ?? [],
    })
  } catch (e) {
    return jsonError(e)
  }
}

// POST /api/admin/employees — LEADERSHIP ONLY. Add a new employee row
// (auth_id null, password_set false — they claim their account via /claim
// the first time they log in, per the OTP-once + password design).
export async function POST(request: Request) {
  try {
    const caller = await requireUser(request)
    if (caller.capability_tier !== 'leadership') {
      throw new HttpError(403, 'Access denied — leadership tier required')
    }

    const body = (await request.json().catch(() => null)) as {
      name?: string
      email?: string
      phone?: string
      company_id?: number
      designation_id?: string
    } | null
    if (!body) throw new HttpError(400, 'Invalid request body')

    const name = body.name?.trim() ?? ''
    const email = body.email?.trim().toLowerCase() ?? ''
    const phone = body.phone?.trim() || null
    const companyId = body.company_id
    const designationId = body.designation_id?.trim() || null

    if (!name) throw new HttpError(400, 'Name is required')
    if (!email || !EMAIL_RE.test(email)) throw new HttpError(400, 'A valid email is required')
    if (!companyId) throw new HttpError(400, 'Company is required')

    const admin = supabaseAdmin()

    const { data: company } = await admin.from('companies').select('id').eq('id', companyId).single()
    if (!company) throw new HttpError(400, 'Unknown company')

    if (designationId) {
      const { data: designation } = await admin.from('designations').select('id').eq('id', designationId).single()
      if (!designation) throw new HttpError(400, 'Unknown designation')
    }

    const { data: inserted, error } = await admin
      .from('users')
      .insert({
        name,
        email,
        phone,
        company_id: companyId,
        designation_id: designationId,
        is_active: true,
        password_set: false,
      })
      .select('id, name, email, phone, is_active, password_set, company_id, designation_id, created_at')
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new HttpError(409, 'An employee with this email already exists')
      }
      throw error
    }

    return Response.json(inserted, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
