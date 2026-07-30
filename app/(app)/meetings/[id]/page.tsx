'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'

type Task = {
  id: string
  description: string
  deadline: string
  status: string
  assignees?: { name: string }
  report_tos?: { name: string }
}

type MeetingDetail = {
  id: string
  mom_summary?: string
  created_at: string
  tasks: Task[]
}

const STATUS_STYLES: Record<string, string> = {
  open: 'text-teal-700 bg-teal-50 border-teal-200',
  overdue: 'text-red-700 bg-red-50 border-red-200',
  completed: 'text-green-700 bg-green-50 border-green-200',
}

export default function MeetingDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showSummary, setShowSummary] = useState(false)

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      try {
        const data = await api.meeting(session.access_token, params.id as string)
        setMeeting(data)
      } catch (e) {
        setError((e as Error).message)
      }
      setLoading(false)
    }
    init()
  }, [params.id])

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>

  if (error || !meeting) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <p className="text-red-600 mb-4">{error || 'Meeting not found'}</p>
        <button onClick={() => router.back()} className="text-indigo-600 text-sm hover:underline">← Back</button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button onClick={() => router.back()} className="text-sm text-indigo-600 hover:underline mb-4 block">
        ← Back to meetings
      </button>

      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-gray-900">Meeting</h2>
        <span className="text-xs text-gray-400">
          {new Date(meeting.created_at).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
          })}
        </span>
      </div>

      {meeting.mom_summary && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
          <button
            type="button"
            onClick={() => setShowSummary(s => !s)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 hover:bg-gray-100"
          >
            <span>Minutes of Meeting (tap for {showSummary ? 'less' : 'full summary'})</span>
            <span>{showSummary ? '▲' : '▼'}</span>
          </button>
          {showSummary && (
            <p className="px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{meeting.mom_summary}</p>
          )}
        </div>
      )}

      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Tasks ({meeting.tasks.length})
      </h3>

      {meeting.tasks.length === 0 ? (
        <p className="text-gray-400 text-sm">No tasks were extracted from this meeting.</p>
      ) : (
        <div className="space-y-3">
          {meeting.tasks.map(task => (
            <div key={task.id} className={`bg-white border rounded-xl p-4 ${STATUS_STYLES[task.status] || 'border-gray-200'}`}>
              <p className="text-sm text-gray-800 mb-2">{task.description}</p>
              <div className="flex items-center justify-between text-xs">
                <div className="text-gray-500">
                  {task.assignees?.name && <span>→ {task.assignees.name}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${STATUS_STYLES[task.status] || 'border-gray-200 text-gray-600'}`}>
                    {task.status}
                  </span>
                  <span className="text-gray-400">
                    {new Date(task.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
