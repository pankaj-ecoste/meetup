import { requireAdmin, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import { getLinkedSheet } from '@/lib/server/appSettings'
import { ensureTab, renameTab } from '@/lib/server/sheets'
import { validateDepartmentName } from '@/lib/sheetFormat'

export const runtime = 'nodejs'

// PATCH /api/admin/departments/{id} — ADMIN. Rename and/or activate/deactivate.
// Rename also renames the sheet tab, so existing rows stay with their tab.
// Deactivate only hides it from the dropdown — tab and data are never deleted.
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin(request)
    const { id } = await ctx.params
    const body = (await request.json().catch(() => null)) as {
      name?: string
      is_active?: boolean
    } | null
    if (!body) throw new HttpError(400, 'Invalid request body')

    const admin = supabaseAdmin()
    const { data: dept } = await admin.from('departments').select('id, name').eq('id', id).single()
    if (!dept) throw new HttpError(404, 'Department not found')

    const fields: Record<string, unknown> = {}
    let newName: string | null = null
    if (body.name !== undefined) {
      newName = validateDepartmentName(body.name)
      if (!newName) {
        throw new HttpError(400, 'Department name: letters, numbers, spaces and & . _ ( ) - only, up to 50 characters')
      }
      fields.name = newName
    }
    if (body.is_active !== undefined) fields.is_active = Boolean(body.is_active)

    if (Object.keys(fields).length) {
      const { error } = await admin.from('departments').update(fields).eq('id', id)
      if (error) {
        if (error.code === '23505') throw new HttpError(409, 'A department with this name already exists')
        throw error
      }
    }

    let tab_warning: string | null = null
    const { sheet_id } = await getLinkedSheet()
    if (newName && newName !== dept.name) {
      // Keep each meeting's snapshot in step with its (renamed) tab.
      await admin.from('meetings').update({ department_name: newName }).eq('department_id', id)
      if (sheet_id) {
        try {
          await renameTab(sheet_id, dept.name, newName)
          await ensureTab(sheet_id, newName)
        } catch (e) {
          tab_warning = e instanceof Error ? e.message : 'Could not rename the sheet tab'
        }
      }
    }
    return Response.json({ ok: true, tab_warning })
  } catch (e) {
    return jsonError(e)
  }
}
