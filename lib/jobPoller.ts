// Fallback poller for a recording job's status. Pure (no React, no Supabase) so
// its timing can be tested with a fake clock.
//
// Realtime is the PRIMARY way a finished job reaches the browser. This poller is
// only the "never an infinite spinner" safety net (plan.md §0) for the day a
// Realtime event is missed. So:
//   - while Realtime is connected, it only checks occasionally (SLOW);
//   - while Realtime is NOT connected (failed / dropped / not up yet), it checks
//     often (FAST) because it is then the only thing that will finish the job;
//   - after JOB_TIMEOUT_MS it gives up and reports a real error.
// Every check is a full backend call, so polling at FAST while Realtime was
// healthy cost ~150 wasted calls per user over a 15-minute wait.

export const POLL_FAST_MS = 6_000
export const POLL_SLOW_MS = 20_000

// Nothing in the pipeline ever gave up: if the AssemblyAI webhook never
// arrived, the job sat in `transcribing` and the UI spun forever. After this
// long, stop waiting and show a real error — generous enough for a 60-minute
// recording, which AssemblyAI typically turns around in a few minutes.
export const JOB_TIMEOUT_MS = 15 * 60 * 1000

export type JobPollerDeps = {
  /** Fetch the job and apply it. May throw — a failed check is just retried. */
  fetchJob: () => Promise<void>
  /** True once the job reached done/error (or the poller was told to stop). */
  isResolved: () => boolean
  /** True while the Realtime channel is connected. */
  realtimeOk: () => boolean
  /** Called once if JOB_TIMEOUT_MS passes without the job resolving. */
  onTimeout: () => void
  // Injectable for tests.
  now?: () => number
  schedule?: (fn: () => void, ms: number) => unknown
  cancel?: (handle: unknown) => void
}

export function createJobPoller(deps: JobPollerDeps) {
  const now = deps.now ?? Date.now
  const schedule = deps.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const cancel =
    deps.cancel ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>))

  let handle: unknown = null
  let startedAt = 0
  let stopped = true

  async function tick() {
    handle = null
    if (stopped || deps.isResolved()) return

    if (now() - startedAt > JOB_TIMEOUT_MS) {
      stopped = true
      deps.onTimeout()
      return
    }

    try {
      await deps.fetchJob()
    } catch {
      // transient — the next check or a Realtime event will pick it up
    }

    if (stopped || deps.isResolved()) return
    handle = schedule(tick, deps.realtimeOk() ? POLL_SLOW_MS : POLL_FAST_MS)
  }

  return {
    /** Begin checking. The first check waits POLL_FAST_MS. */
    start() {
      stopped = false
      startedAt = now()
      handle = schedule(tick, POLL_FAST_MS)
    },
    /** Stop for good and drop any pending check. */
    stop() {
      stopped = true
      if (handle !== null) cancel(handle)
      handle = null
    },
    /**
     * One immediate check, outside the schedule. Used right after Realtime
     * connects: a job that finished in the gap between "job created" and
     * "channel subscribed" would otherwise never emit an event we can hear.
     */
    checkNow() {
      if (stopped || deps.isResolved()) return
      void deps.fetchJob().catch(() => {})
    },
  }
}
