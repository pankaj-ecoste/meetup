import { requireAdmin, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import { getLinkedSheet } from '@/lib/server/appSettings'
import { ensureTab } from '@/lib/server/sheets'
import { validateDepartmentName } from '@/lib/sheetFormat'
import type { Department } from '@/lib/types'

export const runtime = 'nodejs'

// GET /api/admin/departments — ADMIN. All departments, including inactive.
export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const { data, error } = await supabaseAdmin()
      .from('departments')
      .select('id, name, is_active')
      .order('name')
    if (error) throw error
    return Response.json((data ?? []) as Department[])
  } catch (e) {
    return jsonError(e)
  }
}

// POST /api/admin/departments — ADMIN. Add a department; its sheet tab is
// created automatically (if a sheet is linked — otherwise the tab appears when
// a sheet is connected or the first meeting is written).
export async function POST(request: Request) {
  try {
    await requireAdmin(request)
    const body = (await request.json().catch(() => null)) as { name?: string } | null
    const name = validateDepartmentName(body?.name ?? '')
    if (!name) {
      throw new HttpError(
        400,
        'Department name: letters, numbers, spaces and & . _ ( ) - only, up to 50 characters',
      )
    }

    const { data, error } = await supabaseAdmin()
      .from('departments')
      .insert({ name })
      .select('id, name, is_active')
      .single()
    if (error) {
      if (error.code === '23505') throw new HttpError(409, 'A department with this name already exists')
      throw error
    }

    let tab_warning: string | null = null
    const { sheet_id } = await getLinkedSheet()
    if (sheet_id) {
      try {
        await ensureTab(sheet_id, name)
      } catch (e) {
        tab_warning = e instanceof Error ? e.message : 'Could not create the sheet tab'
      }
    }
    return Response.json({ ...data, tab_warning }, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
