'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import TaskCard from '@/components/TaskCard'
import type { TaskResponse } from '@/lib/types'

export default function AllocatedPage() {
  const [token, setToken] = useState('')
  const [tasks, setTasks] = useState<TaskResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)

  const PAGE_SIZE = 20

  const fetchTasks = useCallback(async (tok: string, q: string, p: number) => {
    setLoading(true)
    try {
      const data: TaskResponse[] = await api.tasksAllocated(tok, p, q)
      setTasks(data)
      setHasMore(data.length === PAGE_SIZE)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setToken(session.access_token)
      fetchTasks(session.access_token, '', 1)
    }
    init()
  }, [fetchTasks])

  useEffect(() => {
    if (!token) return
    const t = setTimeout(() => { setPage(1); fetchTasks(token, search, 1) }, 300)
    return () => clearTimeout(t)
  }, [search, token, fetchTasks])

  function refresh() {
    if (token) fetchTasks(token, search, page)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h2 className="text-xl font-bold text-gray-900 mb-5">Tasks Allocated</h2>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search tasks…"
        className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          {search ? 'No tasks match your search.' : "You haven't allocated any tasks yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              mode="allocated"
              token={token}
              onUpdated={refresh}
            />
          ))}
        </div>
      )}

      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            onClick={() => { const p = page - 1; setPage(p); fetchTasks(token, search, p) }}
            disabled={page === 1}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">Page {page}</span>
          <button
            onClick={() => { const p = page + 1; setPage(p); fetchTasks(token, search, p) }}
            disabled={!hasMore}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
