import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import { HttpError } from '@/lib/server/auth'

// POST /api/auth/pending/email — PUBLIC. Given a user_id already surfaced by
// GET /api/auth/pending (so the caller already knows this is a real,
// still-unclaimed person), resolve their email server-side so the browser
// can call supabase.auth.signInWithOtp without the user ever typing an
// email — this is what prevents typo'd/wrong-inbox claims.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { user_id?: string }
    if (!body.user_id) throw new HttpError(400, 'Missing user_id')

    const { data, error } = await supabaseAdmin()
      .from('users')
      .select('email')
      .eq('id', body.user_id)
      .eq('is_active', true)
      .eq('password_set', false)
      .single()
    if (error || !data) throw new HttpError(404, 'User not found or already set up')

    return Response.json({ email: data.email })
  } catch (e) {
    return jsonError(e)
  }
}
