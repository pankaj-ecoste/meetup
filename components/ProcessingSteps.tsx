'use client'

import type { RecordingStage } from '@/lib/useRecordingJob'

const STEPS = ['Upload', 'Transcribe', 'Analyze']

// Which step (0-2) is active for a given pipeline stage. Anything at or past
// 'review' counts as all steps complete.
function activeStep(stage: RecordingStage): number {
  if (stage === 'uploading') return 0
  if (stage === 'pending' || stage === 'transcribing') return 1
  if (stage === 'extracting') return 2
  return 3
}

// Visible progress through Upload -> Transcribe -> Analyze, with a checkmark
// on each completed step and a pulsing indicator on the active one — so the
// user can see concretely which part has finished instead of one static
// "processing…" string that looks the same for 5 seconds or 50.
export default function ProcessingSteps({ stage, label }: { stage: RecordingStage; label: string }) {
  const active = activeStep(stage)

  return (
    <div className="w-full max-w-xs">
      <div className="flex items-center mb-3">
        {STEPS.map((step, i) => (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 transition-colors ${
                  i < active
                    ? 'bg-indigo-600 text-white'
                    : i === active
                      ? 'bg-indigo-600 text-white animate-pulse'
                      : 'bg-gray-200 text-gray-400'
                }`}
              >
                {i < active ? '✓' : i + 1}
              </div>
              <span className={`text-[11px] mt-1.5 whitespace-nowrap ${i === active ? 'text-indigo-700 font-medium' : 'text-gray-400'}`}>
                {step}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1.5 mb-4 transition-colors ${i < active ? 'bg-indigo-500' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>
      {label && <p className="text-center text-gray-600 text-sm font-medium mt-2">{label}</p>}
    </div>
  )
}
