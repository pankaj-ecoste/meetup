import { requireUser, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'

// GET /api/meetings/{id} — one meeting. Visible to its recorder and to admins.
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request)
    const { id } = await ctx.params

    const { data: m } = await supabaseAdmin()
      .from('meetings')
      .select(
        'id, title, mom, tasks, department_name, recorded_by, recorded_by_name, recorded_by_email, created_at, sheet_status, sheet_error, sheet_synced_at',
      )
      .eq('id', id)
      .single()
    if (!m || (m.recorded_by !== user.id && user.role !== 'admin')) {
      throw new HttpError(404, 'Meeting not found')
    }

    return Response.json({
      id: m.id,
      title: m.title,
      mom: m.mom,
      tasks: m.tasks,
      department_name: m.department_name,
      recorded_by_name: m.recorded_by_name,
      recorded_by_email: m.recorded_by_email,
      created_at: m.created_at,
      sheet_status: m.sheet_status,
      sheet_error: m.sheet_error,
      sheet_synced_at: m.sheet_synced_at,
    })
  } catch (e) {
    return jsonError(e)
  }
}
