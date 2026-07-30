'use client'

import { useState, useRef, useEffect } from 'react'
import type {
  UserBrief,
  ExtractedTask,
  ExtractedMeeting,
  ExtractedMeetingTask,
  ExtractedIdea,
} from '@/lib/types'
import { api } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'

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
  onRemove,
}: {
  draft: TaskDraft
  onChange: (d: TaskDraft) => void
  users: UserBrief[]
  submitted: boolean
  index?: number
  onRemove?: () => void
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
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Task {index + 1}</p>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Remove
            </button>
          )}
        </div>
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
  transcript?: string
  users: UserBrief[]
  onDone: () => void
  // True when the user chose to type the details in directly, skipping the
  // record → transcribe → extract pipeline entirely. `result` is then just
  // `{}` — every field starts blank instead of AI-prefilled.
  manual?: boolean
}

export default function ReviewForm({ jobType, result, transcript, users, onDone, manual = false }: ReviewFormProps) {
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Reviewing a long meeting (many tasks, manual assignee lookups) can take
  // long enough that a token captured once at page load has since expired —
  // grab a fresh one right at submit time instead of trusting an old one.
  async function freshToken(): Promise<string> {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Your session expired — please sign in again.')
    return session.access_token
  }

  // ── Task delegation state ──
  const initTask = (): TaskDraft => {
    const r = result as Partial<ExtractedTask>
    return {
      description: r.description?.trim() || transcript || '',
      assigneeId: bestMatch(r.doer_name, users),
      deadline: parseDeadline(r.deadline),
      reportToId: bestMatch(r.report_to_name, users),
    }
  }
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(initTask)

  // ── Meeting state ──
  // One utterance can name several people at once ("Rahul and Priya, by
  // Friday") — fan each doer_names entry out into its own task-draft card,
  // sharing the same description/deadline/report-to, matching the fact that
  // `tasks` is one row per assignee.
  const initMeetingTasks = (): TaskDraft[] => {
    const r = result as Partial<ExtractedMeeting>
    return (r.tasks ?? []).flatMap((t: ExtractedMeetingTask) => {
      const names = t.doer_names && t.doer_names.length > 0 ? t.doer_names : [undefined]
      return names.map(name => ({
        description: t.description ?? '',
        assigneeId: bestMatch(name, users),
        deadline: parseDeadline(t.deadline),
        reportToId: bestMatch(t.report_to_name, users),
      }))
    })
  }
  const [momSummary, setMomSummary] = useState(
    (result as Partial<ExtractedMeeting>).mom_summary?.trim() || transcript || ''
  )
  const [meetingTasks, setMeetingTasks] = useState<TaskDraft[]>(initMeetingTasks)

  function addMeetingTask() {
    setMeetingTasks(prev => [...prev, { description: '', assigneeId: '', deadline: '', reportToId: '' }])
  }
  function removeMeetingTask(index: number) {
    setMeetingTasks(prev => prev.filter((_, i) => i !== index))
  }

  // Who's who: one row per AssemblyAI speaker label, pre-filled with
  // Claude's best guess and correctable before saving.
  type SpeakerMap = { label: string; assigneeId: string }
  const [speakerMap, setSpeakerMap] = useState<SpeakerMap[]>(() =>
    ((result as Partial<ExtractedMeeting>).speakers ?? []).map(s => ({
      label: s.label,
      assigneeId: bestMatch(s.guessed_name ?? undefined, users),
    }))
  )

  // Who this MoM gets shared with — optional, any number of people.
  const [sharedWith, setSharedWith] = useState<string[]>([])
  function addRecipient(id: string) {
    setSharedWith(prev => (prev.includes(id) ? prev : [...prev, id]))
  }
  function removeRecipient(id: string) {
    setSharedWith(prev => prev.filter(x => x !== id))
  }

  // Replace every "Speaker A" style label with the confirmed real name, so
  // the saved transcript/MoM read naturally instead of staying anonymous.
  function substituteSpeakers(text: string): string {
    return speakerMap.reduce((acc, s) => {
      const name = users.find(u => u.id === s.assigneeId)?.name
      return name ? acc.split(`Speaker ${s.label}`).join(name) : acc
    }, text)
  }

  // ── Idea state ──
  const [ideaSummary, setIdeaSummary] = useState(
    (result as Partial<ExtractedIdea>).summary?.trim() || transcript || ''
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
        const token = await freshToken()
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
        const token = await freshToken()
        const tasks = meetingTasks.map(t => ({
          source: 'meeting' as const,
          assignee_id: t.assigneeId,
          description: t.description.trim(),
          deadline: new Date(t.deadline).toISOString(),
          original_deadline: new Date(t.deadline).toISOString(),
          report_to_id: t.reportToId,
        }))
        await api.createMeetingBatch(token, {
          mom_summary: substituteSpeakers(momSummary),
          transcript: transcript ? substituteSpeakers(transcript) : undefined,
          tasks,
          shared_with: sharedWith,
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
        const token = await freshToken()
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

  const [showTranscript, setShowTranscript] = useState(false)

  // ── Render ──
  return (
    <div className="space-y-5">
      {transcript && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowTranscript(s => !s)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50 hover:bg-gray-100"
          >
            <span>What we heard (tap to {showTranscript ? 'hide' : 'view'})</span>
            <span>{showTranscript ? '▲' : '▼'}</span>
          </button>
          {showTranscript && (
            <p className="px-3 py-2 text-sm text-gray-700 whitespace-pre-wrap">{transcript}</p>
          )}
        </div>
      )}

      {jobType === 'task_delegation' && (
        <>
          <div className="flex items-center gap-2 text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2">
            <span>✓</span>
            <span>{manual ? 'Fill in the task details below.' : 'Recording analysed. Review and confirm below.'}</span>
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

          {speakerMap.length > 0 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Who&apos;s who in this recording</label>
              <p className="text-xs text-gray-400 -mt-1">
                We detected {speakerMap.length} distinct speaker{speakerMap.length !== 1 ? 's' : ''}. Confirm or correct each one.
              </p>
              {speakerMap.map((s, i) => (
                <div key={s.label} className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500 w-20 flex-shrink-0">Speaker {s.label}</span>
                  <div className="flex-1">
                    <UserDropdown
                      users={users}
                      value={s.assigneeId}
                      onChange={id => {
                        const next = [...speakerMap]
                        next[i] = { ...next[i], assigneeId: id }
                        setSpeakerMap(next)
                      }}
                      placeholder="Who is this?"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Minutes of Meeting</label>
            <textarea
              value={momSummary}
              onChange={e => setMomSummary(e.target.value)}
              rows={8}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Share with (optional)</label>
            <div className="flex gap-2 mb-2 flex-wrap">
              {sharedWith.map(id => {
                const u = users.find(u => u.id === id)
                if (!u) return null
                return (
                  <span
                    key={id}
                    className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2.5 py-0.5 flex items-center gap-1"
                  >
                    {u.name}
                    <button type="button" onClick={() => removeRecipient(id)} className="hover:text-red-500">×</button>
                  </span>
                )
              })}
            </div>
            <UserDropdown
              users={users.filter(u => !sharedWith.includes(u.id))}
              value=""
              onChange={addRecipient}
              placeholder="Add a person to share this MoM with…"
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
                onRemove={() => removeMeetingTask(i)}
                users={users}
                submitted={submitted}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={addMeetingTask}
            className="w-full border border-dashed border-gray-300 rounded-xl py-2.5 text-sm text-indigo-600 font-medium hover:bg-indigo-50"
          >
            + Add task
          </button>
        </>
      )}

      {jobType === 'idea' && (
        <>
          <div className="flex items-center gap-2 text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2">
            <span>✓</span>
            <span>{manual ? 'Type your idea below.' : 'Idea captured. Review and save.'}</span>
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
