import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Service-role Supabase client. Bypasses RLS — MUST stay server-only.
// The `server-only` import above makes the build fail if a client component
// ever imports this module. Security is enforced in each Route Handler
// (requireUser + query scoping), matching the FastAPI backend's model.

let _admin: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  if (_admin === null) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error(
        'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
      )
    }
    _admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return _admin
}
