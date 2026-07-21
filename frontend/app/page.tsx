import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Nav from '@/components/Nav'
import DashboardPage from './(app)/page'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="flex h-full">
      <Nav />
      <div className="flex-1 flex flex-col min-h-0 md:pl-64">
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <DashboardPage />
        </main>
      </div>
    </div>
  )
}
