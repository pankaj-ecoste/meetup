const BASE = process.env.NEXT_PUBLIC_BACKEND_URL

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

  createTask: (token: string, body: object) =>
    authFetch('/tasks', token, { method: 'POST', body: JSON.stringify(body) }),

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
}
