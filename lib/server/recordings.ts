import 'server-only'

// Shared between the two halves of the recording upload flow:
//   1. POST /api/recordings/upload-url  → mints a signed upload token
//   2. browser                          → uploads straight to Supabase Storage
//   3. POST /api/recordings/upload      → creates the job, submits to AssemblyAI
// Keeping the bucket name, job types and path rules in one place is what makes
// step 3 able to re-derive and verify what step 1 handed out.

export const BUCKET = 'audio'

export const VALID_JOB_TYPES = new Set(['task_delegation', 'meeting', 'idea'])

/**
 * Smallest audio worth submitting. Mirrors MIN_RECORDING_BYTES in
 * RecordButton — roughly half a second at 32 kbps. Below this there is nothing
 * to transcribe, and submitting anyway produces a job that can only fail.
 */
export const MIN_AUDIO_BYTES = 2048

// Extensions MediaRecorder can actually produce here (see RecordButton's
// mimeType probe). Anything else falls back to webm rather than being trusted —
// the filename comes from the browser, so it is never used verbatim in a path.
const ALLOWED_EXTS = new Set(['webm', 'mp4', 'm4a', 'ogg', 'wav'])

export function extFromFilename(filename?: string | null): string {
  const dot = filename?.lastIndexOf('.') ?? -1
  if (dot < 0) return 'webm'
  const ext = filename!.slice(dot + 1).toLowerCase()
  return ALLOWED_EXTS.has(ext) ? ext : 'webm'
}

/** `{user_id}/{uuid}.{ext}` — the server always picks this, never the client. */
export function storagePathFor(userId: string, ext: string): string {
  return `${userId}/${crypto.randomUUID()}.${ext}`
}

/**
 * Step 3 receives the storage path back from the browser, so it must not be
 * trusted. A path is only acceptable if it sits directly inside the caller's
 * own `{user_id}/` folder — no traversal, no nesting, no other user's audio.
 *
 * Without this check a user could pass someone else's path and be handed a
 * transcript of their recording.
 */
export function isOwnedPath(path: string, userId: string): boolean {
  if (typeof path !== 'string' || path.includes('..')) return false
  const parts = path.split('/')
  return parts.length === 2 && parts[0] === userId && parts[1].length > 0
}
