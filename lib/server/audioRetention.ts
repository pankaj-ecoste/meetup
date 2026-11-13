import 'server-only'
import { supabaseAdmin } from './supabaseAdmin'
import { BUCKET } from './recordings'

// Audio retention. Every recording is kept in the private `audio` bucket so the
// pipeline can transcribe it — but once the transcript and the meeting are saved
// the audio is no longer needed, and it is private meeting content that was
// otherwise kept forever (and billed for storage). This deletes audio older than
// RETENTION days. Deletion cannot be undone, so every step is deliberately
// conservative:
//   - a file whose age cannot be read is KEPT, never deleted;
//   - RETENTION can never be set below MIN_RETENTION_DAYS, so a typo in an env
//     var cannot wipe recent recordings;
//   - at most MAX_DELETE_PER_RUN files are removed per run (a bug can only do a
//     bounded amount of harm; the next run continues where this one stopped);
//   - `dryRun` reports what WOULD be deleted and deletes nothing.

export const DEFAULT_RETENTION_DAYS = 30
export const MIN_RETENTION_DAYS = 7
export const MAX_DELETE_PER_RUN = 1000
const LIST_PAGE = 1000 // storage.list() returns only 100 unless told otherwise
const REMOVE_CHUNK = 100
const DAY_MS = 24 * 60 * 60 * 1000

/** Days to keep audio. AUDIO_RETENTION_DAYS overrides; junk or < 7 falls back to 30. */
export function retentionDays(): number {
  const n = parseInt(process.env.AUDIO_RETENTION_DAYS ?? '', 10)
  return Number.isFinite(n) && n >= MIN_RETENTION_DAYS ? n : DEFAULT_RETENTION_DAYS
}

type Entry = { name: string; id: string | null; created_at: string | null }
type Fail = { message: string }

/** The slice of supabase storage we use — small so tests can fake it. */
export type StorageLike = {
  list(
    path: string,
    options: { limit: number; offset: number; sortBy: { column: string; order: string } },
  ): Promise<{ data: Entry[] | null; error: Fail | null }>
  remove(paths: string[]): Promise<{ data: unknown[] | null; error: Fail | null }>
}

export type PurgeSummary = {
  retention_days: number
  dry_run: boolean
  folders: number // user folders looked at
  scanned: number // files looked at
  expired: number // files older than the retention window
  deleted: number // files actually removed this run
  kept: number // files inside the window (or with an unreadable date)
  capped: boolean // more expired files exist than MAX_DELETE_PER_RUN; next run continues
  errors: number
}

export type PurgeOptions = {
  storage?: StorageLike
  now?: () => number
  days?: number
  dryRun?: boolean
}

async function listAll(storage: StorageLike, path: string): Promise<Entry[]> {
  const all: Entry[] = []
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await storage.list(path, {
      limit: LIST_PAGE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw new Error(error.message)
    const page = data ?? []
    all.push(...page)
    if (page.length < LIST_PAGE) return all
  }
}

export async function purgeOldAudio(opts: PurgeOptions = {}): Promise<PurgeSummary> {
  const storage =
    opts.storage ?? (supabaseAdmin().storage.from(BUCKET) as unknown as StorageLike)
  const now = (opts.now ?? Date.now)()
  const days = opts.days ?? retentionDays()
  const dryRun = opts.dryRun ?? false
  const cutoff = now - days * DAY_MS

  const summary: PurgeSummary = {
    retention_days: days, dry_run: dryRun, folders: 0, scanned: 0,
    expired: 0, deleted: 0, kept: 0, capped: false, errors: 0,
  }
  const expired: string[] = []

  const consider = (path: string, e: Entry) => {
    summary.scanned++
    const created = e.created_at ? Date.parse(e.created_at) : NaN
    if (!Number.isFinite(created)) {
      summary.kept++ // cannot tell how old it is -> never delete
    } else if (created < cutoff) {
      expired.push(path)
    } else {
      summary.kept++
    }
  }

  let root: Entry[]
  try {
    root = await listAll(storage, '')
  } catch (e) {
    console.error('[audio-retention] could not list the bucket:', e instanceof Error ? e.message : e)
    summary.errors++
    return summary
  }

  for (const entry of root) {
    if (entry.id !== null) {
      consider(entry.name, entry) // a file sitting at the bucket root
      continue
    }
    summary.folders++
    let files: Entry[]
    try {
      files = await listAll(storage, entry.name)
    } catch (e) {
      console.error('[audio-retention] could not list a folder:', e instanceof Error ? e.message : e)
      summary.errors++
      continue // other folders are still processed
    }
    for (const f of files) {
      if (f.id === null) continue // a nested folder: not expected, never touched
      consider(`${entry.name}/${f.name}`, f)
    }
  }

  summary.expired = expired.length
  const batch = expired.slice(0, MAX_DELETE_PER_RUN)
  summary.capped = expired.length > batch.length

  if (!dryRun) {
    for (let i = 0; i < batch.length; i += REMOVE_CHUNK) {
      const chunk = batch.slice(i, i + REMOVE_CHUNK)
      const { data, error } = await storage.remove(chunk)
      if (error) {
        console.error('[audio-retention] remove failed:', error.message)
        summary.errors++
      } else {
        summary.deleted += data?.length ?? 0
      }
    }
  }
  return summary
}
