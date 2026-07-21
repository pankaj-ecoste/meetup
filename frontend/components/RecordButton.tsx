'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

type RecordState = 'idle' | 'requesting' | 'recording'

type Props = {
  onRecordingComplete: (blob: Blob, filename: string) => void
  maxSeconds?: number
  disabled?: boolean
}

const BAR_DELAYS = ['0s', '0.15s', '0.3s', '0.15s', '0s']

export default function RecordButton({
  onRecordingComplete,
  maxSeconds = 300,
  disabled = false,
}: Props) {
  const [state, setState] = useState<RecordState>('idle')
  const [seconds, setSeconds] = useState(0)
  const [permError, setPermError] = useState('')

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }, [])

  const stopRecording = useCallback(() => {
    clearTimer()
    recorderRef.current?.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
  }, [clearTimer])

  useEffect(() => {
    if (seconds >= maxSeconds) stopRecording()
  }, [seconds, maxSeconds, stopRecording])

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

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const ext = (recorder.mimeType || '').includes('mp4') ? 'mp4' : 'webm'
        setState('idle')
        setSeconds(0)
        onRecordingComplete(blob, `recording.${ext}`)
      }

      recorderRef.current = recorder
      recorder.start(1000)
      setState('recording')
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    } catch {
      setState('idle')
      setPermError('Microphone access denied. Allow mic access in your browser and try again.')
    }
  }

  function fmt(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Waveform — visible while recording */}
      <div className="h-10 flex items-end gap-1">
        {state === 'recording'
          ? BAR_DELAYS.map((delay, i) => (
              <div
                key={i}
                className="wave-bar w-2 h-8 bg-red-500 rounded-full"
                style={{ animationDelay: delay }}
              />
            ))
          : <div className="h-8" />}
      </div>

      <button
        onClick={state === 'recording' ? stopRecording : start}
        disabled={disabled || state === 'requesting'}
        className={`
          w-20 h-20 rounded-full flex items-center justify-center shadow-lg
          transition-all duration-200 text-white text-3xl
          ${state === 'recording'
            ? 'bg-red-500 hover:bg-red-600 scale-110 ring-4 ring-red-200'
            : 'bg-indigo-600 hover:bg-indigo-700'}
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
        aria-label={state === 'recording' ? 'Stop recording' : 'Start recording'}
      >
        {state === 'recording' ? '⏹' : '🎙'}
      </button>

      <div className="text-center h-8">
        {state === 'recording' && (
          <p className="text-red-600 font-mono font-semibold text-lg">{fmt(seconds)}</p>
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
