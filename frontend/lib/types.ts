export type UserBrief = {
  id: string
  name: string
  email: string
  company_id: string
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
  company_id: string
  mom_summary?: string
  audio_url?: string
  created_at: string
  task_count: number
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

export type ExtractedTask = {
  doer_name?: string
  description: string
  deadline?: string
  report_to_name?: string
}

export type ExtractedMeeting = {
  mom_summary: string
  tasks: ExtractedTask[]
}

export type ExtractedIdea = {
  summary: string
  tags: string[]
}
