'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import RecordButton from '@/components/RecordButton'
import ReviewForm from '@/components/ReviewForm'
import type { UserBrief, JobStatus } from '@/lib/types'

type Stage = 'idle' | 'uploading' | 'processing' | 'review' | 'done' | 'error'

const STAGE_MSG: Record<string, string> = {
  uploading: 'Uploading recording…',
  processing: 'Transcribing and extracting tasks…',
}

export default function MeetingPage() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [users, setUsers] = useState<UserBrief[]>([])
  const [stage, setStage] = useState<Stage>('idle')
  const [jobResult, setJobResult] = useState<Record<string, unknown> | null>(null)
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setToken(session.access_token)
      try {
        const u = await api.users(session.access_token)
        setUsers(u)
      } catch { /* ignore */ }
    }
    init()
  }, [])

  async function handleRecordingComplete(blob: Blob, filename: string) {
    if (!token) return
    setStage('uploading')
    setErrMsg('')

    const supabase = createClient()

    try {
      const job = await api.uploadRecording(token, blob, 'meeting', filename)
      setStage('processing')

      const channel = supabase
        .channel(`job-${job.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'recording_jobs', filter: `id=eq.${job.id}` },
          (payload) => {
            const row = payload.new as { status: JobStatus; result?: Record<string, unknown>; error_msg?: string }
            if (row.status === 'done') {
              channel.unsubscribe()
              setJobResult(row.result ?? {})
              setStage('review')
            } else if (row.status === 'error') {
              channel.unsubscribe()
              setErrMsg(row.error_msg ?? 'Processing failed')
              setStage('error')
            }
          }
        )
        .subscribe()
    } catch (e) {
      setErrMsg((e as Error).message)
      setStage('error')
    }
  }

  if (stage === 'done') {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold mb-2">Meeting saved!</h2>
        <p className="text-gray-500 text-sm mb-6">MoM and all tasks have been saved and assigned.</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => setStage('idle')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            Record another
          </button>
          <button onClick={() => router.push('/meetings')} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
            View meetings
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Record Meeting</h2>
      <p className="text-sm text-gray-500 mb-8">
        Record your meeting. We&apos;ll extract MoM and all action items automatically.
      </p>

      {stage === 'idle' && (
        <div className="flex flex-col items-center py-8">
          <RecordButton
            onRecordingComplete={handleRecordingComplete}
            maxSeconds={1800}
          />
          <p className="text-xs text-gray-400 mt-6">Max 30 minutes</p>
        </div>
      )}

      {(stage === 'uploading' || stage === 'processing') && (
        <div className="flex flex-col items-center py-12 gap-4">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-gray-600 text-sm font-medium">{STAGE_MSG[stage]}</p>
          <p className="text-gray-400 text-xs">Longer meetings take up to a minute</p>
        </div>
      )}

      {stage === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
          <p className="text-red-700 font-medium mb-2">Something went wrong</p>
          <p className="text-red-600 text-sm mb-4">{errMsg}</p>
          <button
            onClick={() => { setStage('idle'); setErrMsg('') }}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      )}

      {stage === 'review' && jobResult && (
        <ReviewForm
          jobType="meeting"
          result={jobResult}
          users={users}
          token={token}
          onDone={() => setStage('done')}
        />
      )}
    </div>
  )
}
