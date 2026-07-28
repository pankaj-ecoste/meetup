'use client'

import { useState } from 'react'
import type { TaskResponse } from '@/lib/types'
import { api } from '@/lib/api'
import ExtensionModal from './ExtensionModal'

type Props = {
  task: TaskResponse
  mode: 'received' | 'allocated'
  token: string
  onUpdated: () => void
}

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-teal-50 text-teal-700 border-teal-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  completed: 'bg-green-50 text-green-700 border-green-200',
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  overdue: 'Overdue',
  completed: 'Completed',
}

export default function TaskCard({ task, mode, token, onUpdated }: Props) {
  const [completing, setCompleting] = useState(false)
  const [note, setNote] = useState('')
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [showExtModal, setShowExtModal] = useState(false)
  const [deciding, setDeciding] = useState<string | null>(null)

  const isOverdue = task.status === 'overdue'
  const isOpen = task.status === 'open' || isOverdue
  const deadline = new Date(task.deadline)
  const isDeadlinePast = deadline < new Date()

  async function markComplete() {
    setCompleting(true)
    try {
      await api.completeTask(token, task.id, note || undefined)
      onUpdated()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setCompleting(false)
      setShowNoteInput(false)
    }
  }

  async function decide(extensionId: string, decision: 'approved' | 'denied') {
    setDeciding(extensionId)
    try {
      await api.decideExtension(token, extensionId, decision)
      onUpdated()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setDeciding(null)
    }
  }

  const pendingExt = (task as unknown as { pending_extension?: { id: string; reason: string; proposed_deadline: string } }).pending_extension

  return (
    <div className={`bg-white rounded-xl border p-4 shadow-sm ${STATUS_STYLES[task.status]}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[task.status]}`}>
            {STATUS_LABELS[task.status]}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
            {task.source === 'meeting' ? 'from meeting' : 'direct'}
          </span>
        </div>
        <span className={`text-xs flex-shrink-0 ${isDeadlinePast && task.status !== 'completed' ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
          Due {deadline.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-800 mb-3 leading-relaxed">{task.description}</p>

      {/* People row */}
      <div className="text-xs text-gray-500 space-y-0.5 mb-3">
        {mode === 'received' && task.assignor_name && (
          <p>From <span className="text-gray-700 font-medium">{task.assignor_name}</span></p>
        )}
        {mode === 'allocated' && task.assignee_name && (
          <p>To <span className="text-gray-700 font-medium">{task.assignee_name}</span></p>
        )}
        {task.report_to_name && (
          <p>Report to <span className="text-gray-700 font-medium">{task.report_to_name}</span></p>
        )}
      </div>

      {/* Pending extension badge (allocated view) */}
      {mode === 'allocated' && pendingExt && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
          <p className="text-xs font-semibold text-amber-800 mb-1">Extension requested</p>
          <p className="text-xs text-amber-700 mb-1">{pendingExt.reason}</p>
          <p className="text-xs text-amber-600 mb-2">
            Proposed: {new Date(pendingExt.proposed_deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => decide(pendingExt.id, 'approved')}
              disabled={deciding === pendingExt.id}
              className="flex-1 text-xs bg-green-600 text-white rounded-lg py-1.5 font-medium hover:bg-green-700 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={() => decide(pendingExt.id, 'denied')}
              disabled={deciding === pendingExt.id}
              className="flex-1 text-xs bg-red-100 text-red-700 rounded-lg py-1.5 font-medium hover:bg-red-200 disabled:opacity-50"
            >
              Deny
            </button>
          </div>
        </div>
      )}

      {/* Actions (received view) */}
      {mode === 'received' && isOpen && (
        <div className="space-y-2">
          {showNoteInput ? (
            <div className="space-y-2">
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Add a completion note (optional)"
                rows={2}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={markComplete}
                  disabled={completing}
                  className="flex-1 text-sm bg-green-600 text-white rounded-lg py-2 font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {completing ? 'Saving…' : 'Mark done'}
                </button>
                <button
                  onClick={() => setShowNoteInput(false)}
                  className="text-sm text-gray-500 hover:text-gray-700 px-3"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setShowNoteInput(true)}
                className="flex-1 text-sm bg-green-600 text-white rounded-lg py-2 font-medium hover:bg-green-700"
              >
                Mark complete
              </button>
              <button
                onClick={() => setShowExtModal(true)}
                className="text-sm bg-amber-50 text-amber-700 border border-amber-200 rounded-lg py-2 px-3 font-medium hover:bg-amber-100"
              >
                More time
              </button>
            </div>
          )}
        </div>
      )}

      {task.completion_note && (
        <p className="text-xs text-gray-500 mt-2 italic">&ldquo;{task.completion_note}&rdquo;</p>
      )}

      {showExtModal && (
        <ExtensionModal
          taskId={task.id}
          token={token}
          onClose={() => setShowExtModal(false)}
          onSubmitted={() => { setShowExtModal(false); onUpdated() }}
        />
      )}
    </div>
  )
}
