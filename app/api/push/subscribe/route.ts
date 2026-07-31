import { requireUser, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'

type SubscribeBody = {
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
}

// POST /api/push/subscribe — save the browser's PushSubscription so server
// events (new task, extension decided) can notify this device (plan.md
// §8.14). Upserts on `endpoint`, which is unique per browser install.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const body = (await request.json().catch(() => ({}))) as SubscribeBody
    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      throw new HttpError(400, 'Missing endpoint or keys')
    }

    const admin = supabaseAdmin()
    const { error } = await admin.from('push_subscriptions').upsert(
      {
        user_id: user.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
      },
      { onConflict: 'endpoint' },
    )
    if (error) throw error

    return Response.json({ ok: true })
  } catch (e) {
    return jsonError(e)
  }
}

// DELETE /api/push/subscribe — drop a subscription, e.g. when the user turns
// notifications off. RLS also restricts this to the caller's own rows.
export async function DELETE(request: Request) {
  try {
    const user = await requireUser(request)
    const body = (await request.json().catch(() => ({}))) as { endpoint?: string }
    if (!body.endpoint) throw new HttpError(400, 'Missing endpoint')

    const admin = supabaseAdmin()
    const { error } = await admin
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', body.endpoint)
      .eq('user_id', user.id)
    if (error) throw error

    return Response.json({ ok: true })
  } catch (e) {
    return jsonError(e)
  }
}
