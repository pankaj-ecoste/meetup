import 'server-only'
import { timingSafeEqual } from 'crypto'

/**
 * Shared door for every /api/cron/* endpoint. Vercel Cron calls them with
 * `Authorization: Bearer <CRON_SECRET>` (it adds the header itself once the
 * CRON_SECRET env var exists in the project); anyone else must be refused.
 * Fails CLOSED: with no CRON_SECRET configured, nobody gets in.
 */
export function isCronAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const got = Buffer.from(request.headers.get('authorization') ?? '')
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && timingSafeEqual(got, want)
}
