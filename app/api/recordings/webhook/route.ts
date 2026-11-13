import { after } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { verifyWebhookSecret } from '@/lib/server/assemblyai'
import { claimJob, friendlyTranscriptionError, processCompleted } from '@/lib/server/jobPipeline'

export const runtime = 'nodejs'

// POST /api/recordings/webhook — AssemblyAI callback. NOT user-authed: it is
// authenticated by the AssemblyAI webhook secret header.
//
// AssemblyAI waits only 10 SECONDS for a 2xx; otherwise it counts the delivery
// as failed and re-sends every 10 s (up to 10 times). The slow work here — fetch
// the transcript, run Claude, 30-60 s — therefore must NOT happen before we
// answer. So this handler only:
//   1. verifies the secret,
//   2. atomically CLAIMS the job (transcribing -> extracting; exactly one caller
//      can win, so a re-send or a racing reaper run is acknowledged and ignored),
//   3. replies 200 at once, and
//   4. does the real work in after(), which keeps the function alive after the
//      response is sent (Vercel waitUntil).
// If that background work dies, the job stays in `extracting` and the stuck-job
// checker (/api/cron/reap-jobs) picks it up.
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
    .select('id, status')
    .eq('transcript_id', transcriptId)
    .single()

  // No job for this transcript, or already finished → ack without reprocessing.
  if (!job) return Response.json({ ok: true, note: 'no matching job' })
  if (job.status === 'done' || job.status === 'error') {
    return Response.json({ ok: true, note: 'already processed' })
  }

  // AssemblyAI itself reported a failure. Its "no spoken audio" error is
  // internal jargon and reaches the user as a red box they can do nothing with —
  // so it is translated into an actionable message.
  if (body?.status === 'error') {
    await claimJob(admin, job.id, ['pending', 'transcribing'], {
      status: 'error',
      error_msg: friendlyTranscriptionError(body.error ?? ''),
    })
    return Response.json({ ok: true })
  }

  // Exactly-once: only the caller that flips transcribing -> extracting runs the
  // pipeline. A duplicate delivery (or the reaper) finds it already taken.
  const claimed = await claimJob(admin, job.id, ['transcribing'], { status: 'extracting' })
  if (!claimed) {
    return Response.json({ ok: true, note: 'already being processed' })
  }

  after(() => processCompleted(job.id, transcriptId))
  return Response.json({ ok: true })
}
