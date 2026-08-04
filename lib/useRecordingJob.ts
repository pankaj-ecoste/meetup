'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { deleteRecording } from '@/lib/recordingStore'
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

// Nothing in the pipeline ever gave up: if the AssemblyAI webhook never
// arrived, the job sat in `transcribing` and the UI spun forever. Ten real jobs
// are stuck that way in production. After this long, stop waiting and show a
// real error — generous enough for a 60-minute recording, which AssemblyAI
// typically turns around in a few minutes.
const JOB_TIMEOUT_MS = 15 * 60 * 1000

// Private Supabase Storage bucket the browser uploads audio into directly,
// using the one-path signed token minted by /api/recordings/upload-url.
// Mirrors BUCKET in lib/server/recordings.ts.
const AUDIO_BUCKET = 'audio'

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

  const start = useCallback(async (blob: Blob, filename: string, recordingId?: string) => {
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
      // Three-step upload. The audio goes browser → Supabase Storage directly;
      // it never passes through a Vercel function, which caps request bodies at
      // 4.5 MB and used to reject long meetings with a 413 before the handler
      // ran. Only the tiny first and third calls touch our API.
      const { path, token: uploadToken } = await api.recordingUploadUrl(token, jobType, filename)

      const { error: upErr } = await supabase.storage
        .from(AUDIO_BUCKET)
        .uploadToSignedUrl(path, uploadToken, blob, {
          contentType: blob.type || 'audio/webm',
        })
      if (upErr) throw new Error(upErr.message || 'Upload failed')

      const job = await api.createRecordingJob(token, jobType, path)

      // The audio is now durably in Storage and the job exists, so the
      // crash-safe browser copy has done its job and can go. Deleted only at
      // this point — if anything above threw, the recording is still on disk
      // and will be offered back on the next visit.
      if (recordingId) await deleteRecording(recordingId).catch(() => {})

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

      const startedAt = Date.now()
      pollRef.current = setInterval(async () => {
        if (resolvedRef.current || !jobIdRef.current) return

        if (Date.now() - startedAt > JOB_TIMEOUT_MS) {
          resolvedRef.current = true
          clearPoll()
          channel.unsubscribe()
          setErrMsg(
            'This is taking longer than expected and may have stalled. Your recording is saved — please try again, or check back shortly.',
          )
          setStage('error')
          return
        }

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
  }, [jobType, applyStatus, clearPoll])

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
