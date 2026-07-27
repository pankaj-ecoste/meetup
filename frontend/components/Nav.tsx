'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { UserProfile } from '@/lib/types'

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: '⊞' },
  { href: '/delegate', label: 'Record Task', icon: '🎤' },
  { href: '/meeting', label: 'Record Meeting', icon: '📋' },
  { href: '/idea', label: 'New Idea', icon: '💡' },
  { href: '/received', label: 'Tasks Received', icon: '📥' },
  { href: '/allocated', label: 'Tasks Allocated', icon: '📤' },
  { href: '/meetings', label: 'Meetings', icon: '🗓' },
  { href: '/performance', label: 'My Performance', icon: '📊' },
]

const LEADERSHIP_ITEMS = [
  { href: '/org-performance', label: 'Org Performance', icon: '🏢' },
  { href: '/admin/employees', label: 'Manage Employees', icon: '🧑‍💼' },
]

// Items shown in mobile bottom nav (5 max)
const MOBILE_NAV = [
  { href: '/', label: 'Home', icon: '⊞' },
  { href: '/delegate', label: 'Task', icon: '🎤' },
  { href: '/meeting', label: 'Meeting', icon: '📋' },
  { href: '/received', label: 'Received', icon: '📥' },
  { href: '/allocated', label: 'Allocated', icon: '📤' },
]

type Props = { profile: UserProfile | null }

export default function Nav({ profile }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const allItems = [
    ...NAV_ITEMS,
    ...(profile?.capability_tier === 'leadership' ? LEADERSHIP_ITEMS : []),
  ]

  function NavItem({ href, label, icon }: { href: string; label: string; icon: string }) {
    const active = pathname === href
    return (
      <Link
        href={href}
        onClick={() => setMenuOpen(false)}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          active
            ? 'bg-indigo-50 text-indigo-700'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`}
      >
        <span className="text-lg w-6 text-center flex-shrink-0">{icon}</span>
        <span>{label}</span>
      </Link>
    )
  }

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="px-4 py-5 border-b border-gray-200">
        <h1 className="text-xl font-bold text-indigo-600">MeetUp</h1>
        {profile && (
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {profile.name} · {profile.company_name}
          </p>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {allItems.map(item => (
          <NavItem key={item.href} {...item} />
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-gray-200">
        <button
          onClick={signOut}
          disabled={signingOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors disabled:opacity-50"
        >
          <span className="text-lg w-6 text-center">↩</span>
          <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar — fixed left */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 fixed inset-y-0 left-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-white border-b border-gray-200 h-14 flex items-center px-4">
        <h1 className="text-lg font-bold text-indigo-600 flex-1">MeetUp</h1>
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
          aria-label="Open menu"
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile overlay sidebar */}
      {menuOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/30"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="md:hidden fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-xl">
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 flex">
        {MOBILE_NAV.map(({ href, label, icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors ${
                active ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className="text-xl">{icon}</span>
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Mobile top bar spacer */}
      <div className="md:hidden h-14 flex-shrink-0" />
    </>
  )
}
