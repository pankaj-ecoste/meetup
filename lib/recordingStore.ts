// Crash-safe recording storage (browser only, no dependencies).
//
// Why this exists: MediaRecorder chunks used to accumulate in a React ref —
// plain memory, which dies with the page. On a phone, a 45-minute meeting can
// vanish silently: the screen locks, iOS reaps the backgrounded tab, `onstop`
// never fires, and there isn't even an error to show. The audio is simply gone.
//
// So every chunk is written to IndexedDB the moment it arrives. If the page
// dies mid-meeting the audio is still on disk, and the next visit can offer to
// upload it. The entry is deleted only after the upload has been accepted.
//
// Layout — two stores so appending stays O(1). Keeping chunks in one growing
// array would mean a read-modify-write of the whole recording every second,
// which is ~3600 rewrites over an hour.
//   meta:   recordingId -> { id, jobType, filename, mimeType, seconds, createdAt }
//   chunks: [recordingId, seq] -> Blob
//
// Every function degrades to a no-op (or `null`) if IndexedDB is unavailable —
// private browsing, storage pressure, an old browser. Persistence is a safety
// net; it must never be the reason a recording fails.

const DB_NAME = 'meetup-recordings'
const DB_VERSION = 1
const META_STORE = 'meta'
const CHUNK_STORE = 'chunks'

export type PendingRecording = {
  id: string
  jobType: string
  filename: string
  mimeType: string
  seconds: number
  createdAt: number
}

// One connection, reused. appendChunk runs once per second, so opening and
// closing a connection per call would mean ~3600 open/close cycles over an
// hour-long meeting — needless work on exactly the low-end phones this feature
// exists to protect. The connection is dropped on close/error so the next call
// transparently reopens.
let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null)
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      return resolve(null)
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        db.createObjectStore(CHUNK_STORE)
      }
    }
    req.onsuccess = () => {
      const db = req.result
      // If the browser evicts or closes the connection, forget it so the next
      // call reopens rather than using a dead handle.
      db.onclose = () => { dbPromise = null }
      db.onversionchange = () => { db.close(); dbPromise = null }
      resolve(db)
    }
    req.onerror = () => { dbPromise = null; resolve(null) }
    req.onblocked = () => { dbPromise = null; resolve(null) }
  })
  return dbPromise
}

function tx<T>(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  run: (t: IDBTransaction) => IDBRequest<T> | null,
): Promise<T | null> {
  return new Promise((resolve) => {
    let request: IDBRequest<T> | null
    try {
      const t = db.transaction(stores, mode)
      request = run(t)
      t.onabort = () => resolve(null)
      t.onerror = () => resolve(null)
      if (!request) {
        t.oncomplete = () => resolve(null)
        return
      }
      request.onsuccess = () => resolve(request!.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/** Register a new recording before the first chunk arrives. */
export async function createRecording(meta: PendingRecording): Promise<void> {
  const db = await openDb()
  if (!db) return
  await tx(db, [META_STORE], 'readwrite', (t) => t.objectStore(META_STORE).put(meta))
}

/** Append one MediaRecorder chunk. Called once per second while recording. */
export async function appendChunk(id: string, seq: number, blob: Blob): Promise<void> {
  const db = await openDb()
  if (!db) return
  await tx(db, [CHUNK_STORE], 'readwrite', (t) =>
    t.objectStore(CHUNK_STORE).put(blob, `${id}:${String(seq).padStart(6, '0')}`),
  )
}

/** Update the running duration so a recovered recording can show its length. */
export async function updateSeconds(id: string, seconds: number): Promise<void> {
  const db = await openDb()
  if (!db) return
  const meta = await tx<PendingRecording>(db, [META_STORE], 'readonly', (t) =>
    t.objectStore(META_STORE).get(id),
  )
  if (meta) {
    await tx(db, [META_STORE], 'readwrite', (t) =>
      t.objectStore(META_STORE).put({ ...meta, seconds }),
    )
  }
}

/** Reassemble every stored chunk into one Blob, in recorded order. */
export async function assembleRecording(id: string, mimeType: string): Promise<Blob | null> {
  const db = await openDb()
  if (!db) return null
  const range = IDBKeyRange.bound(`${id}:`, `${id}:￿`)
  const parts = await tx<Blob[]>(db, [CHUNK_STORE], 'readonly', (t) =>
    t.objectStore(CHUNK_STORE).getAll(range),
  )
  if (!parts || parts.length === 0) return null
  return new Blob(parts, { type: mimeType || 'audio/webm' })
}

/** Drop a recording and all its chunks — called once the upload is accepted. */
export async function deleteRecording(id: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  await tx(db, [META_STORE], 'readwrite', (t) => t.objectStore(META_STORE).delete(id))
  await tx(db, [CHUNK_STORE], 'readwrite', (t) => {
    t.objectStore(CHUNK_STORE).delete(IDBKeyRange.bound(`${id}:`, `${id}:￿`))
    return null
  })
}

/**
 * Recordings that were never uploaded — i.e. survivors of a crash, a locked
 * screen, or a reaped tab. Filtered by job type so a meeting is only ever
 * offered back on the meeting screen. Newest first.
 */
export async function listPending(jobType: string): Promise<PendingRecording[]> {
  const db = await openDb()
  if (!db) return []
  const all = await tx<PendingRecording[]>(db, [META_STORE], 'readonly', (t) =>
    t.objectStore(META_STORE).getAll(),
  )
  if (!all) return []
  return all.filter((r) => r.jobType === jobType).sort((a, b) => b.createdAt - a.createdAt)
}
