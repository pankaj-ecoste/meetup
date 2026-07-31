'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

const DISMISS_KEY = 'meetup:push-opt-in-dismissed'

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64Safe)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

type Props = { token: string }

// Opt-in banner for Web Push (plan.md §8.14). Deliberately requires an
// explicit tap rather than auto-prompting on load: a denied permission
// prompt can't be re-asked by the page, so the one shot at getting a "yes"
// is worth spending on a moment the user chose, not one we picked for them.
export default function PushOptIn({ token }: Props) {
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    if (!supported) return
    if (Notification.permission !== 'default') return
    if (localStorage.getItem(DISMISS_KEY)) return
    setVisible(true)
  }, [])

  async function enable() {
    setBusy(true)
    setError('')
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!publicKey) throw new Error('Push is not configured yet')

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setVisible(false)
        return
      }

      const registration = await navigator.serviceWorker.register('/sw.js')
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })

      await api.subscribePush(token, subscription.toJSON())
      setVisible(false)
    } catch {
      setError('Could not enable notifications. You can try again later.')
    } finally {
      setBusy(false)
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6 flex items-start gap-3">
      <span className="text-xl">🔔</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-indigo-900">Get notified about new tasks</p>
        <p className="text-xs text-indigo-700 mt-0.5">
          Turn on notifications so you know the moment someone assigns you a task, even when MeetUp is closed.
        </p>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        <div className="flex gap-2 mt-3">
          <button
            onClick={enable}
            disabled={busy}
            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? 'Enabling…' : 'Enable notifications'}
          </button>
          <button
            onClick={dismiss}
            disabled={busy}
            className="px-3 py-1.5 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-100"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
