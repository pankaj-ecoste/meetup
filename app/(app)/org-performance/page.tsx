'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import type { UserProfile } from '@/lib/types'
import TodayTiles from '@/components/leadership/TodayTiles'
import ScoreBands from '@/components/leadership/ScoreBands'
import TaskRegister from '@/components/leadership/TaskRegister'

export default function OrgPerformancePage() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [authChecked, setAuthChecked] = useState(false)
  const [isLeadership, setIsLeadership] = useState(false)

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const tok = session.access_token
      setToken(tok)

      try {
        const profile: UserProfile = await api.me(tok)
        setIsLeadership(profile.capability_tier === 'leadership')
      } catch { /* ignore */ }

      setAuthChecked(true)
    }
    init()
  }, [])

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
      <p className="text-sm text-gray-500 mb-6">
        All employees across Ecoste, Lamora, and Metamask.
      </p>

      <TodayTiles token={token} />
      <ScoreBands token={token} />
      <TaskRegister token={token} />
    </div>
  )
}
