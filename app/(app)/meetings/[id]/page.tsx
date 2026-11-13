'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import SyncBadge from '@/components/SyncBadge'
import type { MeetingDetail, UserProfile } from '@/lib/types'

function fmtDeadline(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Read-only. Edits happen before Save; a saved meeting is corrected in the sheet.
export default function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [m, setM] = useState<MeetingDetail | null>(null)
  const [error, setError] = useState('')
  const [token, setToken] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) return
      setToken(session.access_token)
      try {
        setM((await api.meeting(session.access_token, id)) as MeetingDetail)
        const me = (await api.me(session.access_token)) as UserProfile
        setIsAdmin(me.role === 'admin')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load meeting')
      }
    }
    load()
  }, [id])

  async function retry() {
    setRetrying(true)
    try {
      await api.retryMeetingSync(token, id)
      setM((await api.meeting(token, id)) as MeetingDetail)
    } finally {
      setRetrying(false)
    }
  }

  if (error) return <div className="max-w-2xl mx-auto px-4 py-6 text-sm text-red-600">{error}</div>
  if (!m) return <div className="max-w-2xl mx-auto px-4 py-6 text-sm text-gray-400">Loading…</div>

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <Link href="/meetings" className="text-sm text-indigo-600 hover:text-indigo-700">← My meetings</Link>

      <div>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold text-gray-900">{m.title}</h2>
          <SyncBadge status={m.sheet_status} />
        </div>
        <p className="text-sm text-gray-500 mt-1">
          {m.department_name} · {m.recorded_by_name} ·{' '}
          {new Date(m.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
        {m.sheet_status !== 'synced' && m.sheet_error && (
          <p className="text-sm text-amber-700 mt-2">{m.sheet_error}</p>
        )}
        {isAdmin && m.sheet_status !== 'synced' && (
          <button
            onClick={retry}
            disabled={retrying}
            className="mt-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {retrying ? 'Retrying…' : 'Retry sheet sync'}
          </button>
        )}
      </div>

      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Minutes of meeting</h3>
        <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 bg-white border border-gray-200 rounded-xl p-4">{m.mom}</pre>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Action tasks ({m.tasks.length})</h3>
        {m.tasks.length === 0 ? (
          <p className="text-sm text-gray-500">No action tasks.</p>
        ) : (
          <div className="space-y-2">
            {m.tasks.map((t, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-3 text-sm">
                <p className="text-xs font-semibold text-indigo-600 mb-1">Task {i + 1}</p>
                <p><span className="text-gray-500">Assignee:</span> {t.assignee || '—'}</p>
                <p><span className="text-gray-500">Task:</span> {t.description || '—'}</p>
                <p><span className="text-gray-500">Deadline:</span> {fmtDeadline(t.deadline)}</p>
                <p><span className="text-gray-500">Reporting to:</span> {t.reporting_to || '—'}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
