'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import type { MeetingResponse } from '@/lib/types'

export default function MeetingsPage() {
  const [token, setToken] = useState('')
  const [meetings, setMeetings] = useState<MeetingResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)

  const PAGE_SIZE = 20

  async function fetchMeetings(tok: string, p: number) {
    setLoading(true)
    try {
      const data: MeetingResponse[] = await api.meetings(tok, p)
      setMeetings(data)
      setHasMore(data.length === PAGE_SIZE)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setToken(session.access_token)
      fetchMeetings(session.access_token, 1)
    }
    init()
  }, [])

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h2 className="text-xl font-bold text-gray-900 mb-5">Meetings</h2>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : meetings.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 text-sm mb-3">No meetings recorded yet.</p>
          <Link href="/meeting" className="text-indigo-600 text-sm font-medium hover:underline">
            Record your first meeting →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map(m => (
            <Link
              key={m.id}
              href={`/meetings/${m.id}`}
              className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 line-clamp-2">
                    {m.mom_summary
                      ? m.mom_summary.slice(0, 120) + (m.mom_summary.length > 120 ? '…' : '')
                      : 'Meeting recording'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(m.created_at).toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full px-2.5 py-0.5 font-medium">
                    {m.task_count} task{m.task_count !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            onClick={() => { const p = page - 1; setPage(p); fetchMeetings(token, p) }}
            disabled={page === 1}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">Page {page}</span>
          <button
            onClick={() => { const p = page + 1; setPage(p); fetchMeetings(token, p) }}
            disabled={!hasMore}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
