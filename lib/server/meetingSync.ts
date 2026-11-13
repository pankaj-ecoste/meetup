import 'server-only'
import { supabaseAdmin } from './supabaseAdmin'
import { upsertMeetingRow, appendMeetingRowFast, SheetError } from './sheets'
import type { MeetingTask, SheetStatus } from '../types'

/**
 * Push one saved meeting to the linked sheet and record the outcome on the
 * meeting row. NEVER throws: the meeting is already safe in Supabase, so a
 * Google problem only flips sheet_status to 'failed' (admin can retry).
 *
 * `fresh` = this is the first-ever send of a meeting that was inserted a moment
 * ago by the Save click, so its row cannot exist yet and the fast 1-call append
 * is safe. Every retry (admin) leaves it false and takes the careful
 * look-up-by-Meeting-ID path, because an earlier attempt may have written the
 * row before dying.
 */
export async function syncMeeting(
  meetingId: string,
  opts: { fresh?: boolean } = {},
): Promise<{ status: SheetStatus; error: string | null }> {
  const admin = supabaseAdmin()

  const fail = async (msg: string) => {
    await admin.from('meetings').update({ sheet_status: 'failed', sheet_error: msg }).eq('id', meetingId)
    return { status: 'failed' as const, error: msg }
  }

  try {
    const { data: m } = await admin
      .from('meetings')
      .select('id, created_at, title, mom, recorded_by_name, tasks, department_name')
      .eq('id', meetingId)
      .single()
    if (!m) return { status: 'failed', error: 'Meeting not found' }

    const { data: settings } = await admin.from('app_settings').select('sheet_id').eq('id', 1).single()
    const sheetId = settings?.sheet_id as string | null | undefined
    if (!sheetId) return await fail('No sheet is linked yet. An admin must link one in Sheet connection.')

    const write = opts.fresh ? appendMeetingRowFast : upsertMeetingRow
    await write(sheetId, m.department_name, {
      id: m.id,
      created_at: m.created_at,
      title: m.title,
      mom: m.mom,
      recorded_by_name: m.recorded_by_name,
      tasks: (m.tasks ?? []) as MeetingTask[],
    })

    await admin
      .from('meetings')
      .update({
        sheet_status: 'synced',
        sheet_error: null,
        sheet_id: sheetId,
        sheet_synced_at: new Date().toISOString(),
      })
      .eq('id', meetingId)
    return { status: 'synced', error: null }
  } catch (e) {
    const msg = e instanceof SheetError ? e.message : 'Sheet sync failed unexpectedly.'
    if (!(e instanceof SheetError)) console.error('[sheet] sync error:', e)
    return await fail(msg)
  }
}
