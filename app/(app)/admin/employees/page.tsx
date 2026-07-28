'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import type { EmployeeRow, CompanyBrief, DesignationBrief, UserProfile } from '@/lib/types'

type FormState = {
  name: string
  email: string
  phone: string
  company_id: string
  designation_id: string
}

const EMPTY_FORM: FormState = { name: '', email: '', phone: '', company_id: '', designation_id: '' }

export default function ManageEmployeesPage() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [authChecked, setAuthChecked] = useState(false)
  const [isLeadership, setIsLeadership] = useState(false)

  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [companies, setCompanies] = useState<CompanyBrief[]>([])
  const [designations, setDesignations] = useState<DesignationBrief[]>([])
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async (tok: string) => {
    setLoading(true)
    try {
      const data = await api.employees(tok)
      setEmployees(data.employees)
      setCompanies(data.companies)
      setDesignations(data.designations)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const tok = session.access_token
      setToken(tok)

      try {
        const profile: UserProfile = await api.me(tok)
        if (profile.capability_tier !== 'leadership') {
          setAuthChecked(true)
          setIsLeadership(false)
          return
        }
        setIsLeadership(true)
        await load(tok)
      } catch { /* ignore */ }

      setAuthChecked(true)
    }
    init()
  }, [load])

  const missing = {
    name: !form.name.trim(),
    email: !form.email.trim(),
    company_id: !form.company_id,
  }
  const hasError = submitted && Object.values(missing).some(Boolean)

  async function submit() {
    setSubmitted(true)
    setError('')
    setSuccess('')
    if (missing.name || missing.email || missing.company_id) return

    setSubmitting(true)
    try {
      await api.createEmployee(token, {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        company_id: Number(form.company_id),
        designation_id: form.designation_id || undefined,
      })
      setSuccess(`${form.name.trim()} added. They'll set a password the first time they log in via /claim.`)
      setForm(EMPTY_FORM)
      setSubmitted(false)
      await load(token)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!authChecked) {
    return <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
  }

  if (!isLeadership) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-lg font-semibold mb-2">Access restricted</h2>
        <p className="text-gray-500 text-sm mb-4">
          This view is only available to leadership-tier accounts.
        </p>
        <button onClick={() => router.push('/')} className="text-indigo-600 text-sm hover:underline">
          Back to dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Manage Employees</h2>
      <p className="text-sm text-gray-500 mb-6">
        Add a new employee — they claim their account (set a password, verify by OTP) the first time they log in.
      </p>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-8 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name {submitted && missing.name && <span className="text-red-500">— required</span>}
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                submitted && missing.name ? 'border-red-400 bg-red-50' : 'border-gray-300'
              }`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email {submitted && missing.email && <span className="text-red-500">— required</span>}
            </label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                submitted && missing.email ? 'border-red-400 bg-red-50' : 'border-gray-300'
              }`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone (optional)</label>
            <input
              type="text"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company {submitted && missing.company_id && <span className="text-red-500">— required</span>}
            </label>
            <select
              value={form.company_id}
              onChange={e => setForm({ ...form, company_id: e.target.value })}
              className={`w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                submitted && missing.company_id ? 'border-red-400 bg-red-50' : 'border-gray-300'
              }`}
            >
              <option value="">Select company…</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
            <select
              value={form.designation_id}
              onChange={e => setForm({ ...form, designation_id: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Employee (default)</option>
              {designations.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>

        {hasError && (
          <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            Fill in all required fields before submitting.
          </p>
        )}
        {error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}
        {success && (
          <p className="text-teal-700 text-sm bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">{success}</p>
        )}

        <button
          onClick={submit}
          disabled={submitting}
          className="bg-indigo-600 text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Adding…' : 'Add employee'}
        </button>
      </div>

      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        All employees ({employees.length})
      </h3>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : employees.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">No employees yet.</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Company</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Designation</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{emp.name}</p>
                    <p className="text-xs text-gray-400">{emp.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{emp.company_name}</td>
                  <td className="px-4 py-3 text-gray-600">{emp.designation_name || '–'}</td>
                  <td className="px-4 py-3">
                    {!emp.is_active ? (
                      <span className="text-xs font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5">Inactive</span>
                    ) : emp.password_set ? (
                      <span className="text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5">Active</span>
                    ) : (
                      <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Pending sign-up</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
