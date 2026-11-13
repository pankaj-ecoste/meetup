'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import RecordButton from '@/components/RecordButton'
import MeetingReview, { type SaveResult } from '@/components/MeetingReview'
import ProcessingSteps from '@/components/ProcessingSteps'
import { useRecordingJob } from '@/lib/useRecordingJob'
import type { Department, ExtractedMeeting, UserBrief } from '@/lib/types'

// Home screen = the one job MeetUp does: pick department → record → review → Save.
export default function RecordMeetingPage() {
  const [token, setToken] = useState('')
  const [departments, setDepartments] = useState<Department[]>([])
  const [loaded, setLoaded] = useState(false)
  const [names, setNames] = useState<string[]>([])
  const [departmentId, setDepartmentId] = useState('')
  const [saved, setSaved] = useState<SaveResult | null>(null)
  const { stage, statusLabel, jobId, jobResult, jobTranscript, errMsg, start, reset } =
    useRecordingJob('meeting')

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setToken(session.access_token)
      try {
        setDepartments(await api.departments(session.access_token))
      } catch { /* shown as "no departments" below */ }
      setLoaded(true)
      try {
        const users = (await api.users(session.access_token)) as UserBrief[]
        setNames(users.map((u) => u.name))
      } catch { /* suggestions are optional */ }
    }
    init()
  }, [])

  const department = departments.find((d) => d.id === departmentId)

  if (saved) {
    const ok = saved.sheet_status === 'synced'
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <div className="text-5xl mb-4">{ok ? '✅' : '⚠️'}</div>
        <h2 className="text-xl font-bold mb-2">Meeting saved</h2>
        {ok ? (
          <p className="text-gray-500 text-sm mb-6">
            Added to the <b>{department?.name}</b> sheet.
          </p>
        ) : (
          <p className="text-amber-700 text-sm mb-6">
            Your meeting is saved, but it could not be added to the sheet yet
            {saved.sheet_error ? ` (${saved.sheet_error})` : ''}. An admin can retry it — nothing is lost.
          </p>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => { setSaved(null); reset() }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            Record another
          </button>
          <Link
            href="/meetings"
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            My meetings
          </Link>
        </div>
      </div>
    )
  }

  const busy = stage === 'uploading' || stage === 'pending' || stage === 'transcribing' || stage === 'extracting'

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Record Meeting</h2>
      <p className="text-sm text-gray-500 mb-6">
        Pick your department, then record. We write the title, minutes and action tasks for you to check.
      </p>

      {(stage === 'idle' || stage === 'error') && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Department</label>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Select department…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          {loaded && departments.length === 0 && (
            <p className="text-xs text-amber-700 mt-2">
              No departments yet. Ask an admin to add them (Admin → Departments).
            </p>
          )}
        </div>
      )}

      {stage === 'idle' && (
        <div className="flex flex-col items-center py-4">
          <RecordButton
            onRecordingComplete={start}
            jobType="meeting"
            maxSeconds={3600}
            disabled={!departmentId}
          />
          <p className="text-xs text-gray-400 mt-6">
            {departmentId ? 'Max 60 minutes · pause and resume anytime' : 'Select a department to start recording'}
          </p>
        </div>
      )}

      {busy && (
        <div className="flex flex-col items-center py-12">
          <ProcessingSteps stage={stage} label={statusLabel} />
          <p className="text-gray-400 text-xs mt-4">Longer meetings take up to a minute</p>
        </div>
      )}

      {stage === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
          <p className="text-red-700 font-medium mb-2">Something went wrong</p>
          <p className="text-red-600 text-sm mb-4">{errMsg}</p>
          <button onClick={reset} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
            Try again
          </button>
        </div>
      )}

      {stage === 'review' && jobResult && jobId && department && (
        <MeetingReview
          token={token}
          jobId={jobId}
          departmentId={department.id}
          departmentName={department.name}
          initial={jobResult as Partial<ExtractedMeeting>}
          transcript={jobTranscript}
          names={names}
          onSaved={setSaved}
        />
      )}
    </div>
  )
}
