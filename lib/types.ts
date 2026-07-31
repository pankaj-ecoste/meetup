export type UserBrief = {
  id: string
  name: string
  email: string
  company_id: number
  company_name: string
}

export type UserProfile = UserBrief & {
  phone?: string
  designation_id?: string
  capability_tier?: string
  is_active: boolean
}

export type TaskStatus = 'open' | 'completed' | 'overdue'
export type TaskSource = 'task_delegation' | 'meeting'

export type TaskResponse = {
  id: string
  source: TaskSource
  meeting_id?: string
  assignor_id: string
  assignee_id: string
  description: string
  deadline: string
  original_deadline: string
  report_to_id: string
  status: TaskStatus
  completed_at?: string
  completion_note?: string
  created_at: string
  updated_at: string
  assignee_name?: string
  assignor_name?: string
  report_to_name?: string
  company_name?: string
}

export type DashboardCounts = {
  given_open: number
  received_open: number
  completed: number
  overdue: number
}

export type ExtensionStatus = 'requested' | 'approved' | 'denied'

export type ExtensionResponse = {
  id: string
  task_id: string
  requested_by: string
  reason: string
  proposed_deadline: string
  status: ExtensionStatus
  decided_by?: string
  decided_at?: string
  created_at: string
}

export type MeetingResponse = {
  id: string
  recorded_by: string
  company_id: number
  mom_summary?: string
  audio_url?: string
  created_at: string
  task_count: number
}

export type SharedMeetingRow = {
  id: string
  mom_summary?: string
  created_at: string
  task_count: number
  shared_by_name: string
  shared_at: string
}

export type IdeaResponse = {
  id: string
  recorded_by: string
  summary: string
  tags: string[]
  created_at: string
  recorder_name?: string
  company_name?: string
}

export type CompanyBrief = {
  id: number
  name: string
}

export type DesignationBrief = {
  id: string
  name: string
}

export type EmployeeRow = {
  id: string
  name: string
  email: string
  phone?: string
  is_active: boolean
  password_set: boolean
  company_id: number
  company_name: string
  designation_id?: string
  designation_name: string
  created_at: string
}

export type EmployeesResponse = {
  employees: EmployeeRow[]
  companies: CompanyBrief[]
  designations: DesignationBrief[]
}

export type TodaySnapshot = {
  assigned_today: number
  completed_today: number
  pending_now: number
}

export type LeadershipTaskRow = {
  task_id: string
  source: TaskSource
  status: TaskStatus
  assigned_date: string
  deadline: string
  assignor_id: string
  assignor_name: string
  assignor_email: string
  assignee_id: string
  assignee_name: string
  assignee_email: string
  company_id: number
  company_name: string
}

export type PerformanceRow = {
  user_id: string
  name: string
  email: string
  company_name?: string
  total_tasks: number
  completed_tasks: number
  on_time_tasks: number
  on_time_pct?: number
  overdue_count: number
  avg_days_to_complete?: number
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

// A meeting task can name more than one doer in a single utterance
// ("Rahul and Priya, finish this by Friday") — doer_names carries all of
// them; ReviewForm fans this out into one task-draft card per name.
export type ExtractedMeetingTask = {
  doer_names?: string[]
  description: string
  deadline?: string
  report_to_name?: string
}

// One entry per anonymous AssemblyAI speaker label. guessed_name is
// Claude's best-effort inference from what was actually said (self
// introductions, being addressed by name) — never from voice, and null
// when nothing in the transcript gives it away. The reviewer confirms or
// corrects every label before saving.
export type ExtractedSpeaker = {
  label: string
  guessed_name?: string | null
}

export type ExtractedMeeting = {
  mom_summary: string
  speakers?: ExtractedSpeaker[]
  tasks: ExtractedMeetingTask[]
}

// Task delegation now extracts a list too (plan.md §8.12) — one recording
// can name several tasks, each possibly assigned to several people, so it
// reuses the exact same per-task shape the meeting flow already established.
export type ExtractedTaskDelegation = {
  tasks: ExtractedMeetingTask[]
}

export type ExtractedIdea = {
  summary: string
  tags: string[]
}
