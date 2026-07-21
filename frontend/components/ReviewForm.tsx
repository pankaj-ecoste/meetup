'use client'

import { useState, useRef, useEffect } from 'react'
import type {
  UserBrief,
  ExtractedTask,
  ExtractedMeeting,
  ExtractedIdea,
} from '@/lib/types'
import { api } from '@/lib/api'

// ── User dropdown ─────────────────────────────────────────────────────────────

function UserDropdown({
  users,
  value,
  onChange,
  placeholder,
  error,
}: {
  users: UserBrief[]
  value: string
  onChange: (id: string) => void
  placeholder: string
  error?: boolean
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selected = users.find(u => u.id === value)
  const filtered = users.filter(u =>
    `${u.name} ${u.company_name}`.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch('') }}
        className={`w-full text-left border rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
          error ? 'border-red-400 bg-red-50' : 'border-gray-300'
        }`}
      >
        {selected
          ? <span>{selected.name} <span className="text-gray-400">· {selected.company_name}</span></span>
          : <span className="text-gray-400">{placeholder}</span>}
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <ul className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-400">No match</li>
            )}
            {filtered.map(u => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => { onChange(u.id); setOpen(false) }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 ${
                    u.id === value ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'
                  }`}
                >
                  {u.name} <span className="text-gray-400 text-xs">· {u.company_name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDeadline(raw?: string): string {
  if (!raw) return ''
  try {
    const d = new Date(raw)
    if (isNaN(d.getTime())) return ''
    // Return local datetime-local string
    const offset = d.getTimezoneOffset()
    const local = new Date(d.getTime() - offset * 60000)
    return local.toISOString().slice(0, 16)
  } catch {
    return ''
  }
}

function bestMatch(name: string | undefined, users: UserBrief[]): string {
  if (!name) return ''
  const q = name.toLowerCase()
  const exact = users.find(u => u.name.toLowerCase() === q)
  if (exact) return exact.id
  const partial = users.find(u =>
    u.name.toLowerCase().includes(q) || q.includes(u.name.toLowerCase().split(' ')[0])
  )
  return partial?.id ?? ''
}

// ── Task sub-form ─────────────────────────────────────────────────────────────

type TaskDraft = {
  description: string
  assigneeId: string
  deadline: string
  reportToId: string
}

function TaskDraftForm({
  draft,
  onChange,
  users,
  submitted,
  index,
}: {
  draft: TaskDraft
  onChange: (d: TaskDraft) => void
  users: UserBrief[]
  submitted: boolean
  index?: number
}) {
  const missing = {
    description: !draft.description.trim(),
    assigneeId: !draft.assigneeId,
    deadline: !draft.deadline,
    reportToId: !draft.reportToId,
  }
  const hasError = submitted && Object.values(missing).some(Boolean)

  return (
    <div className={`space-y-3 ${index !== undefined ? 'border border-gray-200 rounded-xl p-4' : ''}`}>
      {index !== undefined && (
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Task {index + 1}</p>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description {submitted && missing.description && <span className="text-red-500">— required</span>}
        </label>
        <textarea
          value={draft.description}
          onChange={e => onChange({ ...draft, description: e.target.value })}
          rows={2}
          className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
            submitted && missing.description ? 'border-red-400 bg-red-50' : 'border-gray-300'
          }`}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Doer {submitted && missing.assigneeId && <span className="text-red-500">— required</span>}
        </label>
        <UserDropdown
          users={users}
          value={draft.assigneeId}
          onChange={id => onChange({ ...draft, assigneeId: id })}
          placeholder="Select doer…"
          error={submitted && missing.assigneeId}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Deadline {submitted && missing.deadline && <span className="text-red-500">— required</span>}
        </label>
        <input
          type="datetime-local"
          value={draft.deadline}
          onChange={e => onChange({ ...draft, deadline: e.target.value })}
          className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
            submitted && missing.deadline ? 'border-red-400 bg-red-50' : 'border-gray-300'
          }`}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Report to {submitted && missing.reportToId && <span className="text-red-500">— required</span>}
        </label>
        <UserDropdown
          users={users}
          value={draft.reportToId}
          onChange={id => onChange({ ...draft, reportToId: id })}
          placeholder="Select person…"
          error={submitted && missing.reportToId}
        />
      </div>

      {hasError && (
        <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          Fill in all required fields before submitting.
        </p>
      )}
    </div>
  )
}

// ── Main ReviewForm ────────────────────────────────────────────────────────────

type ReviewFormProps = {
  jobType: 'task_delegation' | 'meeting' | 'idea'
  result: Record<string, unknown>
  users: UserBrief[]
  token: string
  onDone: () => void
}

export default function ReviewForm({ jobType, result, users, token, onDone }: ReviewFormProps) {
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // ── Task delegation state ──
  const initTask = (): TaskDraft => {
    const r = result as Partial<ExtractedTask>
    return {
      description: r.description ?? '',
      assigneeId: bestMatch(r.doer_name, users),
      deadline: parseDeadline(r.deadline),
      reportToId: bestMatch(r.report_to_name, users),
    }
  }
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(initTask)

  // ── Meeting state ──
  const initMeetingTasks = (): TaskDraft[] => {
    const r = result as Partial<ExtractedMeeting>
    return (r.tasks ?? []).map(t => ({
      description: t.description ?? '',
      assigneeId: bestMatch(t.doer_name, users),
      deadline: parseDeadline(t.deadline),
      reportToId: bestMatch(t.report_to_name, users),
    }))
  }
  const [momSummary, setMomSummary] = useState(
    (result as Partial<ExtractedMeeting>).mom_summary ?? ''
  )
  const [meetingTasks, setMeetingTasks] = useState<TaskDraft[]>(initMeetingTasks)

  // ── Idea state ──
  const [ideaSummary, setIdeaSummary] = useState(
    (result as Partial<ExtractedIdea>).summary ?? ''
  )
  const [ideaTags, setIdeaTags] = useState<string[]>(
    (result as Partial<ExtractedIdea>).tags ?? []
  )
  const [tagInput, setTagInput] = useState('')

  // ── Submit logic ──
  async function submit() {
    setSubmitted(true)
    setError('')

    if (jobType === 'task_delegation') {
      const { description, assigneeId, deadline, reportToId } = taskDraft
      if (!description.trim() || !assigneeId || !deadline || !reportToId) return
      setSubmitting(true)
      try {
        const dl = new Date(deadline).toISOString()
        await api.createTask(token, {
          source: 'task_delegation',
          assignee_id: assigneeId,
          description: description.trim(),
          deadline: dl,
          original_deadline: dl,
          report_to_id: reportToId,
        })
        onDone()
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setSubmitting(false)
      }
    }

    else if (jobType === 'meeting') {
      const allValid = meetingTasks.every(
        t => t.description.trim() && t.assigneeId && t.deadline && t.reportToId
      )
      if (!allValid) return
      setSubmitting(true)
      try {
        const tasks = meetingTasks.map(t => ({
          source: 'meeting' as const,
          assignee_id: t.assigneeId,
          description: t.description.trim(),
          deadline: new Date(t.deadline).toISOString(),
          original_deadline: new Date(t.deadline).toISOString(),
          report_to_id: t.reportToId,
        }))
        await api.createMeetingBatch(token, {
          mom_summary: momSummary,
          tasks,
        })
        onDone()
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setSubmitting(false)
      }
    }

    else if (jobType === 'idea') {
      if (!ideaSummary.trim()) return
      setSubmitting(true)
      try {
        await api.createIdea(token, {
          summary: ideaSummary.trim(),
          tags: ideaTags,
        })
        onDone()
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setSubmitting(false)
      }
    }
  }

  function addTag() {
    const t = tagInput.trim()
    if (t && !ideaTags.includes(t)) setIdeaTags([...ideaTags, t])
    setTagInput('')
  }

  // ── Render ──
  return (
    <div className="space-y-5">
      {jobType === 'task_delegation' && (
        <>
          <div className="flex items-center gap-2 text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2">
            <span>✓</span>
            <span>Recording analysed. Review and confirm below.</span>
          </div>
          <TaskDraftForm
            draft={taskDraft}
            onChange={setTaskDraft}
            users={users}
            submitted={submitted}
          />
        </>
      )}

      {jobType === 'meeting' && (
        <>
          <div className="flex items-center gap-2 text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2">
            <span>✓</span>
            <span>Meeting analysed — {meetingTasks.length} task{meetingTasks.length !== 1 ? 's' : ''} found.</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Minutes of Meeting</label>
            <textarea
              value={momSummary}
              onChange={e => setMomSummary(e.target.value)}
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
            {meetingTasks.map((t, i) => (
              <TaskDraftForm
                key={i}
                index={i}
                draft={t}
                onChange={d => {
                  const next = [...meetingTasks]
                  next[i] = d
                  setMeetingTasks(next)
                }}
                users={users}
                submitted={submitted}
              />
            ))}
          </div>
        </>
      )}

      {jobType === 'idea' && (
        <>
          <div className="flex items-center gap-2 text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2">
            <span>✓</span>
            <span>Idea captured. Review and save.</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Summary {submitted && !ideaSummary.trim() && <span className="text-red-500">— required</span>}
            </label>
            <textarea
              value={ideaSummary}
              onChange={e => setIdeaSummary(e.target.value)}
              rows={4}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                submitted && !ideaSummary.trim() ? 'border-red-400 bg-red-50' : 'border-gray-300'
              }`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
            <div className="flex gap-2 mb-2 flex-wrap">
              {ideaTags.map(tag => (
                <span
                  key={tag}
                  className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2.5 py-0.5 flex items-center gap-1"
                >
                  {tag}
                  <button onClick={() => setIdeaTags(ideaTags.filter(t => t !== tag))} className="hover:text-red-500">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                placeholder="Add a tag, press Enter"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={addTag}
                className="px-3 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Add
              </button>
            </div>
          </div>
        </>
      )}

      {error && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        onClick={submit}
        disabled={submitting}
        className="w-full bg-indigo-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? 'Saving…' : 'Confirm & save'}
      </button>
    </div>
  )
}
