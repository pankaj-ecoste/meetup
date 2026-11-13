import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from './supabaseAdmin'
import { HttpError } from './auth'
import type { UserProfile } from '../types'

// Daily recording limit per employee.
//
// Every recording the pipeline accepts costs real money: an AssemblyAI
// transcription plus a Claude call. Without a cap, one person (or one stolen
// login, or one buggy client looping) could run up an unbounded bill. The cap is
// deliberately simple: N recordings per calendar day (India time), admins exempt.

const DEFAULT_LIMIT = 5

/** Recordings one employee may submit per day. MAX_RECORDINGS_PER_DAY overrides. */
export function dailyLimit(): number {
  const n = parseInt(process.env.MAX_RECORDINGS_PER_DAY ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_LIMIT
}

// IST is a fixed UTC+5:30 (no DST), so a hardcoded offset needs no tz database.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** The most recent midnight in India time, as a Date (UTC instant). */
export function istDayStart(now: Date = new Date()): Date {
  const shifted = now.getTime() + IST_OFFSET_MS
  return new Date(Math.floor(shifted / DAY_MS) * DAY_MS - IST_OFFSET_MS)
}

/**
 * Throws HttpError(429) when a non-admin has already used today's allowance.
 *
 * What counts: every job created today EXCEPT ones that failed before anything
 * was transcribed (status = error and no transcript) — those cost nothing, so a
 * user is not punished for our own failures or a flaky connection.
 *
 * It fails OPEN: if the count query itself errors, the recording is allowed.
 * A database hiccup must never be the reason someone loses a meeting; the cap is
 * a cost guard, not a security boundary. It is a soft limit (two requests in the
 * same instant could both pass), which is fine for its purpose.
 */
export async function enforceDailyRecordingLimit(
  user: Pick<UserProfile, 'id' | 'role'>,
  client: SupabaseClient = supabaseAdmin(),
  now: Date = new Date(),
): Promise<void> {
  if (user.role === 'admin') return

  const limit = dailyLimit()
  const { count, error } = await client
    .from('recording_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', istDayStart(now).toISOString())
    .or('status.neq.error,transcript.not.is.null')

  if (error) {
    console.error('[recording-limit] count failed, allowing:', error.message)
    return
  }

  if ((count ?? 0) >= limit) {
    throw new HttpError(
      429,
      `Daily limit reached: you can submit ${limit} recordings per day. ` +
        'Your recording is kept on this device — try again tomorrow, or ask an admin if you need more.',
    )
  }
}
