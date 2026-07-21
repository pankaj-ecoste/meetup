'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import ScoreCard from '@/components/ScoreCard'
import type { PerformanceRow, ExtensionResponse } from '@/lib/types'

export default function PerformancePage() {
  const [token, setToken] = useState('')
  const [perf, setPerf] = useState<PerformanceRow | null>(null)
  const [extensions, setExtensions] = useState<ExtensionResponse[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setToken(session.access_token)

      try {
        const [p, e] = await Promise.all([
          api.myPerformance(session.access_token),
          api.myExtensions(session.access_token),
        ])
        setPerf(p)
        setExtensions(e)
      } catch { /* ignore */ }
      setLoading(false)
    }
    init()
  }, [])

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>

  if (!perf) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <p className="text-gray-400 text-sm">No performance data yet. Complete some tasks first.</p>
      </div>
    )
  }

  const onTimePct = perf.on_time_pct != null ? `${Math.round(perf.on_time_pct)}%` : '–'
  const avgDays = perf.avg_days_to_complete != null ? `${perf.avg_days_to_complete.toFixed(1)}d` : '–'

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h2 className="text-xl font-bold text-gray-900 mb-5">My Performance</h2>

      {/* Two key metrics */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <ScoreCard
          label="On-time rate"
          value={onTimePct}
          sub={`${perf.on_time_tasks} of ${perf.completed_tasks} completed on time`}
          color={
            perf.on_time_pct == null ? 'indigo'
            : perf.on_time_pct >= 80 ? 'teal'
            : perf.on_time_pct >= 60 ? 'amber'
            : 'red'
          }
        />
        <ScoreCard
          label="Overdue now"
          value={perf.overdue_count}
          sub="tasks currently overdue"
          color={perf.overdue_count === 0 ? 'teal' : perf.overdue_count <= 2 ? 'amber' : 'red'}
        />
      </div>

      {/* Supporting stats */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Details</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-gray-500 text-xs">Total assigned</p>
            <p className="text-gray-800 font-semibold">{perf.total_tasks}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Completed</p>
            <p className="text-gray-800 font-semibold">{perf.completed_tasks}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Avg completion time</p>
            <p className="text-gray-800 font-semibold">{avgDays}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Extensions requested</p>
            <p className="text-gray-800 font-semibold">{extensions.length}</p>
          </div>
        </div>
      </div>

      {/* Extension history */}
      {extensions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Extension history</h3>
          <div className="space-y-2">
            {extensions.map(ext => (
              <div key={ext.id} className="bg-white border border-gray-200 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                    ext.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200'
                    : ext.status === 'denied' ? 'bg-red-50 text-red-700 border-red-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {ext.status === 'requested' ? 'Pending' : ext.status === 'approved' ? 'Approved ✓' : 'Denied ✗'}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(ext.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                <p className="text-xs text-gray-600">{ext.reason}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Proposed: {new Date(ext.proposed_deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
