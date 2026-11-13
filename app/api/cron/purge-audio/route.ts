import { isCronAuthorised } from '@/lib/server/cronAuth'
import { purgeOldAudio } from '@/lib/server/audioRetention'

export const runtime = 'nodejs'

// GET /api/cron/purge-audio — deletes recordings older than the retention window
// (30 days by default) from the private `audio` bucket. Vercel Cron calls it once
// a day (vercel.json) with `Authorization: Bearer <CRON_SECRET>`.
//
// Add `?dry=1` to see what WOULD be deleted without deleting anything:
//   curl -H "Authorization: Bearer $CRON_SECRET" "https://<site>/api/cron/purge-audio?dry=1"
// See lib/server/audioRetention.ts for the safety rules.
export async function GET(request: Request) {
  if (!isCronAuthorised(request)) {
    return Response.json({ detail: 'unauthorised' }, { status: 401 })
  }
  const dryRun = new URL(request.url).searchParams.get('dry') === '1'
  try {
    const summary = await purgeOldAudio({ dryRun })
    console.log('[audio-retention]', JSON.stringify(summary)) // counts only, never file names
    // Any error (bucket or a folder could not be listed, a delete failed) is shown
    // as a FAILED run in Vercel's cron log instead of a green 200 that hides it.
    // The body still carries the full counts.
    return Response.json(summary, { status: summary.errors > 0 ? 500 : 200 })
  } catch (e) {
    console.error('[cron] purge-audio failed:', e)
    return Response.json({ detail: 'purge failed' }, { status: 500 })
  }
}
