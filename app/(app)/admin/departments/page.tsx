'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAdmin } from '@/lib/useAdmin'
import type { Department } from '@/lib/types'

const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'

export default function DepartmentsPage() {
  const { token, ready } = useAdmin()
  const [rows, setRows] = useState<Department[]>([])
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [tick, setTick] = useState(0)
  const load = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    async function run() {
      try {
        const data = await api.adminDepartments(token)
        if (!cancelled) setRows(data as Department[])
      } catch (e) {
        if (!cancelled) setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not load departments' })
      }
    }
    run()
    return () => { cancelled = true }
  }, [token, tick])

  async function run(fn: () => Promise<unknown>, okText: string) {
    setBusy(true)
    setMsg(null)
    try {
      const r = (await fn()) as { tab_warning?: string | null }
      setMsg(
        r?.tab_warning
          ? { ok: false, text: `${okText} But the sheet tab was not updated: ${r.tab_warning}` }
          : { ok: true, text: okText },
      )
      load()
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong' })
    } finally {
      setBusy(false)
    }
  }

  if (!ready) return null

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Departments</h2>
        <p className="text-sm text-gray-500 mt-1">
          Each department gets its own tab in the sheet (same name). Deactivating hides it from the
          dropdown; its tab and data are never deleted.
        </p>
      </div>

      {msg && (
        <p className={`text-sm rounded-lg px-3 py-2 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          {msg.text}
        </p>
      )}

      <section className="bg-white border border-gray-200 rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Add department</h3>
        <div className="flex gap-2">
          <input className={INPUT} placeholder="e.g. Sales" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
          <button
            onClick={async () => { await run(() => api.createDepartment(token, name), `${name} added.`); setName('') }}
            disabled={busy || !name.trim()}
            className="px-4 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </section>

      <ul className="space-y-2">
        {rows.map((d) => (
          <li key={d.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            {editing === d.id ? (
              <div className="flex gap-2">
                <input className={INPUT} value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={50} />
                <button
                  onClick={async () => { await run(() => api.updateDepartment(token, d.id, { name: editName }), 'Renamed.'); setEditing(null) }}
                  disabled={busy || !editName.trim()}
                  className="px-4 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  Save
                </button>
                <button onClick={() => setEditing(null)} className="px-3 text-sm text-gray-500">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className={`text-sm font-medium ${d.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                  {d.name}
                  {!d.is_active && <span className="ml-2 text-[11px] no-underline text-gray-400">(inactive)</span>}
                </p>
                <div className="flex gap-3 text-xs font-medium shrink-0">
                  <button onClick={() => { setEditing(d.id); setEditName(d.name) }} className="text-indigo-600 hover:text-indigo-700">Rename</button>
                  <button
                    onClick={() => run(() => api.updateDepartment(token, d.id, { is_active: !d.is_active }), d.is_active ? `${d.name} deactivated.` : `${d.name} reactivated.`)}
                    disabled={busy}
                    className={d.is_active ? 'text-red-600 hover:text-red-700' : 'text-green-700 hover:text-green-800'}
                  >
                    {d.is_active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {rows.length === 0 && <p className="text-sm text-gray-500">No departments yet.</p>}
      </ul>
    </div>
  )
}
