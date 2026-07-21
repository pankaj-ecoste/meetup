'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import type { PerformanceRow, UserProfile } from '@/lib/types'

export default function OrgPerformancePage() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [rows, setRows] = useState<PerformanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [authChecked, setAuthChecked] = useState(false)
  const [isLeadership, setIsLeadership] = useState(false)
  const [search, setSearch] = useState('')

  const fetchData = useCallback(async (tok: string, q: string) => {
    try {
      const data: PerformanceRow[] = await api.orgPerformance(tok, q)
      setRows(data)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const tok = session.access_token
      setToken(tok)

      try {
        const profile: UserProfile = await api.me(tok)
        if (profile.capability_tier !== 'leadership') {
          setAuthChecked(true)
          setIsLeadership(false)
          return
        }
        setIsLeadership(true)
        await fetchData(tok, '')
      } catch { /* ignore */ }

      setAuthChecked(true)
      setLoading(false)
    }
    init()
  }, [fetchData])

  useEffect(() => {
    if (!token || !isLeadership) return
    const t = setTimeout(() => fetchData(token, search), 300)
    return () => clearTimeout(t)
  }, [search, token, isLeadership, fetchData])

  if (!authChecked) {
    return <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
  }

  if (!isLeadership) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-lg font-semibold mb-2">Access restricted</h2>
        <p className="text-gray-500 text-sm mb-4">
          This view is only available to leadership-tier accounts.
        </p>
        <button onClick={() => router.push('/')} className="text-indigo-600 text-sm hover:underline">
          Back to dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Org Performance</h2>
      <p className="text-sm text-gray-500 mb-5">
        All employees across Ecoste, Lamora, and Metamask.
      </p>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by name or email…"
        className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">No data yet.</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Company</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">On-time %</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Overdue</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total tasks</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.user_id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{row.name}</p>
                      <p className="text-xs text-gray-400">{row.email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{row.company_name ?? '–'}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold ${
                        row.on_time_pct == null ? 'text-gray-400'
                        : row.on_time_pct >= 80 ? 'text-teal-700'
                        : row.on_time_pct >= 60 ? 'text-amber-700'
                        : 'text-red-700'
                      }`}>
                        {row.on_time_pct != null ? `${Math.round(row.on_time_pct)}%` : '–'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold ${row.overdue_count > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                        {row.overdue_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{row.total_tasks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {rows.map(row => (
              <div key={row.user_id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{row.name}</p>
                    <p className="text-xs text-gray-400">{row.company_name}</p>
                  </div>
                  <span className={`text-sm font-bold ${
                    row.on_time_pct == null ? 'text-gray-400'
                    : row.on_time_pct >= 80 ? 'text-teal-700'
                    : row.on_time_pct >= 60 ? 'text-amber-700'
                    : 'text-red-700'
                  }`}>
                    {row.on_time_pct != null ? `${Math.round(row.on_time_pct)}%` : '–'}
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span><span className={`font-medium ${row.overdue_count > 0 ? 'text-red-600' : 'text-gray-700'}`}>{row.overdue_count}</span> overdue</span>
                  <span><span className="font-medium text-gray-700">{row.total_tasks}</span> total</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
