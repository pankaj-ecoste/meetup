'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import type { PerformanceRow } from '@/lib/types'

type Props = { token: string }

// Band boundaries (plan.md §7.5 Part C, locked 2026-07-24) — no gaps,
// trivially tunable constants.
const GREEN_MIN = 95
const YELLOW_MIN = 90

type Band = 'green' | 'yellow' | 'red'

const BAND_META: Record<Band, { label: string; dot: string; ring: string }> = {
  green: { label: 'Top performers (≥95%)', dot: 'bg-green-500', ring: 'border-green-200 bg-green-50' },
  yellow: { label: 'Average performers (90–95%)', dot: 'bg-yellow-500', ring: 'border-yellow-200 bg-yellow-50' },
  red: { label: 'Needs attention (<90%)', dot: 'bg-red-500', ring: 'border-red-200 bg-red-50' },
}

function bandOf(pct: number): Band {
  if (pct >= GREEN_MIN) return 'green'
  if (pct >= YELLOW_MIN) return 'yellow'
  return 'red'
}

export default function ScoreBands({ token }: Props) {
  const [rows, setRows] = useState<PerformanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Band | null>(null)

  const fetchRows = useCallback(async (q: string) => {
    if (!token) return
    setLoading(true)
    try {
      const data: PerformanceRow[] = await api.orgPerformance(token, q)
      setRows(data)
    } catch { /* ignore */ }
    setLoading(false)
  }, [token])

  useEffect(() => { fetchRows('') }, [fetchRows])

  useEffect(() => {
    if (!token) return
    const t = setTimeout(() => fetchRows(search), 300)
    return () => clearTimeout(t)
  }, [search, token, fetchRows])

  const { bands, unscored } = useMemo(() => {
    const bands: Record<Band, PerformanceRow[]> = { green: [], yellow: [], red: [] }
    let unscored = 0
    for (const row of rows) {
      if (row.on_time_pct == null) { unscored++; continue }
      bands[bandOf(row.on_time_pct)].push(row)
    }
    return { bands, unscored }
  }, [rows])

  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Scoring analysis</h3>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by email…"
        className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      {loading && rows.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="space-y-3">
          {(Object.keys(BAND_META) as Band[]).map((band) => {
            const meta = BAND_META[band]
            const list = bands[band]
            const isOpen = expanded === band
            return (
              <div key={band} className={`border rounded-xl overflow-hidden ${meta.ring}`}>
                <button
                  onClick={() => setExpanded(isOpen ? null : band)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
                    <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </span>
                  <span className="text-sm text-gray-600">{list.length} staff</span>
                </button>
                {isOpen && (
                  <div className="bg-white border-t border-gray-200 divide-y divide-gray-100">
                    {list.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-gray-400">No staff in this band.</p>
                    ) : (
                      list.map(row => (
                        <div key={row.user_id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                          <div>
                            <p className="font-medium text-gray-800">{row.name}</p>
                            <p className="text-xs text-gray-400">{row.email}</p>
                          </div>
                          <span className="font-semibold text-gray-700">{Math.round(row.on_time_pct!)}%</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {unscored > 0 && (
        <p className="text-xs text-gray-400 mt-3">
          {unscored} employee{unscored === 1 ? '' : 's'} not yet scored (no completed tasks yet).
        </p>
      )}
    </div>
  )
}
