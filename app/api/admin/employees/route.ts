import { requireAdmin, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import type { EmployeeRow } from '@/lib/types'
import { MIN_PASSWORD_LENGTH as MIN_PASSWORD } from '@/lib/passwordPolicy'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// GET /api/admin/employees — ADMIN. Everyone currently active.
export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const { data, error } = await supabaseAdmin()
      .from('users')
      .select('id, name, email, role, is_active, created_at')
      .eq('is_active', true)
      .order('name')
    if (error) throw error
    return Response.json((data ?? []) as EmployeeRow[])
  } catch (e) {
    return jsonError(e)
  }
}

// POST /api/admin/employees — ADMIN. Create an employee login: name + email +
// password. No emails are sent; the employee just signs in with these.
// (Removed employees are kept as inactive rows so their meetings stay
// attributable — adding the same email again reactivates that row.)
export async function POST(request: Request) {
  try {
    await requireAdmin(request)
    const body = (await request.json().catch(() => null)) as {
      name?: string
      email?: string
      password?: string
      role?: string
    } | null
    if (!body) throw new HttpError(400, 'Invalid request body')

    const name = body.name?.trim() ?? ''
    const email = body.email?.trim().toLowerCase() ?? ''
    const password = body.password ?? ''
    const role = body.role === 'admin' ? 'admin' : 'employee'

    if (!name) throw new HttpError(400, 'Name is required')
    if (!email || !EMAIL_RE.test(email)) throw new HttpError(400, 'A valid email is required')
    if (password.length < MIN_PASSWORD) {
      throw new HttpError(400, `Password must be at least ${MIN_PASSWORD} characters`)
    }

    const admin = supabaseAdmin()

    const { data: existing } = await admin
      .from('users')
      .select('id, is_active')
      .eq('email', email)
      .maybeSingle()
    if (existing?.is_active) {
      throw new HttpError(409, 'An employee with this email already exists')
    }

    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (authErr || !created?.user) {
      if (/already|registered|exists/i.test(authErr?.message ?? '')) {
        throw new HttpError(409, 'A login with this email already exists')
      }
      throw authErr ?? new Error('Could not create login')
    }
    const authId = created.user.id

    const fields = { name, email, role, is_active: true, auth_id: authId }
    const { data: row, error } = existing
      ? await admin.from('users').update(fields).eq('id', existing.id).select('id, name, email, role, is_active, created_at').single()
      : await admin.from('users').insert(fields).select('id, name, email, role, is_active, created_at').single()

    if (error) {
      // Don't leave an orphan login behind if the profile row failed.
      await admin.auth.admin.deleteUser(authId).catch(() => {})
      throw error
    }

    return Response.json(row, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
