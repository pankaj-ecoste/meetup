'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import RecordButton from '@/components/RecordButton'
import ReviewForm from '@/components/ReviewForm'
import ProcessingSteps from '@/components/ProcessingSteps'
import { useRecordingJob } from '@/lib/useRecordingJob'
import type { IdeaResponse } from '@/lib/types'

export default function IdeaPage() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [ideas, setIdeas] = useState<IdeaResponse[]>([])
  const [loadingIdeas, setLoadingIdeas] = useState(false)
  const [manual, setManual] = useState(false)
  const { stage, statusLabel, jobResult, jobTranscript, errMsg, start, reset } = useRecordingJob('idea')

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setToken(session.access_token)
      loadIdeas(session.access_token)
    }
    init()
  }, [])

  async function loadIdeas(tok: string) {
    setLoadingIdeas(true)
    try {
      const data = await api.ideas(tok)
      setIdeas(data)
    } catch { /* ignore */ }
    setLoadingIdeas(false)
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h2 className="text-xl font-bold text-gray-900 mb-1">New Idea</h2>
      <p className="text-sm text-gray-500 mb-8">
        Tap to record. Your idea will be transcribed and saved to the universal feed.
      </p>

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
            jobType="idea"
            result={{}}
            users={[]}
            manual
            onDone={() => { setManual(false); reset(); loadIdeas(token) }}
          />
        </>
      )}

      {stage === 'idle' && !manual && (
        <>
          <div className="flex flex-col items-center py-8 mb-8">
            <RecordButton onRecordingComplete={start} jobType="idea" maxSeconds={300} />
            <button
              type="button"
              onClick={() => setManual(true)}
              className="mt-6 text-sm text-indigo-600 hover:underline"
            >
              Or type it in manually
            </button>
          </div>

          {/* Recent ideas feed */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Recent ideas</h3>
              <button onClick={() => router.push('/ideas')} className="text-xs text-indigo-600 hover:underline">
                See all
              </button>
            </div>
            {loadingIdeas ? (
              <p className="text-gray-400 text-sm">Loading…</p>
            ) : ideas.length === 0 ? (
              <p className="text-gray-400 text-sm">No ideas yet. Record the first one!</p>
            ) : (
              <div className="space-y-3">
                {ideas.slice(0, 5).map(idea => (
                  <div key={idea.id} className="bg-white border border-gray-200 rounded-xl p-3">
                    <p className="text-sm text-gray-800">{idea.summary}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {idea.tags.map(tag => (
                        <span key={tag} className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full px-2 py-0.5">
                          {tag}
                        </span>
                      ))}
                      <span className="text-xs text-gray-400 ml-auto">
                        {new Date(idea.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {(stage === 'uploading' || stage === 'pending' || stage === 'transcribing' || stage === 'extracting') && (
        <div className="flex flex-col items-center py-12">
          <ProcessingSteps stage={stage} label={statusLabel} />
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
          jobType="idea"
          result={jobResult}
          transcript={jobTranscript}
          users={[]}
          onDone={() => { reset(); loadIdeas(token) }}
        />
      )}
    </div>
  )
}
