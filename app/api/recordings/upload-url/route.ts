import { requireUser, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import { BUCKET, VALID_JOB_TYPES, extFromFilename, storagePathFor } from '@/lib/server/recordings'

export const runtime = 'nodejs'

// POST /api/recordings/upload-url — step 1 of 3 in the recording upload flow.
//
// Why this route exists: audio used to be POSTed through the Vercel function as
// multipart form data, but Vercel caps a function's request body at 4.5 MB at
// the infrastructure level — it cannot be raised from vercel.json or code. A
// 30-minute Opus recording is ~14 MB, so meetings past roughly 10 minutes were
// rejected with a 413 before the handler ever ran, losing the recording.
//
// Now the browser uploads STRAIGHT to Supabase Storage and this function only
// hands out a short-lived signed upload token (a few hundred bytes each way),
// so the 4.5 MB cap no longer applies to the audio. The ceiling becomes the
// Supabase bucket's own file-size limit.
//
// Security: the SERVER builds the storage path from the authenticated user's
// id — the browser never chooses where a file lands, so nobody can write into
// another user's folder. The returned token is scoped to that one path and
// expires (Supabase signs it for 2 hours).
export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const body = (await request.json().catch(() => null)) as
      | { job_type?: string; filename?: string }
      | null

    const jobType = String(body?.job_type ?? '')
    if (!VALID_JOB_TYPES.has(jobType)) {
      throw new HttpError(400, 'Invalid job_type')
    }

    const ext = extFromFilename(body?.filename)
    const path = storagePathFor(user.id, ext)

    const { data, error } = await supabaseAdmin()
      .storage.from(BUCKET)
      .createSignedUploadUrl(path)
    if (error || !data?.token) {
      throw error ?? new Error('Could not create upload URL')
    }

    return Response.json({ path: data.path, token: data.token })
  } catch (e) {
    return jsonError(e)
  }
}
