import { timingSafeEqual } from 'crypto'
import { reapStuckJobs } from '@/lib/server/jobPipeline'

export const runtime = 'nodejs'

// GET /api/cron/reap-jobs — the stuck-job checker. Vercel Cron calls this every
// 5 minutes (vercel.json) with `Authorization: Bearer <CRON_SECRET>`; anyone else
// gets 401. It finishes or fails recording jobs that have made no progress
// (a lost webhook, a function that died mid-way) and stops spending on jobs
// older than 20 minutes. See lib/server/jobPipeline.ts.
function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // not configured → nobody gets in (fail closed)
  const got = Buffer.from(request.headers.get('authorization') ?? '')
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && timingSafeEqual(got, want)
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return Response.json({ detail: 'unauthorised' }, { status: 401 })
  }
  try {
    return Response.json(await reapStuckJobs())
  } catch (e) {
    console.error('[cron] reap-jobs failed:', e)
    return Response.json({ detail: 'reaper failed' }, { status: 500 })
  }
}
