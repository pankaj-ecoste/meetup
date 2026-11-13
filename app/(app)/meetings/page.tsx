import MeetingList from '@/components/MeetingList'

export default function MyMeetingsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">My Meetings</h2>
      <MeetingList />
    </div>
  )
}
