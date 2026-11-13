'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAdmin } from '@/lib/useAdmin'
import type { EmployeeRow } from '@/lib/types'

const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'

export default function EmployeesPage() {
  const { token, me, ready } = useAdmin()
  const [rows, setRows] = useState<EmployeeRow[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'employee' | 'admin'>('employee')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [resetFor, setResetFor] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')

  const [tick, setTick] = useState(0)
  const load = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    async function run() {
      try {
        const data = await api.employees(token)
        if (!cancelled) setRows(data as EmployeeRow[])
      } catch (e) {
        if (!cancelled) setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not load employees' })
      }
    }
    run()
    return () => { cancelled = true }
  }, [token, tick])

  async function add() {
    setBusy(true)
    setMsg(null)
    try {
      await api.createEmployee(token, { name, email, password, role })
      setMsg({ ok: true, text: `${name} added. They can sign in with that email and password.` })
      setName(''); setEmail(''); setPassword(''); setRole('employee')
      load()
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not add employee' })
    } finally {
      setBusy(false)
    }
  }

  async function reset(id: string, who: string) {
    setBusy(true)
    setMsg(null)
    try {
      await api.updateEmployee(token, id, { password: newPassword })
      setMsg({ ok: true, text: `Password for ${who} was reset. Tell them the new password.` })
      setResetFor(null)
      setNewPassword('')
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not reset password' })
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string, who: string) {
    if (!window.confirm(`Remove ${who}? They will no longer be able to sign in. Their past meetings stay.`)) return
    setBusy(true)
    setMsg(null)
    try {
      await api.removeEmployee(token, id)
      setMsg({ ok: true, text: `${who} was removed.` })
      load()
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not remove employee' })
    } finally {
      setBusy(false)
    }
  }

  if (!ready) return null

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Employees</h2>

      {msg && (
        <p className={`text-sm rounded-lg px-3 py-2 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.text}
        </p>
      )}

      <section className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Add employee</h3>
        <input className={INPUT} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={INPUT} type="email" placeholder="Email (their login)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={INPUT} type="text" placeholder="Password (min 6 characters)" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
        <select className={`${INPUT} bg-white`} value={role} onChange={(e) => setRole(e.target.value as 'employee' | 'admin')}>
          <option value="employee">Employee</option>
          <option value="admin">Admin</option>
        </select>
        <button
          onClick={add}
          disabled={busy || !name.trim() || !email.trim() || password.length < 6}
          className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          Add employee
        </button>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Everyone ({rows.length})</h3>
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {r.name}
                    {r.role === 'admin' && (
                      <span className="ml-2 text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">Admin</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{r.email}</p>
                </div>
                <div className="flex gap-3 shrink-0 text-xs font-medium">
                  <button onClick={() => { setResetFor(resetFor === r.id ? null : r.id); setNewPassword('') }} className="text-indigo-600 hover:text-indigo-700">
                    Reset password
                  </button>
                  {r.id !== me?.id && (
                    <button onClick={() => remove(r.id, r.name)} disabled={busy} className="text-red-600 hover:text-red-700">
                      Remove
                    </button>
                  )}
                </div>
              </div>
              {resetFor === r.id && (
                <div className="mt-3 flex gap-2">
                  <input className={INPUT} type="text" placeholder="New password (min 6)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="off" />
                  <button
                    onClick={() => reset(r.id, r.name)}
                    disabled={busy || newPassword.length < 6}
                    className="px-4 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Set
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
