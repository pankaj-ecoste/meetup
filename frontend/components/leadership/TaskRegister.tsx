'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import type { LeadershipTaskRow, TaskStatus } from '@/lib/types'

type Props = { token: string }

const PAGE_SIZE = 50

const STATUS_STYLES: Record<TaskStatus, string> = {
  open: 'bg-teal-50 text-teal-700 border-teal-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  completed: 'bg-green-50 text-green-700 border-green-200',
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  open: 'Open',
  overdue: 'Overdue',
  completed: 'Completed',
}

// "Today" as an IST calendar date string (YYYY-MM-DD) — IST is a fixed
// UTC+5:30, same convention used server-side (lib/server/istDate.ts).
function istTodayDateString(): string {
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  return istNow.toISOString().slice(0, 10)
}

type Filters = {
  assignedFrom: string
  assignedTo: string
  deadlineFrom: string
  deadlineTo: string
  search: string
}

const EMPTY_FILTERS: Filters = { assignedFrom: '', assignedTo: '', deadlineFrom: '', deadlineTo: '', search: '' }

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function TaskRegister({ token }: Props) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<LeadershipTaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)

  const fetchRows = useCallback(async (f: Filters, p: number) => {
    if (!token) return
    setLoading(true)
    try {
      const data: LeadershipTaskRow[] = await api.leadershipTasks(token, {
        assignedFrom: f.assignedFrom || undefined,
        assignedTo: f.assignedTo || undefined,
        deadlineFrom: f.deadlineFrom || undefined,
        deadlineTo: f.deadlineTo || undefined,
        search: f.search || undefined,
        page: p,
      })
      setRows(data)
      setHasMore(data.length === PAGE_SIZE)
    } catch { /* ignore */ }
    setLoading(false)
  }, [token])

  useEffect(() => { fetchRows(EMPTY_FILTERS, 1) }, [fetchRows])

  useEffect(() => {
    if (!token) return
    const t = setTimeout(() => { setPage(1); fetchRows(filters, 1) }, 300)
    return () => clearTimeout(t)
  }, [filters, token, fetchRows])

  function update(patch: Partial<Filters>) {
    setFilters(f => ({ ...f, ...patch }))
  }

  function quickDeadlineToday() {
    const today = istTodayDateString()
    setFilters(f => ({ ...f, deadlineFrom: today, deadlineTo: today }))
  }

  function quickAssignedToday() {
    const today = istTodayDateString()
    setFilters(f => ({ ...f, assignedFrom: today, assignedTo: today }))
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS)
  }

  const hasActiveFilters = Object.values(filters).some(Boolean)

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Task register</h3>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
        <input
          type="text"
          value={filters.search}
          onChange={e => update({ search: e.target.value })}
          placeholder="Search by email (assigner or doer)…"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-gray-500 mb-1">Assigned date range</p>
            <div className="flex items-center gap-2">
              <input type="date" value={filters.assignedFrom} onChange={e => update({ assignedFrom: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
              <span className="text-gray-400 text-xs">to</span>
              <input type="date" value={filters.assignedTo} onChange={e => update({ assignedTo: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Deadline range</p>
            <div className="flex items-center gap-2">
              <input type="date" value={filters.deadlineFrom} onChange={e => update({ deadlineFrom: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
              <span className="text-gray-400 text-xs">to</span>
              <input type="date" value={filters.deadlineTo} onChange={e => update({ deadlineTo: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={quickDeadlineToday} className="px-3 py-1.5 text-xs rounded-full border border-gray-300 hover:bg-gray-50">
            Deadline = today
          </button>
          <button onClick={quickAssignedToday} className="px-3 py-1.5 text-xs rounded-full border border-gray-300 hover:bg-gray-50">
            Assigned = today
          </button>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="px-3 py-1.5 text-xs rounded-full text-indigo-600 hover:underline">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">No tasks match these filters.</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Assigner</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Doer</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Company</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Assigned</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Deadline</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.task_id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="text-gray-800">{row.assignor_name}</p>
                      <p className="text-xs text-gray-400">{row.assignor_email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-800">{row.assignee_name}</p>
                      <p className="text-xs text-gray-400">{row.assignee_email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{row.company_name}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(row.assigned_date)}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(row.deadline)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[row.status]}`}>
                        {STATUS_LABELS[row.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {rows.map(row => (
              <div key={row.task_id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm text-gray-800">
                      <span className="text-gray-400">From </span>{row.assignor_name}
                    </p>
                    <p className="text-sm text-gray-800">
                      <span className="text-gray-400">To </span>{row.assignee_name}
                    </p>
                  </div>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[row.status]}`}>
                    {STATUS_LABELS[row.status]}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span>{row.company_name}</span>
                  <span>Assigned {fmtDate(row.assigned_date)}</span>
                  <span>Due {fmtDate(row.deadline)}</span>
                </div>
              </div>
            ))}
          </div>

          {(page > 1 || hasMore) && (
            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                onClick={() => { const p = page - 1; setPage(p); fetchRows(filters, p) }}
                disabled={page === 1}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">Page {page}</span>
              <button
                onClick={() => { const p = page + 1; setPage(p); fetchRows(filters, p) }}
                disabled={!hasMore}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
