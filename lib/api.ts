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
  me: (token: string) => authFetch('/auth/me', token),

  users: (token: string) => authFetch('/users', token),

  departments: (token: string) => authFetch('/departments', token),

  meetings: (token: string, page = 1, all = false) =>
    authFetch(`/meetings?page=${page}${all ? '&all=1' : ''}`, token),

  meeting: (token: string, id: string) => authFetch(`/meetings/${id}`, token),

  saveMeeting: (token: string, body: object) =>
    authFetch('/meetings', token, { method: 'POST', body: JSON.stringify(body) }),

  retryMeetingSync: (token: string, id: string) =>
    authFetch(`/meetings/${id}/sync`, token, { method: 'POST' }),

  // ── Admin ──────────────────────────────────────────────────────────────
  employees: (token: string) => authFetch('/admin/employees', token),

  createEmployee: (token: string, body: object) =>
    authFetch('/admin/employees', token, { method: 'POST', body: JSON.stringify(body) }),

  updateEmployee: (token: string, id: string, body: object) =>
    authFetch(`/admin/employees/${id}`, token, { method: 'PATCH', body: JSON.stringify(body) }),

  removeEmployee: (token: string, id: string) =>
    authFetch(`/admin/employees/${id}`, token, { method: 'DELETE' }),

  adminDepartments: (token: string) => authFetch('/admin/departments', token),

  createDepartment: (token: string, name: string) =>
    authFetch('/admin/departments', token, { method: 'POST', body: JSON.stringify({ name }) }),

  updateDepartment: (token: string, id: string, body: object) =>
    authFetch(`/admin/departments/${id}`, token, { method: 'PATCH', body: JSON.stringify(body) }),

  sheet: (token: string) => authFetch('/admin/sheet', token),

  connectSheet: (token: string, url: string, test = false) =>
    authFetch('/admin/sheet', token, { method: 'POST', body: JSON.stringify({ url, test }) }),

  retryAllSyncs: (token: string) =>
    authFetch('/admin/sheet/retry', token, { method: 'POST' }),

  // ── Recording ──────────────────────────────────────────────────────────
  recordingJob: (token: string, jobId: string) =>
    authFetch(`/recordings/jobs/${jobId}`, token),

  // Recording upload is a three-step flow — see useRecordingJob.ts, which
  // orchestrates it. The audio itself does NOT pass through these calls: it
  // goes straight from the browser to Supabase Storage, because Vercel caps
  // function request bodies at 4.5 MB and a long meeting is far bigger.

  // Step 1: ask the server for a signed upload token (server picks the path).
  recordingUploadUrl: (token: string, jobType: string, filename: string) =>
    authFetch('/recordings/upload-url', token, {
      method: 'POST',
      body: JSON.stringify({ job_type: jobType, filename }),
    }) as Promise<{ path: string; token: string }>,

  // Step 3: tell the server the audio has landed, so it can create the job and
  // submit to AssemblyAI. Sends only the path — a few hundred bytes.
  createRecordingJob: (token: string, jobType: string, path: string) =>
    authFetch('/recordings/upload', token, {
      method: 'POST',
      body: JSON.stringify({ job_type: jobType, path }),
    }),
}
