import 'server-only'
import { supabaseAdmin } from './supabaseAdmin'

/** The linked sheet (single row in app_settings), or nulls if none yet. */
export async function getLinkedSheet(): Promise<{ sheet_id: string | null; sheet_url: string | null }> {
  const { data } = await supabaseAdmin()
    .from('app_settings')
    .select('sheet_id, sheet_url')
    .eq('id', 1)
    .single()
  return { sheet_id: data?.sheet_id ?? null, sheet_url: data?.sheet_url ?? null }
}
