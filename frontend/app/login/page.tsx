'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()

  // If a session already exists (e.g. arriving via a stale tab), go straight in.
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.push('/')
        router.refresh()
      }
    })
  }, [router])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function signIn() {
    if (!email.trim() || !password) return
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setLoading(false)
    if (error) {
      setError('Incorrect email or password.')
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-600 tracking-tight">MeetUp</h1>
          <p className="text-gray-500 text-sm mt-1">Internal operations platform</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-1">Sign in</h2>
          <p className="text-sm text-gray-500 mb-5">Enter your email and password.</p>

          <label className="block text-sm font-medium text-gray-700 mb-1.5">Work email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && signIn()}
            placeholder="you@company.com"
            autoFocus
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
          />

          <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && signIn()}
            placeholder="Your password"
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />

          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}

          <button
            onClick={signIn}
            disabled={!email.trim() || !password || loading}
            className="w-full mt-4 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          First time here or forgot your password?{' '}
          <a href="/claim" className="text-indigo-600 hover:text-indigo-700 font-medium">
            Set up your account
          </a>
        </p>

        <p className="text-center text-xs text-gray-400 mt-6">
          Ecoste · Lamora · Metamask
        </p>
      </div>
    </div>
  )
}
