'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import type { JobStatus } from '@/lib/types'

export type RecordingStage =
  | 'idle'
  | 'uploading'
  | 'pending'
  | 'transcribing'
  | 'extracting'
  | 'review'
  | 'error'

export const STAGE_LABEL: Record<RecordingStage, string> = {
  idle: '',
  uploading: 'Uploading your recording…',
  pending: 'Queuing for transcription…',
  transcribing: 'Transcribing your recording…',
  extracting: 'Analysing with AI…',
  review: '',
  error: '',
}

// Realtime is the primary way this resolves. This interval is a reliability
// net only — if a Realtime event is ever missed/dropped, polling still
// finishes the job within one interval instead of leaving an infinite spinner.
const POLL_INTERVAL_MS = 6000

type JobRow = {
  status: JobStatus
  result?: Record<string, unknown> | null
  error_msg?: string | null
  transcript?: string | null
}

export function useRecordingJob(jobType: 'task_delegation' | 'meeting' | 'idea') {
  const [stage, setStage] = useState<RecordingStage>('idle')
  const [jobResult, setJobResult] = useState<Record<string, unknown> | null>(null)
  const [jobTranscript, setJobTranscript] = useState('')
  const [errMsg, setErrMsg] = useState('')

  const jobIdRef = useRef<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const resolvedRef = useRef(false)

  const clearPoll = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = null
  }, [])

  useEffect(() => () => clearPoll(), [clearPoll])

  const applyStatus = useCallback((row: JobRow) => {
    if (resolvedRef.current) return
    if (row.transcript) setJobTranscript(row.transcript)
    if (row.status === 'done') {
      resolvedRef.current = true
      clearPoll()
      setJobResult(row.result ?? {})
      setStage('review')
    } else if (row.status === 'error') {
      resolvedRef.current = true
      clearPoll()
      setErrMsg(row.error_msg ?? 'Processing failed')
      setStage('error')
    } else {
      setStage(row.status) // 'pending' | 'transcribing' | 'extracting'
    }
  }, [clearPoll])

  const start = useCallback(async (blob: Blob, filename: string) => {
    setErrMsg('')
    setJobResult(null)
    resolvedRef.current = false
    setStage('uploading')

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setErrMsg('Your session expired — please sign in again.')
      setStage('error')
      return
    }
    const token = session.access_token

    try {
      const job = await api.uploadRecording(token, blob, jobType, filename)
      jobIdRef.current = job.id
      applyStatus(job)
      if (resolvedRef.current) return

      const channel = supabase
        .channel(`job-${job.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'recording_jobs', filter: `id=eq.${job.id}` },
          (payload) => {
            applyStatus(payload.new as JobRow)
            if (resolvedRef.current) channel.unsubscribe()
          },
        )
        .subscribe()

      pollRef.current = setInterval(async () => {
        if (resolvedRef.current || !jobIdRef.current) return
        try {
          const j = await api.recordingJob(token, jobIdRef.current)
          applyStatus(j)
          if (resolvedRef.current) channel.unsubscribe()
        } catch {
          // transient — the next tick or Realtime will pick it up
        }
      }, POLL_INTERVAL_MS)
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Upload failed')
      setStage('error')
    }
  }, [jobType, applyStatus])

  const reset = useCallback(() => {
    clearPoll()
    resolvedRef.current = false
    jobIdRef.current = null
    setStage('idle')
    setJobResult(null)
    setJobTranscript('')
    setErrMsg('')
  }, [clearPoll])

  return { stage, statusLabel: STAGE_LABEL[stage], jobResult, jobTranscript, errMsg, start, reset }
}
