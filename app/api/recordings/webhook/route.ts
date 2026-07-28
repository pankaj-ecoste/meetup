import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { verifyWebhookSecret, getTranscriptText } from '@/lib/server/assemblyai'
import { extractTask, extractMeeting, extractIdea } from '@/lib/server/claude'

export const runtime = 'nodejs'

const NO_SPEECH =
  'No speech detected in the recording. Please record again and speak clearly for a few seconds.'

// POST /api/recordings/webhook — AssemblyAI callback. NOT user-authed: it is
// authenticated by the AssemblyAI webhook secret header. Finds the job by
// transcript id, runs Claude extraction, and writes the result. Idempotent:
// a duplicate callback for an already-finished job is ignored.
export async function POST(request: Request) {
  // Secret gate first — reject anything not carrying our webhook secret.
  if (!verifyWebhookSecret(request)) {
    return Response.json({ detail: 'invalid webhook secret' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as
    | { transcript_id?: string; status?: string; error?: string }
    | null
  const transcriptId = body?.transcript_id
  if (!transcriptId) {
    return Response.json({ detail: 'missing transcript_id' }, { status: 400 })
  }

  const admin = supabaseAdmin()
  const { data: job } = await admin
    .from('recording_jobs')
    .select('id, job_type, status')
    .eq('transcript_id', transcriptId)
    .single()

  // No job for this transcript, or already finished → ack without reprocessing.
  if (!job) return Response.json({ ok: true, note: 'no matching job' })
  if (job.status === 'done' || job.status === 'error') {
    return Response.json({ ok: true, note: 'already processed' })
  }

  const update = (fields: Record<string, unknown>) =>
    admin.from('recording_jobs').update(fields).eq('id', job.id)

  try {
    // AssemblyAI itself reported a failure.
    if (body?.status === 'error') {
      await update({ status: 'error', error_msg: body.error ?? 'Transcription failed' })
      return Response.json({ ok: true })
    }

    const transcript = await getTranscriptText(transcriptId)
    if (!transcript.trim()) {
      await update({ status: 'error', transcript: '', error_msg: NO_SPEECH })
      return Response.json({ ok: true })
    }

    await update({ status: 'extracting', transcript })

    const result =
      job.job_type === 'task_delegation'
        ? await extractTask(transcript)
        : job.job_type === 'meeting'
          ? await extractMeeting(transcript)
          : await extractIdea(transcript)

    await update({ status: 'done', result })
    return Response.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Pipeline failed'
    await update({ status: 'error', error_msg: msg })
    return Response.json({ ok: true })
  }
}
