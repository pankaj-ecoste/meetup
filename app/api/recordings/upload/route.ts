import { requireUser, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import { submitTranscription } from '@/lib/server/assemblyai'
import { BUCKET, VALID_JOB_TYPES, isOwnedPath } from '@/lib/server/recordings'

export const runtime = 'nodejs'

// Public origin of THIS deployment, from the incoming request — so the webhook
// URL is correct on any Vercel URL (production, preview, custom domain) with no
// env var to set. SITE_URL is an optional override (e.g. a canonical domain).
function webhookUrlFor(request: Request): string {
  const override = process.env.SITE_URL?.replace(/\/$/, '')
  if (override) return `${override}/api/recordings/webhook`
  const h = request.headers
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const origin = host ? `${proto}://${host}` : new URL(request.url).origin
  return `${origin}/api/recordings/webhook`
}

// POST /api/recordings/upload — step 3 of 3. The audio is ALREADY in Storage
// (the browser put it there directly via the signed token from
// /api/recordings/upload-url), so this receives only the path — a few hundred
// bytes, well clear of Vercel's 4.5 MB function body cap that used to reject
// long meetings outright.
//
// It creates a signed read URL, inserts the job row, and submits to AssemblyAI
// with a webhook callback. Everything downstream of here — the webhook, the
// Claude extractors, Realtime — is unchanged.
//
// The "audio is stored before anything can fail" guarantee is now stronger than
// it was: the file is durably in Storage before this route is even called, so a
// failure here leaves the recording recoverable rather than lost.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const body = (await request.json().catch(() => null)) as
      | { job_type?: string; path?: string }
      | null

    const jobType = String(body?.job_type ?? '')
    const storagePath = String(body?.path ?? '')

    if (!VALID_JOB_TYPES.has(jobType)) {
      throw new HttpError(400, 'Invalid job_type')
    }
    // The path came back from the browser — it is only trustworthy if it sits
    // inside this user's own folder.
    if (!isOwnedPath(storagePath, user.id)) {
      throw new HttpError(400, 'Invalid recording path')
    }

    const admin = supabaseAdmin()

    // 1) Signed read URL for AssemblyAI to fetch the audio. This also doubles
    //    as an existence check — signing a path that was never uploaded fails,
    //    so a job row is never created pointing at nothing.
    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600)
    if (signErr || !signed?.signedUrl) {
      throw new HttpError(400, 'Recording not found in storage')
    }
    const audioUrl = signed.signedUrl

    // 2) Create the job row (audio already stored — safe if anything below fails).
    const { data: job, error: jobErr } = await admin
      .from('recording_jobs')
      .insert({
        user_id: user.id,
        job_type: jobType,
        audio_url: audioUrl,
        status: 'pending',
      })
      .select('id, status, transcript, result, error_msg, created_at')
      .single()
    if (jobErr) throw jobErr

    // 3) Submit to AssemblyAI with the webhook; save the transcript id so the
    //    webhook can find this job. On failure, mark the job errored (never an
    //    infinite spinner) but still return 200 with the job.
    try {
      const transcriptId = await submitTranscription(audioUrl, webhookUrlFor(request))
      await admin
        .from('recording_jobs')
        .update({ status: 'transcribing', transcript_id: transcriptId })
        .eq('id', job.id)
      job.status = 'transcribing'
    } catch (submitErr) {
      const msg = submitErr instanceof Error ? submitErr.message : 'Transcription submit failed'
      await admin
        .from('recording_jobs')
        .update({ status: 'error', error_msg: msg })
        .eq('id', job.id)
      job.status = 'error'
      job.error_msg = msg
    }

    return Response.json(job)
  } catch (e) {
    return jsonError(e)
  }
}
