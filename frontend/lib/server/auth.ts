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
 * `users` row joined with company name and designation capability tier.
 * Port of backend/routers/auth.py `get_me`.
 */
export async function requireUser(req: Request): Promise<UserProfile> {
  const token = bearerToken(req)
  const admin = supabaseAdmin()

  const { data: authData, error: authError } = await admin.auth.getUser(token)
  if (authError || !authData?.user) {
    throw new HttpError(401, 'Invalid or expired token')
  }
  const authUid = authData.user.id

  const { data, error } = await admin
    .from('users')
    .select('*, companies(name), designations(capability_tier)')
    .eq('auth_id', authUid)
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
    company_id: data.company_id,
    company_name: data.companies?.name ?? '',
    designation_id: data.designation_id ?? undefined,
    capability_tier: data.designations?.capability_tier ?? undefined,
    is_active: data.is_active,
  }
}
