import 'server-only'
import { timingSafeEqual } from 'crypto'

// AssemblyAI submit-with-webhook client (REST via fetch — no SDK needed, and
// fetch-based code runs fine on the Vercel Node runtime).
//
// New pipeline (plan.md §9.1-C): submit the audio with a webhook_url and a
// secret auth header; AssemblyAI transcribes on its own servers and POSTs our
// webhook when done. Language is set to detection (objective ACCURATE) rather
// than the old forced language_code="hi".

const API_BASE = 'https://api.assemblyai.com/v2'

// Name of the auth header AssemblyAI echoes back on the webhook callback.
const WEBHOOK_HEADER = 'x-meetup-webhook-secret'

function apiKey(): string {
  const key = process.env.ASSEMBLYAI_API_KEY
  if (!key) throw new Error('Missing ASSEMBLYAI_API_KEY')
  return key
}

function webhookSecret(): string {
  const secret = process.env.ASSEMBLYAI_WEBHOOK_SECRET
  if (!secret) throw new Error('Missing ASSEMBLYAI_WEBHOOK_SECRET')
  return secret
}

/**
 * Submit an audio URL (a Supabase Storage signed URL) to AssemblyAI with a
 * webhook callback. `webhookUrl` is the absolute URL AssemblyAI will POST to
 * when done — the caller derives it from the incoming request's own origin,
 * so no SITE_URL env var / redeploy dance is needed. Returns the AssemblyAI
 * transcript id — save it on the recording_jobs row so the webhook can find it.
 */
export async function submitTranscription(
  audioUrl: string,
  webhookUrl: string,
): Promise<string> {
  const res = await fetch(`${API_BASE}/transcript`, {
    method: 'POST',
    headers: {
      authorization: apiKey(),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      language_detection: true,
      speaker_labels: true,
      webhook_url: webhookUrl,
      webhook_auth_header_name: WEBHOOK_HEADER,
      webhook_auth_header_value: webhookSecret(),
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText)
    throw new Error(`AssemblyAI submit failed (${res.status}): ${body}`)
  }
  const data = (await res.json()) as { id: string }
  return data.id
}

/**
 * Verify the secret header AssemblyAI attaches to a webhook callback.
 * Returns true only if the header matches ASSEMBLYAI_WEBHOOK_SECRET.
 */
export function verifyWebhookSecret(req: Request): boolean {
  const received = req.headers.get(WEBHOOK_HEADER) ?? ''
  const expected = webhookSecret()
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export type TranscriptResult = {
  // Flat merged text — what task_delegation and idea extraction read.
  text: string
  // Speaker-tagged ("Speaker A: … \n Speaker B: …") — what meeting
  // extraction reads instead, so Claude can reason about who said what.
  // Falls back to the flat text when AssemblyAI returns no utterances
  // (e.g. a single-speaker recording).
  taggedText: string
}

/**
 * Fetch a finished transcript by id (used inside the webhook once
 * AssemblyAI signals completion). `text` is '' when no speech was detected.
 * `utterances` (present because every submission sets speaker_labels: true)
 * is what makes `taggedText` possible.
 */
export async function getTranscript(transcriptId: string): Promise<TranscriptResult> {
  const res = await fetch(`${API_BASE}/transcript/${transcriptId}`, {
    headers: { authorization: apiKey() },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText)
    throw new Error(`AssemblyAI fetch failed (${res.status}): ${body}`)
  }
  const data = (await res.json()) as {
    status: string
    text?: string | null
    error?: string
    utterances?: { speaker: string; text: string }[] | null
  }
  if (data.status === 'error') {
    throw new Error(`AssemblyAI transcription error: ${data.error}`)
  }
  const text = data.text ?? ''
  const taggedText =
    data.utterances && data.utterances.length > 0
      ? data.utterances.map((u) => `Speaker ${u.speaker}: ${u.text}`).join('\n')
      : text
  return { text, taggedText }
}

export { WEBHOOK_HEADER }
