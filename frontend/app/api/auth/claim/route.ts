import { requireAuthIdentity, HttpError } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'

// POST /api/auth/claim — final step of the one-time claim flow. Called with
// the Bearer token of the session just created by verifyOtp (which itself
// followed the caller proving control of the mailbox tied to user_id). At
// this point the browser has already called supabase.auth.updateUser to set
// the password on that auth account — this call links that auth account to
// the chosen `users` profile row and marks it claimed.
export async function POST(request: Request) {
  try {
    const { authId, email } = await requireAuthIdentity(request)
    const body = (await request.json().catch(() => ({}))) as { user_id?: string }
    if (!body.user_id) throw new HttpError(400, 'Missing user_id')

    const admin = supabaseAdmin()
    const { data: row } = await admin
      .from('users')
      .select('id, auth_id, email, is_active, password_set')
      .eq('id', body.user_id)
      .single()
    if (!row) throw new HttpError(404, 'User not found')
    if (!row.is_active) throw new HttpError(403, 'Account is not active')

    // The auth email must match the profile's email on file — the OTP proved
    // control of that inbox, so this is what actually authorizes the link.
    if (row.email.toLowerCase() !== email.toLowerCase()) {
      throw new HttpError(403, 'Signed-in email does not match this profile')
    }

    // Already claimed by this same account -> idempotent no-op success.
    if (row.password_set && row.auth_id === authId) {
      return Response.json({ ok: true })
    }
    // Already claimed by a DIFFERENT account -> something's wrong, refuse.
    if (row.auth_id && row.auth_id !== authId) {
      throw new HttpError(409, 'This profile is already linked to another account')
    }

    const { error: upErr } = await admin
      .from('users')
      .update({ auth_id: authId, password_set: true })
      .eq('id', row.id)
    if (upErr) throw upErr

    return Response.json({ ok: true })
  } catch (e) {
    return jsonError(e)
  }
}
