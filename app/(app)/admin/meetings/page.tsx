'use client'

import MeetingList from '@/components/MeetingList'
import { useAdmin } from '@/lib/useAdmin'

export default function AllMeetingsPage() {
  const { ready } = useAdmin()
  if (!ready) return null
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h2 className="text-xl font-bold text-gray-900 mb-1">All Meetings</h2>
      <p className="text-sm text-gray-500 mb-4">Every meeting recorded by anyone.</p>
      <MeetingList all />
    </div>
  )
}
