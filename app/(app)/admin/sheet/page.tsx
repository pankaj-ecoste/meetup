'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAdmin } from '@/lib/useAdmin'
import type { SheetConnection } from '@/lib/types'

const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'

export default function SheetPage() {
  const { token, ready } = useAdmin()
  const [info, setInfo] = useState<SheetConnection | null>(null)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [tick, setTick] = useState(0)
  const load = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    async function run() {
      try {
        const data = await api.sheet(token)
        if (!cancelled) setInfo(data as SheetConnection)
      } catch (e) {
        if (!cancelled) setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not load sheet settings' })
      }
    }
    run()
    return () => { cancelled = true }
  }, [token, tick])

  async function connect(test: boolean) {
    setBusy(true)
    setMsg(null)
    try {
      const r = (await api.connectSheet(token, url, test)) as { warnings?: string[]; tabs?: number }
      if (test) {
        setMsg({ ok: true, text: 'Connection works — MeetUp can open this sheet.' })
      } else {
        const warn = r.warnings?.length ? ` Some tabs had problems: ${r.warnings.join('; ')}` : ''
        setMsg({ ok: !warn, text: `Connected. ${r.tabs ?? 0} department tab(s) are ready.${warn}` })
        setUrl('')
        load()
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not connect' })
    } finally {
      setBusy(false)
    }
  }

  async function retryAll() {
    setBusy(true)
    setMsg(null)
    try {
      const r = (await api.retryAllSyncs(token)) as { synced: number; failed: number }
      setMsg({ ok: r.failed === 0, text: `Retried: ${r.synced} sent to the sheet, ${r.failed} still failing.` })
      load()
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Retry failed' })
    } finally {
      setBusy(false)
    }
  }

  async function copyRobot() {
    if (!info?.robot_email) return
    try {
      await navigator.clipboard.writeText(info.robot_email)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked — the email is visible to copy by hand */ }
  }

  if (!ready) return null

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Sheet Connection</h2>
        <p className="text-sm text-gray-500 mt-1">
          Saved meetings are written as one row each into the tab of their department.
        </p>
      </div>

      {msg && (
        <p className={`text-sm rounded-lg px-3 py-2 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.text}
        </p>
      )}

      <section className="bg-white border border-gray-200 rounded-2xl p-4 space-y-1">
        <h3 className="text-sm font-semibold text-gray-900">Currently linked</h3>
        {info?.sheet_url ? (
          <a href={info.sheet_url} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:text-indigo-700 break-all">
            {info.sheet_url}
          </a>
        ) : (
          <p className="text-sm text-amber-700">No sheet linked yet — meetings are saved but not sent to a sheet.</p>
        )}
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Link a sheet</h3>
        <ol className="text-sm text-gray-600 list-decimal pl-5 space-y-1">
          <li>Create a blank Google Sheet.</li>
          <li>
            Click <b>Share</b> and add this email as <b>Editor</b>:
            <div className="mt-1 flex items-center gap-2">
              <code className="text-xs bg-gray-100 rounded px-2 py-1 break-all">
                {info?.robot_email ?? 'Not configured on the server yet'}
              </code>
              {info?.robot_email && (
                <button onClick={copyRobot} className="text-xs text-indigo-600 font-medium">
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
          </li>
          <li>Paste the sheet link below.</li>
        </ol>
        <input className={INPUT} placeholder="https://docs.google.com/spreadsheets/d/…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <div className="flex gap-2">
          <button
            onClick={() => connect(true)}
            disabled={busy || !url.trim()}
            className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Test connection
          </button>
          <button
            onClick={() => connect(false)}
            disabled={busy || !url.trim()}
            className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            Connect
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Linking a different sheet later: only new meetings go to it. Meetings already in the old sheet stay there.
        </p>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900">
            Not in the sheet yet ({info?.failed.length ?? 0})
          </h3>
          {(info?.failed.length ?? 0) > 0 && (
            <button onClick={retryAll} disabled={busy} className="text-sm text-indigo-600 font-medium hover:text-indigo-700 disabled:opacity-50">
              Retry all
            </button>
          )}
        </div>
        {(info?.failed.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-500">Everything saved has reached the sheet.</p>
        ) : (
          <ul className="space-y-2">
            {info!.failed.map((f) => (
              <li key={f.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                <p className="text-sm font-medium text-gray-900">{f.title}</p>
                <p className="text-xs text-gray-500">{f.department_name}</p>
                {f.sheet_error && <p className="text-xs text-red-600 mt-1">{f.sheet_error}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
