import { requireUser, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import { submitTranscription } from '@/lib/server/assemblyai'

export const runtime = 'nodejs'

const BUCKET = 'audio'
const VALID_JOB_TYPES = new Set(['task_delegation', 'meeting', 'idea'])

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

// POST /api/recordings/upload — store the audio, create a job, submit it to
// AssemblyAI with a webhook callback, and return immediately. Audio is stored
// BEFORE processing (reliability: never lose a recording). The long
// transcription runs on AssemblyAI's servers; the webhook finishes the job.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const form = await request.formData()
    const jobType = String(form.get('job_type') ?? '')
    const file = form.get('file')

    if (!VALID_JOB_TYPES.has(jobType)) {
      throw new HttpError(400, 'Invalid job_type')
    }
    if (!(file instanceof File)) {
      throw new HttpError(400, 'Missing audio file')
    }

    const admin = supabaseAdmin()

    // 1) Store the audio in the private `audio` bucket.
    const dot = file.name?.lastIndexOf('.')
    const ext = dot !== undefined && dot > -1 ? file.name.slice(dot + 1) : 'webm'
    const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, file, {
        contentType: file.type || 'audio/webm',
        upsert: false,
      })
    if (upErr) throw upErr

    // 2) Short-lived signed URL for AssemblyAI to fetch the audio.
    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600)
    if (signErr || !signed?.signedUrl) throw signErr ?? new Error('signed URL failed')
    const audioUrl = signed.signedUrl

    // 3) Create the job row (audio already stored — safe if anything below fails).
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

    // 4) Submit to AssemblyAI with the webhook; save the transcript id so the
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
