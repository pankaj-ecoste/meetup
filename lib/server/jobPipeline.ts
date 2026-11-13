import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from './supabaseAdmin'
import { getTranscript, getTranscriptStatus } from './assemblyai'
import { extractMeeting } from './claude'

// The server half of a recording job, after AssemblyAI has the audio:
//
//   transcribing --(AssemblyAI webhook)--> extracting --(Claude)--> done | error
//
// Two things used to be wrong with how this ran inside the webhook:
//
// 1. AssemblyAI waits only 10 seconds for a 2xx and otherwise re-sends the
//    webhook every 10 s (up to 10 times). Our handler ran Claude INLINE (30-60 s)
//    and only skipped jobs that were already done/error, so every re-send of a
//    job still in `extracting` ran the whole thing again — extra paid Opus calls
//    and several writers on one row. Fix: claim the job atomically (only ONE
//    caller can move transcribing -> extracting), answer immediately, and do the
//    slow work after the response.
// 2. Nothing ever rescued a job whose webhook was lost or whose function died
//    mid-way; it sat in `transcribing`/`extracting` forever. reapStuckJobs() is
//    that rescue, run on a schedule by /api/cron/reap-jobs.
//
// Every state change below is a conditional UPDATE (`... where status = <expected>`),
// so concurrent callers — a duplicate webhook, two reaper runs, a webhook racing
// the reaper — can never both win and can never overwrite a finished job.

export const NO_SPEECH =
  'No speech detected in the recording. Please record again and speak clearly for a few seconds.'
const TIMED_OUT = 'This recording took too long to process and was stopped. Please record it again.'
const INTERRUPTED = 'The upload was interrupted before processing started. Please record it again.'

/** A job with no progress for this long is "stuck" and worth looking at. */
export const STALE_MS = 4 * 60 * 1000
/**
 * Past this age the user's phone has long since shown an error (it gives up at
 * 15 min), so a result could never be seen. We stop SPENDING on the job (no
 * more AssemblyAI/Claude calls) and just mark it failed.
 */
export const GIVE_UP_MS = 20 * 60 * 1000
/** Jobs handled per run, oldest first — keeps one run well inside the function limit. */
export const REAP_BATCH = 5

type Status = 'pending' | 'transcribing' | 'extracting' | 'done' | 'error'

export type PipelineDeps = {
  admin: SupabaseClient
  getTranscript: typeof getTranscript
  getTranscriptStatus: typeof getTranscriptStatus
  extractMeeting: typeof extractMeeting
  now: () => number
}

export function defaultDeps(): PipelineDeps {
  return { admin: supabaseAdmin(), getTranscript, getTranscriptStatus, extractMeeting, now: Date.now }
}

/** AssemblyAI's "no spoken audio" error is jargon; show the actionable message instead. */
export function friendlyTranscriptionError(raw: string): string {
  return /no spoken audio|no audio/i.test(raw) ? NO_SPEECH : raw || 'Transcription failed'
}

/**
 * Atomically move a job from one of `from` to a new state. Returns true only for
 * the single caller that actually changed the row. `staleBefore` (ISO) also
 * requires the row to have made no progress since then, so a job that just moved
 * on is never grabbed by a stale decision.
 */
export async function claimJob(
  admin: SupabaseClient,
  jobId: string,
  from: Status[],
  patch: Record<string, unknown>,
  staleBefore?: string,
): Promise<boolean> {
  let q = admin.from('recording_jobs').update(patch).eq('id', jobId).in('status', from)
  if (staleBefore) q = q.lt('updated_at', staleBefore)
  const { data, error } = await q.select('id')
  if (error) {
    console.error('[jobs] claim failed:', error.message)
    return false
  }
  return (data?.length ?? 0) === 1
}

/**
 * Run the slow part for a job the caller has ALREADY claimed (status is
 * `extracting`): fetch the transcript, extract with Claude, write the result.
 * Every write is guarded by `status = 'extracting'`, so a late or duplicate run
 * can never overwrite a job that already finished. Never throws.
 */
export async function processCompleted(
  jobId: string,
  transcriptId: string,
  deps: PipelineDeps = defaultDeps(),
): Promise<'done' | 'error'> {
  const write = async (patch: Record<string, unknown>) => {
    const { error } = await deps.admin
      .from('recording_jobs')
      .update(patch)
      .eq('id', jobId)
      .eq('status', 'extracting')
    if (error) console.error('[jobs] write failed:', error.message)
  }

  try {
    const { text, taggedText } = await deps.getTranscript(transcriptId)
    if (!text.trim()) {
      await write({ status: 'error', transcript: '', error_msg: NO_SPEECH })
      return 'error'
    }

    // Speaker-tagged transcript so Claude can reason about who said what.
    await write({ transcript: taggedText })

    // Employee directory → Claude + the server match spoken names to it.
    const { data: people } = await deps.admin
      .from('users')
      .select('name')
      .eq('is_active', true)
      .order('name')
    const names = (people ?? []).map((p) => p.name as string)

    const result = await deps.extractMeeting(taggedText, names)
    await write({ status: 'done', result })
    return 'done'
  } catch (e) {
    await write({ status: 'error', error_msg: e instanceof Error ? e.message : 'Pipeline failed' })
    return 'error'
  }
}

export type ReapSummary = {
  checked: number
  rescued: number // finished now
  failed: number // marked error with a clear message
  timed_out: number // older than GIVE_UP_MS, stopped without spending anything
  left: number // still legitimately in progress, or someone else got there first
}

type StuckRow = { id: string; status: Status; transcript_id: string | null; created_at: string }
type Outcome = keyof Omit<ReapSummary, 'checked'>

async function reapOne(job: StuckRow, deps: PipelineDeps, staleBefore: string, now: number): Promise<Outcome> {
  const age = now - new Date(job.created_at).getTime()
  const fail = (msg: string) =>
    claimJob(deps.admin, job.id, [job.status], { status: 'error', error_msg: msg }, staleBefore)

  // Too old to matter: the user already got an error. Spend nothing more.
  if (age >= GIVE_UP_MS) return (await fail(TIMED_OUT)) ? 'timed_out' : 'left'

  // Never reached AssemblyAI (the function died between creating the job and
  // submitting), so there is nothing to recover.
  if (!job.transcript_id) return (await fail(INTERRUPTED)) ? 'failed' : 'left'

  // Still waiting on AssemblyAI: find out whether the webhook was merely lost.
  if (job.status === 'transcribing' || job.status === 'pending') {
    let s: { status: string; error: string | null }
    try {
      s = await deps.getTranscriptStatus(job.transcript_id)
    } catch {
      return 'left' // AssemblyAI unreachable right now — try again next run
    }
    if (s.status === 'error') {
      return (await fail(friendlyTranscriptionError(s.error ?? ''))) ? 'failed' : 'left'
    }
    if (s.status !== 'completed') return 'left' // queued / processing: still working
  }

  // Either a transcription that finished while our webhook was lost, or an
  // extraction that died part-way. Take the job (only one caller can) and run it.
  const claimed = await claimJob(deps.admin, job.id, [job.status], { status: 'extracting' }, staleBefore)
  if (!claimed) return 'left'
  return (await processCompleted(job.id, job.transcript_id, deps)) === 'done' ? 'rescued' : 'failed'
}

/**
 * Find jobs with no progress for STALE_MS and finish or fail them. Safe to run
 * as often and as concurrently as you like (see claimJob). Called by the cron.
 */
export async function reapStuckJobs(deps: PipelineDeps = defaultDeps()): Promise<ReapSummary> {
  const now = deps.now()
  const staleBefore = new Date(now - STALE_MS).toISOString()

  const { data, error } = await deps.admin
    .from('recording_jobs')
    .select('id, status, transcript_id, created_at')
    .in('status', ['pending', 'transcribing', 'extracting'])
    .lt('updated_at', staleBefore)
    .order('created_at', { ascending: true })
    .limit(REAP_BATCH)
  if (error) throw error

  const jobs = (data ?? []) as StuckRow[]
  const summary: ReapSummary = { checked: jobs.length, rescued: 0, failed: 0, timed_out: 0, left: 0 }
  const results = await Promise.allSettled(jobs.map((j) => reapOne(j, deps, staleBefore, now)))
  for (const r of results) {
    if (r.status === 'fulfilled') summary[r.value]++
    else {
      console.error('[jobs] reap failed for a job:', r.reason)
      summary.left++
    }
  }
  return summary
}
