'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { deleteRecording } from '@/lib/recordingStore'
import { createJobPoller } from '@/lib/jobPoller'
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

// Realtime is the primary way this resolves. The polling timings (fast while
// Realtime is down, slow while it is up) and the 15-minute give-up live in
// lib/jobPoller.ts — it is the reliability net that prevents an infinite spinner.

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

export function useRecordingJob(jobType: 'meeting') {
  const [stage, setStage] = useState<RecordingStage>('idle')
  const [jobResult, setJobResult] = useState<Record<string, unknown> | null>(null)
  const [jobTranscript, setJobTranscript] = useState('')
  const [errMsg, setErrMsg] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)

  const jobIdRef = useRef<string | null>(null)
  const pollRef = useRef<ReturnType<typeof createJobPoller> | null>(null)
  const realtimeOkRef = useRef(false)
  const resolvedRef = useRef(false)

  const clearPoll = useCallback(() => {
    pollRef.current?.stop()
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
      setJobId(job.id)
      applyStatus(job)
      if (resolvedRef.current) return

      realtimeOkRef.current = false
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

      // Fallback poller: slow while Realtime is connected, fast while it is not.
      const poller = createJobPoller({
        fetchJob: async () => {
          if (!jobIdRef.current) return
          const j = await api.recordingJob(token, jobIdRef.current)
          applyStatus(j)
          if (resolvedRef.current) channel.unsubscribe()
        },
        isResolved: () => resolvedRef.current,
        realtimeOk: () => realtimeOkRef.current,
        onTimeout: () => {
          resolvedRef.current = true
          clearPoll()
          channel.unsubscribe()
          setErrMsg(
            'This is taking longer than expected and may have stalled. Your recording is saved — please try again, or check back shortly.',
          )
          setStage('error')
        },
      })
      pollRef.current = poller

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          realtimeOkRef.current = true
          // The job may have finished between "job created" and "channel
          // connected" — no event would ever arrive for that, so look once now.
          poller.checkNow()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          realtimeOkRef.current = false // back to fast polling
        }
      })
      poller.start()
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Upload failed')
      setStage('error')
    }
  }, [jobType, applyStatus, clearPoll])

  const reset = useCallback(() => {
    clearPoll()
    resolvedRef.current = false
    jobIdRef.current = null
    setJobId(null)
    setStage('idle')
    setJobResult(null)
    setJobTranscript('')
    setErrMsg('')
  }, [clearPoll])

  return { stage, statusLabel: STAGE_LABEL[stage], jobId, jobResult, jobTranscript, errMsg, start, reset }
}
