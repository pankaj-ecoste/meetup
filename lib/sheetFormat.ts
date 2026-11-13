import { MAX_TASKS, type MeetingTask } from './types'

// Pure helpers (no secrets, no server-only) so they can be unit-checked.
// The sheet layout below is the contract from plan.md §12.0 — change it there
// first. Every department tab has exactly these 16 columns.

export const SHEET_HEADERS: string[] = [
  'Meeting ID',
  'Date',
  'Meeting Title',
  'MOM',
  'Recorded By',
  ...Array.from({ length: MAX_TASKS }, (_, i) => `Task ${i + 1}`),
  'Synced At',
]

export const COL_COUNT = SHEET_HEADERS.length // 16 → A..P

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

/** '2026-11-20' → '20-Nov-2026'. Anything unparseable is returned as-is. */
export function formatDeadline(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const month = MONTHS[Number(m[2]) - 1]
  if (!month) return iso
  return `${m[3]}-${month}-${m[1]}`
}

/** '13-Nov-2026 3:45 PM' in IST (fixed UTC+5:30, no DST). */
export function formatIst(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS)
  const day = String(ist.getUTCDate()).padStart(2, '0')
  const h24 = ist.getUTCHours()
  const h12 = h24 % 12 || 12
  const min = String(ist.getUTCMinutes()).padStart(2, '0')
  return `${day}-${MONTHS[ist.getUTCMonth()]}-${ist.getUTCFullYear()} ${h12}:${min} ${h24 >= 12 ? 'PM' : 'AM'}`
}

/** One task → the multi-line cell text. Empty string for a blank task. */
export function formatTaskCell(t: MeetingTask): string {
  if (!t.assignee.trim() && !t.description.trim()) return ''
  return [
    `Assignee: ${t.assignee.trim()}`,
    `Task: ${t.description.trim()}`,
    `Deadline: ${formatDeadline(t.deadline)}`,
    `Reporting to: ${t.reporting_to.trim()}`,
  ].join('\n')
}

export type SheetMeeting = {
  id: string
  created_at: string
  title: string
  mom: string
  recorded_by_name: string
  tasks: MeetingTask[]
}

/** The full 16-cell row for a meeting. Unused task cells stay ''. */
export function meetingToRow(m: SheetMeeting, syncedAt: Date): string[] {
  const taskCells = Array.from({ length: MAX_TASKS }, (_, i) =>
    m.tasks[i] ? formatTaskCell(m.tasks[i]) : '',
  )
  return [
    m.id,
    formatIst(new Date(m.created_at)),
    m.title,
    m.mom,
    m.recorded_by_name,
    ...taskCells,
    formatIst(syncedAt),
  ]
}

// Google Sheets tab titles: ≤100 chars, none of  [ ] * ? : / \  and not blank.
// We are stricter (the department name IS the tab name): letters, digits,
// spaces and a few safe symbols, ≤50 chars.
const DEPT_NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} &._()-]{0,49}$/u

export function validateDepartmentName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ')
  return DEPT_NAME_RE.test(name) ? name : null
}

/** Pull the spreadsheet id out of a Google Sheets URL (or accept a bare id). */
export function parseSheetId(input: string): string | null {
  const s = input.trim()
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/.exec(s)
  if (m) return m[1]
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : null
}
