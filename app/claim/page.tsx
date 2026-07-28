'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Pending = { id: string; name: string; company_name: string }
type Step = 'pick' | 'password' | 'otp'

export default function ClaimPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('pick')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Step 1: pick yourself
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Pending[]>([])
  const [selected, setSelected] = useState<Pending | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/pending?search=${encodeURIComponent(search)}`)
        setResults(res.ok ? await res.json() : [])
      } catch {
        setResults([])
      }
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  // Step 2: password
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [email, setEmail] = useState('')

  async function sendCode() {
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (!selected) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth/pending/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selected.id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Could not start setup — please try again.')
      }
      const { email: resolvedEmail } = await res.json()
      setEmail(resolvedEmail)

      const supabase = createClient()
      const { error: otpErr } = await supabase.auth.signInWithOtp({ email: resolvedEmail })
      if (otpErr) throw new Error(otpErr.message || 'Failed to send verification code.')

      setStep('otp')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  // Step 3: OTP -> set password -> link profile
  const [otp, setOtp] = useState('')

  async function verifyAndActivate() {
    if (!selected) return
    setError('')
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: sessionData, error: verifyErr } = await supabase.auth.verifyOtp({
        email,
        token: otp.trim(),
        type: 'email',
      })
      if (verifyErr || !sessionData.session) {
        throw new Error(verifyErr?.message || 'Invalid or expired code. Try again.')
      }

      const { error: pwErr } = await supabase.auth.updateUser({ password })
      if (pwErr) throw new Error(pwErr.message || 'Could not set password.')

      const token = sessionData.session.access_token
      const claimRes = await fetch('/api/auth/claim', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selected.id }),
      })
      if (!claimRes.ok) {
        const err = await claimRes.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Could not finish setup — please contact your admin.')
      }

      router.push('/')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-600 tracking-tight">MeetUp</h1>
          <p className="text-gray-500 text-sm mt-1">Set up your account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          {step === 'pick' && (
            <>
              <h2 className="text-lg font-semibold mb-1">Which one are you?</h2>
              <p className="text-sm text-gray-500 mb-4">
                Search your name — your admin already added you.
              </p>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Start typing your name…"
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <div className="mt-3 max-h-64 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
                {results.length === 0 ? (
                  <p className="text-sm text-gray-400 px-3 py-3">
                    {search ? 'No match — check spelling or ask your admin.' : 'No one to set up.'}
                  </p>
                ) : (
                  results.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setSelected(r)
                        setError('')
                        setStep('password')
                      }}
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-indigo-50 transition-colors"
                    >
                      <span className="font-medium text-gray-800">{r.name}</span>
                      <span className="text-gray-400"> — {r.company_name}</span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {step === 'password' && selected && (
            <>
              <h2 className="text-lg font-semibold mb-1">Create your password</h2>
              <p className="text-sm text-gray-500 mb-4">
                Setting up as <span className="font-medium text-gray-700">{selected.name}</span> ({selected.company_name}).
              </p>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
              />
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendCode()}
                placeholder="Re-enter password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
              <button
                onClick={sendCode}
                disabled={loading}
                className="w-full mt-4 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Sending…' : 'Send verification code'}
              </button>
              <button
                onClick={() => {
                  setStep('pick')
                  setError('')
                }}
                className="w-full mt-3 text-sm text-gray-500 hover:text-gray-700 py-1"
              >
                Not you? Go back
              </button>
            </>
          )}

          {step === 'otp' && (
            <>
              <h2 className="text-lg font-semibold mb-1">Verify it&apos;s you</h2>
              <p className="text-sm text-gray-500 mb-4">
                We sent a code to <span className="font-medium text-gray-700">{email}</span>.
              </p>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Verification code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && verifyAndActivate()}
                placeholder="12345678"
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-center tracking-widest text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
              <button
                onClick={verifyAndActivate}
                disabled={otp.length < 6 || loading}
                className="w-full mt-4 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Activating…' : 'Verify & activate'}
              </button>
            </>
          )}
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already set up?{' '}
          <a href="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}
