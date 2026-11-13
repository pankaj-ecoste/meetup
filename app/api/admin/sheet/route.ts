import { requireAdmin, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import { getLinkedSheet } from '@/lib/server/appSettings'
import { ensureTab, robotEmail, verifyAccess, SheetError } from '@/lib/server/sheets'
import { parseSheetId } from '@/lib/sheetFormat'

export const runtime = 'nodejs'
export const maxDuration = 60

// GET /api/admin/sheet — ADMIN. Connection status + meetings whose sheet write
// failed (so the admin can see why and retry).
export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const { sheet_id, sheet_url } = await getLinkedSheet()
    const { data: failed } = await supabaseAdmin()
      .from('meetings')
      .select('id, title, department_name, sheet_error, created_at')
      .neq('sheet_status', 'synced')
      .order('created_at', { ascending: false })
      .limit(50)
    return Response.json({
      robot_email: robotEmail(),
      sheet_url,
      sheet_id,
      failed: failed ?? [],
    })
  } catch (e) {
    return jsonError(e)
  }
}

// POST /api/admin/sheet — ADMIN. { url, test? }. Checks the robot can open the
// sheet; unless `test` is true, also creates a tab (with the 16-column header)
// for every active department and makes this the linked sheet. From now on only
// NEW meetings go to it — meetings already in an older sheet stay there.
export async function POST(request: Request) {
  try {
    await requireAdmin(request)
    const body = (await request.json().catch(() => null)) as { url?: string; test?: boolean } | null
    const sheetId = parseSheetId(body?.url ?? '')
    if (!sheetId) throw new HttpError(400, 'That does not look like a Google Sheets link.')

    try {
      await verifyAccess(sheetId)
    } catch (e) {
      throw new HttpError(400, e instanceof SheetError ? e.message : 'Could not open the sheet.')
    }
    if (body?.test) return Response.json({ ok: true, tested: true })

    const admin = supabaseAdmin()
    const { data: depts } = await admin.from('departments').select('name').eq('is_active', true).order('name')
    const warnings: string[] = []
    for (const d of depts ?? []) {
      try {
        await ensureTab(sheetId, d.name)
      } catch (e) {
        warnings.push(`${d.name}: ${e instanceof Error ? e.message : 'tab failed'}`)
      }
    }

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}`
    const { error } = await admin
      .from('app_settings')
      .update({ sheet_id: sheetId, sheet_url: sheetUrl, updated_at: new Date().toISOString() })
      .eq('id', 1)
    if (error) throw error

    return Response.json({ ok: true, sheet_url: sheetUrl, tabs: (depts ?? []).length, warnings })
  } catch (e) {
    return jsonError(e)
  }
}
