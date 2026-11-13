'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import type { UserProfile } from '@/lib/types'

/**
 * Client-side admin gate for the /admin/* screens: sends non-admins home and
 * hands back the access token. This is only for the UI — every admin API route
 * re-checks the role on the server.
 */
export function useAdmin(): { token: string; me: UserProfile | null; ready: boolean } {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [me, setMe] = useState<UserProfile | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function guard() {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) return
      try {
        const profile = (await api.me(session.access_token)) as UserProfile
        if (profile.role !== 'admin') {
          router.replace('/')
          return
        }
        setToken(session.access_token)
        setMe(profile)
        setReady(true)
      } catch {
        router.replace('/')
      }
    }
    guard()
  }, [router])

  return { token, me, ready }
}
