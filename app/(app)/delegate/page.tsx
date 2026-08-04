'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import RecordButton from '@/components/RecordButton'
import ReviewForm from '@/components/ReviewForm'
import ProcessingSteps from '@/components/ProcessingSteps'
import { useRecordingJob } from '@/lib/useRecordingJob'
import type { UserBrief } from '@/lib/types'

export default function DelegatePage() {
  const router = useRouter()
  const [users, setUsers] = useState<UserBrief[]>([])
  const [saved, setSaved] = useState(false)
  const [manual, setManual] = useState(false)
  const { stage, statusLabel, jobResult, jobTranscript, errMsg, start, reset } = useRecordingJob('task_delegation')

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      try {
        const u = await api.users(session.access_token)
        setUsers(u)
      } catch { /* ignore */ }
    }
    init()
  }, [])

  if (saved) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold mb-2">Task delegated!</h2>
        <p className="text-gray-500 text-sm mb-6">The task has been saved and the doer can see it.</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => { setSaved(false); reset() }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            Record another
          </button>
          <button onClick={() => router.push('/allocated')} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
            View allocated
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Record Task</h2>
      <p className="text-sm text-gray-500 mb-8">
        Speak who needs to do what and by when. Hindi, English, or Hinglish — all work.
      </p>

      {stage === 'idle' && !manual && (
        <div className="flex flex-col items-center py-8">
          <RecordButton onRecordingComplete={start} jobType="task_delegation" maxSeconds={300} />
          <p className="text-xs text-gray-400 mt-6">Max 5 minutes</p>
          <button
            type="button"
            onClick={() => setManual(true)}
            className="mt-6 text-sm text-indigo-600 hover:underline"
          >
            Or type it in manually
          </button>
        </div>
      )}

      {stage === 'idle' && manual && (
        <>
          <button
            type="button"
            onClick={() => setManual(false)}
            className="text-sm text-gray-500 hover:underline mb-4"
          >
            ← Back to recording
          </button>
          <ReviewForm
            jobType="task_delegation"
            result={{}}
            users={users}
            manual
            onDone={() => setSaved(true)}
          />
        </>
      )}

      {(stage === 'uploading' || stage === 'pending' || stage === 'transcribing' || stage === 'extracting') && (
        <div className="flex flex-col items-center py-12">
          <ProcessingSteps stage={stage} label={statusLabel} />
          <p className="text-gray-400 text-xs mt-4">This takes 15–30 seconds</p>
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

      {stage === 'review' && jobResult && (
        <ReviewForm
          jobType="task_delegation"
          result={jobResult}
          transcript={jobTranscript}
          users={users}
          onDone={() => setSaved(true)}
        />
      )}
    </div>
  )
}
