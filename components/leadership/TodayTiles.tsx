'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { TodaySnapshot } from '@/lib/types'

type Props = { token: string }

const TILES: { key: keyof TodaySnapshot; label: string; accent: string }[] = [
  { key: 'assigned_today', label: 'Assigned today', accent: 'text-indigo-700' },
  { key: 'completed_today', label: 'Completed today', accent: 'text-teal-700' },
  { key: 'pending_now', label: 'Pending now', accent: 'text-amber-700' },
]

export default function TodayTiles({ token }: Props) {
  const [data, setData] = useState<TodaySnapshot | null>(null)

  useEffect(() => {
    if (!token) return
    api.leadershipToday(token).then(setData).catch(() => {})
  }, [token])

  return (
    <div className="grid grid-cols-3 gap-3 mb-8">
      {TILES.map(({ key, label, accent }) => (
        <div key={key} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className={`text-2xl md:text-3xl font-bold ${accent}`}>
            {data ? data[key] : '–'}
          </p>
          <p className="text-xs text-gray-500 mt-1">{label}</p>
        </div>
      ))}
    </div>
  )
}
