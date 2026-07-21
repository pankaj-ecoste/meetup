'use client'

import { useState } from 'react'
import { api } from '@/lib/api'

type Props = {
  taskId: string
  token: string
  onClose: () => void
  onSubmitted: () => void
}

export default function ExtensionModal({ taskId, token, onClose, onSubmitted }: Props) {
  const [reason, setReason] = useState('')
  const [proposedDeadline, setProposedDeadline] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const minDate = new Date()
  minDate.setDate(minDate.getDate() + 1)
  const minDateStr = minDate.toISOString().slice(0, 16)

  async function submit() {
    if (!reason.trim() || !proposedDeadline) return
    setError('')
    setSubmitting(true)
    try {
      await api.requestExtension(token, {
        task_id: taskId,
        reason: reason.trim(),
        proposed_deadline: new Date(proposedDeadline).toISOString(),
      })
      onSubmitted()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
        <h3 className="text-base font-semibold mb-1">Request more time</h3>
        <p className="text-sm text-gray-500 mb-4">
          Explain the bottleneck and propose a new deadline. Your assignor will approve or deny.
        </p>

        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Reason <span className="text-red-500">*</span>
        </label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Explain why you need more time…"
          rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
        />

        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Proposed new deadline <span className="text-red-500">*</span>
        </label>
        <input
          type="datetime-local"
          value={proposedDeadline}
          min={minDateStr}
          onChange={e => setProposedDeadline(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
        />

        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={submit}
            disabled={!reason.trim() || !proposedDeadline || submitting}
            className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting…' : 'Request extension'}
          </button>
          <button
            onClick={onClose}
            className="px-4 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg py-2.5"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
