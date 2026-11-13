import { requireUser, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import { syncMeeting } from '@/lib/server/meetingSync'
import { MAX_TASKS, type MeetingRow, type MeetingTask } from '@/lib/types'

export const runtime = 'nodejs'

const PAGE_SIZE = 20
const LIST_COLS =
  'id, title, department_name, recorded_by_name, created_at, sheet_status, tasks'

// GET /api/meetings?page=&all=1 — the caller's own meetings, newest first.
// Admins may pass all=1 to see everyone's.
export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    const sp = new URL(request.url).searchParams
    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)
    const offset = (page - 1) * PAGE_SIZE

    let query = supabaseAdmin()
      .from('meetings')
      .select(LIST_COLS)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
    if (!(user.role === 'admin' && sp.get('all') === '1')) {
      query = query.eq('recorded_by', user.id)
    }

    const { data, error } = await query
    if (error) throw error

    const rows: MeetingRow[] = (data ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      department_name: m.department_name,
      recorded_by_name: m.recorded_by_name,
      created_at: m.created_at,
      sheet_status: m.sheet_status,
      task_count: Array.isArray(m.tasks) ? m.tasks.length : 0,
    }))
    return Response.json(rows)
  } catch (e) {
    return jsonError(e)
  }
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function cleanTasks(input: unknown): MeetingTask[] {
  if (!Array.isArray(input)) return []
  const out: MeetingTask[] = []
  for (const t of input) {
    if (!t || typeof t !== 'object') continue
    const r = t as Record<string, unknown>
    const dl = str(r.deadline, 10)
    const task: MeetingTask = {
      assignee: str(r.assignee, 200),
      description: str(r.description, 2000),
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(dl) ? dl : null,
      reporting_to: str(r.reporting_to, 200),
    }
    // A completely empty card is dropped rather than written as a blank cell.
    if (task.assignee || task.description || task.reporting_to) out.push(task)
  }
  if (out.length > MAX_TASKS) throw new HttpError(400, `A meeting can have at most ${MAX_TASKS} tasks`)
  return out
}

// POST /api/meetings — the Save button. Supabase first, then the sheet.
// Idempotent per recording job: saving the same job twice returns the first
// meeting instead of creating a duplicate.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) throw new HttpError(400, 'Invalid request body')

    const jobId = str(body.job_id, 64)
    const departmentId = str(body.department_id, 64)
    const title = str(body.title, 200)
    const mom = str(body.mom, 20000)
    if (!jobId) throw new HttpError(400, 'Missing recording job')
    if (!departmentId) throw new HttpError(400, 'Department is required')
    if (!title) throw new HttpError(400, 'Title is required')
    const tasks = cleanTasks(body.tasks)

    const admin = supabaseAdmin()

    // The job must be this user's own, finished meeting job.
    const { data: job } = await admin
      .from('recording_jobs')
      .select('id, user_id, job_type, status, transcript')
      .eq('id', jobId)
      .single()
    if (!job || job.user_id !== user.id || job.job_type !== 'meeting') {
      throw new HttpError(404, 'Recording not found')
    }
    if (job.status !== 'done') throw new HttpError(400, 'That recording is not ready yet')

    // Already saved? Return it (double-click / retry safe).
    const { data: existing } = await admin
      .from('meetings')
      .select('id, sheet_status, sheet_error')
      .eq('job_id', jobId)
      .maybeSingle()
    if (existing) return Response.json(existing)

    const { data: dept } = await admin
      .from('departments')
      .select('id, name, is_active')
      .eq('id', departmentId)
      .single()
    if (!dept || !dept.is_active) throw new HttpError(400, 'Unknown or inactive department')

    const { data: meeting, error } = await admin
      .from('meetings')
      .insert({
        job_id: jobId,
        recorded_by: user.id,
        recorded_by_name: user.name,
        recorded_by_email: user.email,
        department_id: dept.id,
        department_name: dept.name,
        title,
        mom,
        tasks,
        transcript: job.transcript ?? null,
      })
      .select('id')
      .single()
    if (error) {
      if (error.code === '23505') {
        const { data: again } = await admin
          .from('meetings')
          .select('id, sheet_status, sheet_error')
          .eq('job_id', jobId)
          .single()
        if (again) return Response.json(again)
      }
      throw error
    }

    // Meeting is safe in Supabase; now the sheet. Never throws.
    const sync = await syncMeeting(meeting.id)
    return Response.json(
      { id: meeting.id, sheet_status: sync.status, sheet_error: sync.error },
      { status: 201 },
    )
  } catch (e) {
    return jsonError(e)
  }
}
