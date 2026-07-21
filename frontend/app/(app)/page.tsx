'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import type { DashboardCounts } from '@/lib/types'

const COUNT_CARDS = [
  { key: 'given_open', label: 'Tasks Given', sub: 'open', color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
  { key: 'received_open', label: 'Tasks Received', sub: 'open', color: 'bg-teal-50 border-teal-200 text-teal-700' },
  { key: 'completed', label: 'Completed', sub: 'by me', color: 'bg-green-50 border-green-200 text-green-700' },
  { key: 'overdue', label: 'Overdue', sub: 'by me', color: 'bg-red-50 border-red-200 text-red-700' },
] as const

const QUICK_ACTIONS = [
  { href: '/delegate', label: 'Record Task', icon: '🎤', desc: 'Delegate one task' },
  { href: '/meeting', label: 'Record Meeting', icon: '📋', desc: 'Capture MoM + tasks' },
  { href: '/idea', label: 'New Idea', icon: '💡', desc: 'Store a thought' },
]

export default function DashboardPage() {
  const [token, setToken] = useState('')
  const [counts, setCounts] = useState<DashboardCounts | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState(false)

  const fetchCounts = useCallback(async (tok: string) => {
    try {
      const data = await api.dashboard(tok)
      setCounts(data)
    } catch {
      // silently ignore — realtime will retry
    }
  }, [])

  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null

    async function init() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const tok = session.access_token
      setToken(tok)

      // Check profile exists
      try {
        await api.me(tok)
      } catch {
        setProfileError(true)
      }

      await fetchCounts(tok)
      setLoading(false)

      // Subscribe to task changes for live counts
      const channelName = `dashboard-tasks-${Date.now()}`
      channel = supabase
        .channel(channelName)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
          fetchCounts(tok)
        })
        .subscribe()
    }

    init()
    return () => {
      if (channel) {
        const supabase = createClient()
        supabase.removeChannel(channel)
      }
    }
  }, [fetchCounts])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-sm">Loading…</div>
      </div>
    )
  }

  if (profileError) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
          <p className="text-amber-800 font-semibold mb-2">Account setup pending</p>
          <p className="text-amber-700 text-sm">
            You&apos;ve signed in, but your profile hasn&apos;t been linked yet.
            Ask your admin to run the founder setup SQL and link your auth ID.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h2 className="text-xl font-bold text-gray-900 mb-5">Dashboard</h2>

      {/* Count cards */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        {COUNT_CARDS.map(({ key, label, sub, color }) => (
          <div key={key} className={`rounded-xl border p-4 ${color}`}>
            <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
            <p className="text-3xl font-bold mt-1">{counts?.[key] ?? '–'}</p>
            <p className="text-xs opacity-60 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Record something
      </h3>
      <div className="grid grid-cols-3 gap-3 mb-8">
        {QUICK_ACTIONS.map(({ href, label, icon, desc }) => (
          <Link
            key={href}
            href={href}
            className="bg-white border border-gray-200 rounded-xl p-4 text-center hover:border-indigo-300 hover:bg-indigo-50 transition-colors group"
          >
            <div className="text-3xl mb-2">{icon}</div>
            <p className="text-xs font-semibold text-gray-700 group-hover:text-indigo-700">{label}</p>
            <p className="text-xs text-gray-400 mt-0.5 hidden sm:block">{desc}</p>
          </Link>
        ))}
      </div>

      {/* Shortcuts */}
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Views
      </h3>
      <div className="space-y-2">
        {[
          { href: '/received', label: 'Tasks Received', icon: '📥' },
          { href: '/allocated', label: 'Tasks Allocated', icon: '📤' },
          { href: '/meetings', label: 'Past Meetings', icon: '🗓' },
          { href: '/performance', label: 'My Performance', icon: '📊' },
        ].map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
          >
            <span className="text-lg">{icon}</span>
            <span className="text-sm font-medium text-gray-700">{label}</span>
            <span className="ml-auto text-gray-300">›</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
