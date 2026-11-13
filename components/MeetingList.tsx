'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import type { MeetingRow } from '@/lib/types'
import SyncBadge from './SyncBadge'

// Deliberately simple: a plain list, newest first. `all` (admin) shows
// everyone's meetings and who recorded them.
export default function MeetingList({ all = false }: { all?: boolean }) {
  const [rows, setRows] = useState<MeetingRow[]>([])
  const [page, setPage] = useState(1)
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      try {
        const data = (await api.meetings(session.access_token, page, all)) as MeetingRow[]
        if (cancelled) return
        setRows((prev) => (page === 1 ? data : [...prev, ...data]))
        setMore(data.length === 20)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load meetings')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [page, all])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!loading && rows.length === 0) {
    return <p className="text-sm text-gray-500">No meetings yet.</p>
  }

  return (
    <div>
      <ul className="space-y-2">
        {rows.map((m) => (
          <li key={m.id}>
            <Link
              href={`/meetings/${m.id}`}
              className="block bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-indigo-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-gray-900 text-sm">{m.title}</p>
                <SyncBadge status={m.sheet_status} />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {m.department_name}
                {all ? ` · ${m.recorded_by_name}` : ''} · {new Date(m.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                {' · '}{m.task_count} task{m.task_count === 1 ? '' : 's'}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {loading && <p className="text-sm text-gray-400 mt-3">Loading…</p>}
      {more && !loading && (
        <button
          onClick={() => setPage((p) => p + 1)}
          className="mt-4 text-sm text-indigo-600 font-medium hover:text-indigo-700"
        >
          Load more
        </button>
      )}
    </div>
  )
}
