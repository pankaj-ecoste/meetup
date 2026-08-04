'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  createRecording,
  appendChunk,
  updateSeconds,
  assembleRecording,
  deleteRecording,
  listPending,
  type PendingRecording,
} from '@/lib/recordingStore'

type RecordState = 'idle' | 'requesting' | 'recording' | 'paused'

type Props = {
  // `recordingId` lets the caller delete the crash-safe copy once the upload
  // has been accepted — see lib/recordingStore.ts.
  onRecordingComplete: (blob: Blob, filename: string, recordingId: string) => void
  jobType: 'task_delegation' | 'meeting' | 'idea'
  maxSeconds?: number
  disabled?: boolean
}

const BAR_DELAYS = ['0s', '0.15s', '0.3s', '0.15s', '0s']

// Voice-grade Opus. The browser default runs 48-128 kbps, which put a 30-minute
// meeting around 14 MB; 32 kbps puts a full hour near 14 MB instead, with no
// meaningful accuracy cost for speech-to-text.
const AUDIO_BITS_PER_SECOND = 32000

// MediaRecorder.pause/resume is not universally implemented (Safari has been
// the laggard). Detected once at runtime rather than assumed — where it is
// missing the pause control is simply not offered, and recording still works.
const CAN_PAUSE =
  typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.prototype.pause === 'function'

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function RecordButton({
  onRecordingComplete,
  jobType,
  maxSeconds = 300,
  disabled = false,
}: Props) {
  const [state, setState] = useState<RecordState>('idle')
  const [seconds, setSeconds] = useState(0)
  const [permError, setPermError] = useState('')
  const [pending, setPending] = useState<PendingRecording[]>([])
  const [recovering, setRecovering] = useState(false)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingIdRef = useRef<string>('')
  const seqRef = useRef(0)
  // Memory fallback for browsers where IndexedDB is unavailable (private
  // browsing, storage pressure). Recording must never depend on persistence.
  const memChunksRef = useRef<BlobPart[]>([])
  const persistedRef = useRef(true)

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }, [])

  const startTimer = useCallback(() => {
    clearTimer()
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
  }, [clearTimer])

  // Un-uploaded recordings from a previous session — a locked screen, a reaped
  // tab, a crash. Only those matching this screen's job type are offered.
  const refreshPending = useCallback(() => {
    listPending(jobType).then(setPending).catch(() => setPending([]))
  }, [jobType])

  useEffect(() => { refreshPending() }, [refreshPending])

  const stopRecording = useCallback(() => {
    clearTimer()
    recorderRef.current?.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
  }, [clearTimer])

  useEffect(() => {
    if (seconds >= maxSeconds) stopRecording()
  }, [seconds, maxSeconds, stopRecording])

  // Persist the running duration so a recovered recording can show its length.
  useEffect(() => {
    if (state === 'recording' && recordingIdRef.current && seconds > 0 && seconds % 5 === 0) {
      updateSeconds(recordingIdRef.current, seconds)
    }
  }, [seconds, state])

  useEffect(() => () => {
    clearTimer()
    streamRef.current?.getTracks().forEach(t => t.stop())
  }, [clearTimer])

  async function start() {
    setPermError('')
    setState('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', '']
        .find(mt => !mt || MediaRecorder.isTypeSupported(mt)) ?? ''

      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      })

      const id = crypto.randomUUID()
      const ext = (recorder.mimeType || mimeType || '').includes('mp4') ? 'mp4' : 'webm'
      recordingIdRef.current = id
      seqRef.current = 0
      memChunksRef.current = []
      persistedRef.current = true

      await createRecording({
        id,
        jobType,
        filename: `recording.${ext}`,
        mimeType: recorder.mimeType || mimeType || 'audio/webm',
        seconds: 0,
        createdAt: Date.now(),
      })

      recorder.ondataavailable = e => {
        if (e.data.size === 0) return
        // Written to disk as it arrives — this is what survives a crash.
        appendChunk(id, seqRef.current++, e.data).catch(() => {
          persistedRef.current = false
        })
        memChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        const mime = recorder.mimeType || mimeType || 'audio/webm'
        const stored = persistedRef.current ? await assembleRecording(id, mime) : null
        const blob = stored ?? new Blob(memChunksRef.current, { type: mime })
        setState('idle')
        setSeconds(0)
        memChunksRef.current = []
        onRecordingComplete(blob, `recording.${ext}`, id)
      }

      recorderRef.current = recorder
      recorder.start(1000)
      setState('recording')
      startTimer()
    } catch {
      setState('idle')
      setPermError('Microphone access denied. Allow mic access in your browser and try again.')
    }
  }

  // Pause keeps the mic track open so resume is instant, and freezes the timer
  // so a break does not eat into the recording limit — the cap counts recorded
  // audio, not wall-clock time. Resume continues into the SAME file, so the
  // paused stretch is simply absent from the audio and the transcript has no
  // gap to explain.
  function pause() {
    if (!recorderRef.current || recorderRef.current.state !== 'recording') return
    recorderRef.current.pause()
    clearTimer()
    setState('paused')
  }

  function resume() {
    if (!recorderRef.current || recorderRef.current.state !== 'paused') return
    recorderRef.current.resume()
    startTimer()
    setState('recording')
  }

  async function uploadPending(rec: PendingRecording) {
    setRecovering(true)
    try {
      const blob = await assembleRecording(rec.id, rec.mimeType)
      if (!blob) {
        await deleteRecording(rec.id)
        refreshPending()
        return
      }
      onRecordingComplete(blob, rec.filename, rec.id)
    } finally {
      setRecovering(false)
    }
  }

  async function discardPending(rec: PendingRecording) {
    await deleteRecording(rec.id)
    refreshPending()
  }

  const isLive = state === 'recording' || state === 'paused'

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Recovered recordings — offered only while idle, so they never
          compete with a recording in progress. */}
      {state === 'idle' && pending.length > 0 && (
        <div className="w-full max-w-xs space-y-2">
          {pending.map(rec => (
            <div
              key={rec.id}
              className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-left"
            >
              <p className="text-amber-800 text-sm font-medium">Unfinished recording found</p>
              <p className="text-amber-700 text-xs mt-0.5">
                {fmt(rec.seconds)} · {new Date(rec.createdAt).toLocaleString()}
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => uploadPending(rec)}
                  disabled={recovering}
                  className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 disabled:opacity-50"
                >
                  {recovering ? 'Uploading…' : 'Upload now'}
                </button>
                <button
                  type="button"
                  onClick={() => discardPending(rec)}
                  disabled={recovering}
                  className="px-3 py-1.5 border border-amber-300 text-amber-800 rounded-lg text-xs font-medium hover:bg-amber-100 disabled:opacity-50"
                >
                  Discard
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Waveform — animated while recording, frozen and amber while paused */}
      <div className="h-10 flex items-end gap-1">
        {isLive
          ? BAR_DELAYS.map((delay, i) => (
              <div
                key={i}
                className={`w-2 rounded-full ${
                  state === 'paused' ? 'h-3 bg-amber-400' : 'wave-bar h-8 bg-red-500'
                }`}
                style={state === 'paused' ? undefined : { animationDelay: delay }}
              />
            ))
          : <div className="h-8" />}
      </div>

      <div className="flex items-center gap-4">
        {/* Pause / resume — only rendered where the browser supports it */}
        {isLive && CAN_PAUSE && (
          <button
            type="button"
            onClick={state === 'paused' ? resume : pause}
            className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shadow
              ${state === 'paused'
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            aria-label={state === 'paused' ? 'Resume recording' : 'Pause recording'}
          >
            {state === 'paused' ? '▶' : '⏸'}
          </button>
        )}

        <button
          onClick={isLive ? stopRecording : start}
          disabled={disabled || state === 'requesting'}
          className={`
            w-20 h-20 rounded-full flex items-center justify-center shadow-lg
            transition-all duration-200 text-white text-3xl
            ${state === 'recording'
              ? 'bg-red-500 hover:bg-red-600 scale-110 ring-4 ring-red-200'
              : state === 'paused'
                ? 'bg-amber-500 hover:bg-amber-600 ring-4 ring-amber-200'
                : 'bg-indigo-600 hover:bg-indigo-700'}
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
          aria-label={isLive ? 'Stop recording' : 'Start recording'}
        >
          {isLive ? '⏹' : '🎙'}
        </button>
      </div>

      <div className="text-center h-12">
        {state === 'recording' && (
          <p className="text-red-600 font-mono font-semibold text-lg">{fmt(seconds)}</p>
        )}
        {state === 'paused' && (
          <>
            <p className="text-amber-600 font-mono font-semibold text-lg">{fmt(seconds)}</p>
            {/* Deliberately loud: the mic stays open while paused so resume is
                instant, which means the browser's recording indicator stays
                lit. Users must never have to wonder if it is still listening. */}
            <p className="text-amber-700 text-xs font-semibold tracking-wide">
              ⏸ PAUSED — not recording
            </p>
          </>
        )}
        {state === 'requesting' && (
          <p className="text-gray-500 text-sm">Requesting mic…</p>
        )}
        {state === 'idle' && !permError && (
          <p className="text-gray-400 text-sm">Tap to record</p>
        )}
      </div>

      {permError && (
        <p className="text-red-600 text-sm text-center max-w-xs">{permError}</p>
      )}
    </div>
  )
}
