'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Step = 'email' | 'otp'

export default function LoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('email')

  // Handle magic link redirect — if user arrives with a session already, go to dashboard
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        router.push('/')
        router.refresh()
      }
    })
  }, [router])
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function sendOtp() {
    if (!email.trim()) return
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
    })
    setLoading(false)
    if (error) {
      const msg = error.message && error.message !== '{}' ? error.message : 'Failed to send OTP — please check your email and try again.'
      setError(msg)
    } else {
      setStep('otp')
    }
  }

  async function verifyOtp() {
    if (!otp.trim()) return
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: 'email',
    })
    setLoading(false)
    if (error) {
      setError(error.message || 'Invalid or expired code. Try again.')
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
          {step === 'email' ? (
            <>
              <h2 className="text-lg font-semibold mb-1">Sign in</h2>
              <p className="text-sm text-gray-500 mb-5">
                Enter your email and we&apos;ll send you a sign-in code.
              </p>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Work email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendOtp()}
                placeholder="you@company.com"
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
              <button
                onClick={sendOtp}
                disabled={!email.trim() || loading}
                className="w-full mt-4 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Sending…' : 'Send OTP'}
              </button>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold mb-1">Enter your code</h2>
              <p className="text-sm text-gray-500 mb-5">
                We sent a sign-in code to{' '}
                <span className="font-medium text-gray-700">{email}</span>.
              </p>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Sign-in code
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && verifyOtp()}
                placeholder="12345678"
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-center tracking-widest text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
              <button
                onClick={verifyOtp}
                disabled={otp.length < 6 || loading}
                className="w-full mt-4 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Verifying…' : 'Verify & Sign in'}
              </button>
              <button
                onClick={() => { setStep('email'); setError(''); setOtp('') }}
                className="w-full mt-3 text-sm text-gray-500 hover:text-gray-700 py-1"
              >
                Use a different email
              </button>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Ecoste · Lamora · Metamask
        </p>
      </div>
    </div>
  )
}
