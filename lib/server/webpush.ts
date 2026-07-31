import 'server-only'
import webpush from 'web-push'
import { supabaseAdmin } from './supabaseAdmin'

let configured = false
function ensureConfigured() {
  if (configured) return
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return
  webpush.setVapidDetails('mailto:ai.support@ecoste.in', publicKey, privateKey)
  configured = true
}

type PushPayload = {
  title: string
  body: string
  url: string
}

/**
 * Best-effort push to every subscribed device for one user. Never throws —
 * callers (task/extension routes) must not have their own response depend on
 * whether a notification actually reached anyone. A dead subscription (410
 * Gone / 404, e.g. the user cleared site data) is deleted so it stops being
 * retried forever.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  try {
    ensureConfigured()
    if (!configured) return // VAPID keys not set — push is a no-op, not an error

    const admin = supabaseAdmin()
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId)
    if (!subs || subs.length === 0) return

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify(payload),
          )
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode
          if (statusCode === 404 || statusCode === 410) {
            await admin.from('push_subscriptions').delete().eq('id', sub.id)
          } else {
            console.error('[webpush] send failed:', err)
          }
        }
      }),
    )
  } catch (err) {
    console.error('[webpush] unexpected error:', err)
  }
}
