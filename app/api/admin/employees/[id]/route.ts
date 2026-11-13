import { requireAdmin, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import { MIN_PASSWORD_LENGTH as MIN_PASSWORD } from '@/lib/passwordPolicy'

export const runtime = 'nodejs'

async function activeAdminCount(): Promise<number> {
  const { count } = await supabaseAdmin()
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('is_active', true)
  return count ?? 0
}

// PATCH /api/admin/employees/{id} — ADMIN. Reset password and/or change
// name / role. This is the "forgot password" path: the employee asks an admin,
// the admin sets a new one here.
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await requireAdmin(request)
    const { id } = await ctx.params
    const body = (await request.json().catch(() => null)) as {
      password?: string
      name?: string
      role?: string
    } | null
    if (!body) throw new HttpError(400, 'Invalid request body')

    const admin = supabaseAdmin()
    const { data: target } = await admin
      .from('users')
      .select('id, email, role, auth_id, is_active')
      .eq('id', id)
      .single()
    if (!target || !target.is_active) throw new HttpError(404, 'Employee not found')

    if (body.password !== undefined) {
      if (body.password.length < MIN_PASSWORD) {
        throw new HttpError(400, `Password must be at least ${MIN_PASSWORD} characters`)
      }
      if (target.auth_id) {
        const { error } = await admin.auth.admin.updateUserById(target.auth_id, {
          password: body.password,
        })
        if (error) throw error
      } else {
        // Row with no login yet (legacy) — create one.
        const { data: created, error } = await admin.auth.admin.createUser({
          email: target.email,
          password: body.password,
          email_confirm: true,
        })
        if (error || !created?.user) throw error ?? new Error('Could not create login')
        await admin.from('users').update({ auth_id: created.user.id }).eq('id', id)
      }
    }

    const fields: Record<string, unknown> = {}
    if (body.name !== undefined) {
      const name = body.name.trim()
      if (!name) throw new HttpError(400, 'Name cannot be empty')
      fields.name = name
    }
    if (body.role !== undefined) {
      if (body.role !== 'admin' && body.role !== 'employee') throw new HttpError(400, 'Invalid role')
      if (body.role === 'employee' && target.role === 'admin' && (id === caller.id || (await activeAdminCount()) <= 1)) {
        throw new HttpError(400, 'There must always be at least one admin')
      }
      fields.role = body.role
    }
    if (Object.keys(fields).length) {
      const { error } = await admin.from('users').update(fields).eq('id', id)
      if (error) throw error
    }

    return Response.json({ ok: true })
  } catch (e) {
    return jsonError(e)
  }
}

// DELETE /api/admin/employees/{id} — ADMIN. Remove an employee: their login is
// deleted (they can no longer sign in) but the row is kept inactive, so every
// meeting they recorded stays in the app and the sheet.
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await requireAdmin(request)
    const { id } = await ctx.params
    if (id === caller.id) throw new HttpError(400, 'You cannot remove your own account')

    const admin = supabaseAdmin()
    const { data: target } = await admin
      .from('users')
      .select('id, role, auth_id, is_active')
      .eq('id', id)
      .single()
    if (!target || !target.is_active) throw new HttpError(404, 'Employee not found')
    if (target.role === 'admin' && (await activeAdminCount()) <= 1) {
      throw new HttpError(400, 'There must always be at least one admin')
    }

    // Deactivate first (blocks API access immediately), then delete the login.
    const { error } = await admin.from('users').update({ is_active: false }).eq('id', id)
    if (error) throw error
    if (target.auth_id) {
      const { error: delErr } = await admin.auth.admin.deleteUser(target.auth_id)
      if (delErr) throw delErr
    }
    return Response.json({ ok: true })
  } catch (e) {
    return jsonError(e)
  }
}
