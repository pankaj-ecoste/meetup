import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Nav from '@/components/Nav'
import type { UserProfile } from '@/lib/types'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch the nav profile in the same server round trip as the auth check
  // above, and pass it down as a prop — Nav used to re-fetch this itself on
  // every single navigation (getSession + a full /api/auth/me round trip),
  // which was a big chunk of the per-tab-switch lag. One query here instead.
  const { data: row } = await supabase
    .from('users')
    .select('id, name, email, company_id, companies(name), designations(capability_tier)')
    .eq('auth_id', user.id)
    .eq('is_active', true)
    .single()

  const companies = row?.companies as unknown
  const designations = row?.designations as unknown
  const companyObj = Array.isArray(companies) ? companies[0] : companies
  const designationObj = Array.isArray(designations) ? designations[0] : designations

  const profile: UserProfile | null = row
    ? {
        id: row.id,
        name: row.name,
        email: row.email,
        company_id: row.company_id,
        company_name: (companyObj as { name?: string } | null)?.name ?? '',
        capability_tier: (designationObj as { capability_tier?: string } | null)?.capability_tier,
        is_active: true,
      }
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
