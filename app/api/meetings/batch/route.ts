import { requireUser, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'

type BatchTask = {
  assignee_id: string
  description: string
  deadline: string
  original_deadline: string
  report_to_id: string
}
type BatchBody = {
  mom_summary?: string
  audio_url?: string | null
  transcript?: string | null
  tasks?: BatchTask[]
  shared_with?: string[]
}

// POST /api/meetings/batch — save a meeting record + all its tasks in one call.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const body = (await request.json().catch(() => ({}))) as BatchBody
    const admin = supabaseAdmin()

    // Standard employees may only delegate within their own company; CEO
    // (leadership tier) can delegate across all three.
    if (user.capability_tier !== 'leadership') {
      const ids = (body.tasks ?? []).flatMap((t) => [t.assignee_id, t.report_to_id])
      if (ids.length > 0) {
        const { data: targets, error: targetsErr } = await admin
          .from('users')
          .select('id, company_id')
          .in('id', ids)
        if (targetsErr) throw targetsErr
        const outsideCompany = (targets ?? []).some((t) => t.company_id !== user.company_id)
        if (outsideCompany) {
          throw new HttpError(403, 'You can only delegate tasks within your own company')
        }
      }
    }

    const { data: meetingRows, error: mErr } = await admin
      .from('meetings')
      .insert({
        recorded_by: user.id,
        company_id: user.company_id,
        transcript: body.transcript ?? null,
        audio_url: body.audio_url ?? null,
        mom_summary: body.mom_summary,
      })
      .select('*')
    if (mErr) throw mErr
    const meeting = meetingRows![0]

    const taskRows = (body.tasks ?? []).map((t) => ({
      source: 'meeting',
      meeting_id: meeting.id,
      assignor_id: user.id,
      assignee_id: t.assignee_id,
      description: t.description,
      deadline: t.deadline,
      original_deadline: t.original_deadline,
      report_to_id: t.report_to_id,
      status: 'open',
    }))

    let tasks: unknown[] = []
    if (taskRows.length > 0) {
      const { data, error: tErr } = await admin.from('tasks').insert(taskRows).select('*')
      if (tErr) throw tErr
      tasks = data ?? []
    }

    // Sharing works even for a MoM-only meeting with zero tasks — dedupe
    // and drop a self-share, which would be meaningless.
    const recipients = [...new Set(body.shared_with ?? [])].filter((id) => id !== user.id)
    if (recipients.length > 0) {
      const { error: shareErr } = await admin.from('meeting_shares').insert(
        recipients.map((shared_with_user_id) => ({
          meeting_id: meeting.id,
          shared_with_user_id,
          shared_by: user.id,
        })),
      )
      if (shareErr) throw shareErr
    }

    return Response.json({ meeting, tasks }, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
