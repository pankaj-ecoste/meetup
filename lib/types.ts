export type Role = 'admin' | 'employee'

export type UserBrief = {
  id: string
  name: string
  email: string
}

export type UserProfile = UserBrief & {
  phone?: string
  role: Role
  is_active: boolean
}

export type Department = {
  id: string
  name: string
  is_active: boolean
}

export type EmployeeRow = {
  id: string
  name: string
  email: string
  role: Role
  is_active: boolean
  created_at: string
}

// One action item. Dates are plain `YYYY-MM-DD` (date only — see plan §12.0).
export type MeetingTask = {
  assignee: string
  description: string
  deadline: string | null
  reporting_to: string
}

export const MAX_TASKS = 10

export type SheetStatus = 'pending' | 'synced' | 'failed'

export type MeetingRow = {
  id: string
  title: string
  department_name: string
  recorded_by_name: string
  created_at: string
  sheet_status: SheetStatus
  task_count: number
}

export type MeetingDetail = {
  id: string
  title: string
  mom: string
  tasks: MeetingTask[]
  department_name: string
  recorded_by_name: string
  recorded_by_email: string
  created_at: string
  sheet_status: SheetStatus
  sheet_error: string | null
  sheet_synced_at: string | null
}

export type FailedSync = {
  id: string
  title: string
  department_name: string
  sheet_error: string | null
  created_at: string
}

export type SheetConnection = {
  robot_email: string | null
  sheet_url: string | null
  sheet_id: string | null
  failed: FailedSync[]
}

export type JobStatus = 'pending' | 'transcribing' | 'extracting' | 'done' | 'error'

export type RecordingJob = {
  id: string
  status: JobStatus
  transcript?: string
  result?: Record<string, unknown>
  error_msg?: string
  created_at: string
}

// What Claude + the webhook produce for the review screen.
export type ExtractedMeeting = {
  title: string
  mom: string
  tasks: MeetingTask[]
}
