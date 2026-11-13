'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { MAX_TASKS, type ExtractedMeeting, type MeetingTask, type SheetStatus } from '@/lib/types'

export type SaveResult = { id: string; sheet_status: SheetStatus; sheet_error: string | null }

type Props = {
  token: string
  jobId: string
  departmentId: string
  departmentName: string
  initial: Partial<ExtractedMeeting>
  transcript: string
  names: string[]
  onSaved: (r: SaveResult) => void
}

type Draft = MeetingTask & { key: number }

const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
const LABEL = 'block text-xs font-medium text-gray-600 mb-1'

// The review step: everything Claude produced is editable. What is on screen
// when the user clicks Save is exactly what goes to Supabase and the sheet.
export default function MeetingReview({
  token,
  jobId,
  departmentId,
  departmentName,
  initial,
  transcript,
  names,
  onSaved,
}: Props) {
  const [title, setTitle] = useState(initial.title ?? '')
  const [mom, setMom] = useState(initial.mom ?? '')
  const [nextKey, setNextKey] = useState((initial.tasks?.length ?? 0) + 1)
  const [tasks, setTasks] = useState<Draft[]>(
    (initial.tasks ?? []).slice(0, MAX_TASKS).map((t, i) => ({ ...t, key: i })),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function patch(key: number, p: Partial<MeetingTask>) {
    setTasks((ts) => ts.map((t) => (t.key === key ? { ...t, ...p } : t)))
  }

  function addTask() {
    if (tasks.length >= MAX_TASKS) return
    setTasks((ts) => [...ts, { key: nextKey, assignee: '', description: '', deadline: null, reporting_to: '' }])
    setNextKey((k) => k + 1)
  }

  async function save() {
    if (!title.trim()) {
      setError('Please give the meeting a title.')
      return
    }
    setError('')
    setSaving(true)
    try {
      const result = (await api.saveMeeting(token, {
        job_id: jobId,
        department_id: departmentId,
        title,
        mom,
        tasks: tasks.map(({ assignee, description, deadline, reporting_to }) => ({
          assignee,
          description,
          deadline,
          reporting_to,
        })),
      })) as SaveResult
      onSaved(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the meeting')
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-500">
        Department: <span className="font-medium text-gray-800">{departmentName}</span> · Check and edit
        anything below, then Save.
      </p>

      <datalist id="employee-names">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <div>
        <label className={LABEL}>Meeting title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={INPUT} />
      </div>

      <div>
        <label className={LABEL}>Minutes of meeting (MOM)</label>
        <textarea
          value={mom}
          onChange={(e) => setMom(e.target.value)}
          rows={12}
          maxLength={20000}
          className={`${INPUT} font-mono text-[13px] leading-relaxed`}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900">
            Action tasks <span className="text-gray-400 font-normal">({tasks.length}/{MAX_TASKS})</span>
          </h3>
          <button
            type="button"
            onClick={addTask}
            disabled={tasks.length >= MAX_TASKS}
            className="text-sm text-indigo-600 font-medium hover:text-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Add task
          </button>
        </div>

        {tasks.length === 0 && (
          <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-3">
            No action tasks were found in this meeting. You can add one if something was missed.
          </p>
        )}

        <div className="space-y-3">
          {tasks.map((t, i) => (
            <div key={t.key} className="bg-white border border-gray-200 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-600">Task {i + 1}</span>
                <button
                  type="button"
                  onClick={() => setTasks((ts) => ts.filter((x) => x.key !== t.key))}
                  className="text-xs text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
              <div>
                <label className={LABEL}>Assignee</label>
                <input
                  list="employee-names"
                  value={t.assignee}
                  onChange={(e) => patch(t.key, { assignee: e.target.value })}
                  className={INPUT}
                />
              </div>
              <div>
                <label className={LABEL}>Task</label>
                <textarea
                  value={t.description}
                  onChange={(e) => patch(t.key, { description: e.target.value })}
                  rows={2}
                  className={INPUT}
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={LABEL}>Deadline</label>
                  <input
                    type="date"
                    value={t.deadline ?? ''}
                    onChange={(e) => patch(t.key, { deadline: e.target.value || null })}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className={LABEL}>Reporting to</label>
                  <input
                    list="employee-names"
                    value={t.reporting_to}
                    onChange={(e) => patch(t.key, { reporting_to: e.target.value })}
                    className={INPUT}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {transcript && (
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-500">Show transcript</summary>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-64 overflow-y-auto">
            {transcript}
          </pre>
        </details>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={save}
        disabled={saving || !title.trim()}
        className="w-full bg-indigo-600 text-white rounded-lg py-3 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
