import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Nav from '@/components/Nav'
import type { UserProfile } from '@/lib/types'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // One query here, passed to Nav as a prop (Nav used to re-fetch on every
  // navigation, which made tab switches laggy).
  const { data: row } = await supabase
    .from('users')
    .select('id, name, email, role')
    .eq('auth_id', user.id)
    .eq('is_active', true)
    .single()

  const profile: UserProfile | null = row
    ? { id: row.id, name: row.name, email: row.email, role: row.role, is_active: true }
    : null

  return (
    <div className="flex h-full">
      <Nav profile={profile} />
      <div className="flex-1 flex flex-col min-h-0 md:pl-64">
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          {children}
        </main>
      </div>
    </div>
  )
}
