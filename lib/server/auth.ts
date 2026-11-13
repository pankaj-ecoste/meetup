import 'server-only'
import { supabaseAdmin } from './supabaseAdmin'
import type { UserProfile } from '../types'

// Thrown by requireUser; Route Handlers translate it into a JSON error response.
export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'HttpError'
  }
}

function bearerToken(req: Request): string {
  const header = req.headers.get('authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    throw new HttpError(401, 'Missing Authorization header')
  }
  return token
}

/**
 * Verify the Supabase JWT on the request, then load the caller's active
 * `users` row. A removed employee has is_active=false (and no auth user), so
 * they can never get past this.
 */
export async function requireUser(req: Request): Promise<UserProfile> {
  const token = bearerToken(req)
  const admin = supabaseAdmin()

  // Verify the JWT signature + expiry locally (public signing keys, cached) —
  // no network round trip to Supabase Auth per request. The is_active lookup
  // below still hits the DB, so a removed employee is blocked immediately even
  // though their token has not expired yet.
  // getClaims THROWS on a token it cannot even parse (getUser used to return an
  // error object), so any failure here must map to a clean 401, never a 500.
  let authId: string | undefined
  try {
    const { data: claimsData, error: authError } = await admin.auth.getClaims(token)
    if (!authError) authId = claimsData?.claims?.sub
  } catch {
    authId = undefined
  }
  if (!authId) {
    throw new HttpError(401, 'Invalid or expired token')
  }

  const { data, error } = await admin
    .from('users')
    .select('id, name, email, phone, role, is_active')
    .eq('auth_id', authId)
    .eq('is_active', true)
    .single()

  if (error || !data) {
    throw new HttpError(404, 'User profile not found')
  }

  return {
    id: data.id,
    name: data.name,
    email: data.email,
    phone: data.phone ?? undefined,
    role: data.role,
    is_active: data.is_active,
  }
}

/** Same as requireUser, but only admins get through. */
export async function requireAdmin(req: Request): Promise<UserProfile> {
  const user = await requireUser(req)
  if (user.role !== 'admin') {
    throw new HttpError(403, 'Access denied — admin only')
  }
  return user
}
