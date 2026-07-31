// Same-origin: the API is now Next.js Route Handlers under /api (serverless
// build §9.1). No NEXT_PUBLIC_BACKEND_URL, no CORS. Path strings below are
// unprefixed (e.g. '/auth/me'), so BASE supplies the '/api' segment.
const BASE = '/api'

async function authFetch(path: string, token: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(options.headers as Record<string, string>),
  }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? 'Request failed')
  }
  return res.json()
}

export const api = {
  me: (token: string) =>
    authFetch('/auth/me', token),

  users: (token: string, search = '') =>
    authFetch(`/users?search=${encodeURIComponent(search)}`, token),

  dashboard: (token: string) =>
    authFetch('/tasks/dashboard', token),

  tasksReceived: (token: string, page = 1, search = '') =>
    authFetch(`/tasks/received?page=${page}&search=${encodeURIComponent(search)}`, token),

  tasksAllocated: (token: string, page = 1, search = '') =>
    authFetch(`/tasks/allocated?page=${page}&search=${encodeURIComponent(search)}`, token),

  createTaskBatch: (token: string, body: object) =>
    authFetch('/tasks/batch', token, { method: 'POST', body: JSON.stringify(body) }),

  completeTask: (token: string, taskId: string, note?: string) =>
    authFetch(`/tasks/${taskId}/complete`, token, {
      method: 'PATCH',
      body: JSON.stringify({ completion_note: note ?? null }),
    }),

  meetings: (token: string, page = 1) =>
    authFetch(`/meetings?page=${page}`, token),

  meeting: (token: string, id: string) =>
    authFetch(`/meetings/${id}`, token),

  createMeetingBatch: (token: string, body: object) =>
    authFetch('/meetings/batch', token, { method: 'POST', body: JSON.stringify(body) }),

  sharedMeetings: (token: string, page = 1) =>
    authFetch(`/meetings/shared?page=${page}`, token),

  ideas: (token: string, page = 1) =>
    authFetch(`/ideas?page=${page}`, token),

  createIdea: (token: string, body: object) =>
    authFetch('/ideas', token, { method: 'POST', body: JSON.stringify(body) }),

  requestExtension: (token: string, body: object) =>
    authFetch('/extensions', token, { method: 'POST', body: JSON.stringify(body) }),

  decideExtension: (token: string, id: string, decision: 'approved' | 'denied') =>
    authFetch(`/extensions/${id}/decide`, token, {
      method: 'PATCH',
      body: JSON.stringify({ decision }),
    }),

  myPerformance: (token: string) =>
    authFetch('/performance/me', token),

  myExtensions: (token: string) =>
    authFetch('/performance/extensions/my', token),

  orgPerformance: (token: string, search = '') =>
    authFetch(`/performance/org?search=${encodeURIComponent(search)}`, token),

  leadershipToday: (token: string) =>
    authFetch('/leadership/today', token),

  leadershipTasks: (
    token: string,
    params: {
      assignedFrom?: string
      assignedTo?: string
      deadlineFrom?: string
      deadlineTo?: string
      search?: string
      page?: number
    },
  ) => {
    const sp = new URLSearchParams()
    if (params.assignedFrom) sp.set('assigned_from', params.assignedFrom)
    if (params.assignedTo) sp.set('assigned_to', params.assignedTo)
    if (params.deadlineFrom) sp.set('deadline_from', params.deadlineFrom)
    if (params.deadlineTo) sp.set('deadline_to', params.deadlineTo)
    if (params.search) sp.set('search', params.search)
    sp.set('page', String(params.page ?? 1))
    return authFetch(`/leadership/tasks?${sp.toString()}`, token)
  },

  employees: (token: string) =>
    authFetch('/admin/employees', token),

  createEmployee: (token: string, body: object) =>
    authFetch('/admin/employees', token, { method: 'POST', body: JSON.stringify(body) }),

  recordingJob: (token: string, jobId: string) =>
    authFetch(`/recordings/jobs/${jobId}`, token),

  uploadRecording: async (token: string, file: Blob, jobType: string, filename: string) => {
    const form = new FormData()
    form.append('file', file, filename)
    form.append('job_type', jobType)
    const res = await fetch(`${BASE}/recordings/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail ?? 'Upload failed')
    }
    return res.json()
  },

  subscribePush: (token: string, sub: PushSubscriptionJSON) =>
    authFetch('/push/subscribe', token, { method: 'POST', body: JSON.stringify(sub) }),

  unsubscribePush: (token: string, endpoint: string) =>
    authFetch('/push/subscribe', token, { method: 'DELETE', body: JSON.stringify({ endpoint }) }),
}
