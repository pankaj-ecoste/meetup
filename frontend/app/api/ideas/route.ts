import { requireUser } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import type { IdeaResponse } from '@/lib/types'

const PAGE_SIZE = 20

function nameOf(v: unknown): string | undefined {
  const o = Array.isArray(v) ? v[0] : v
  if (o && typeof o === 'object' && 'name' in o) return String((o as { name: unknown }).name)
  return undefined
}

// GET /api/ideas?search=&company_id=&page= — ideas are org-wide (auth only).
export async function GET(request: Request) {
  try {
    await requireUser(request)
    const sp = new URL(request.url).searchParams
    const search = sp.get('search') ?? ''
    const companyId = sp.get('company_id') ?? ''
    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)
    const offset = (page - 1) * PAGE_SIZE

    let q = supabaseAdmin()
      .from('ideas')
      .select('*, recorders:users!recorded_by(name, companies(name))')
    if (search) q = q.ilike('summary', `%${search}%`)
    if (companyId) q = q.eq('recorders.companies.id', companyId)

    const { data, error } = await q
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error

    const result: IdeaResponse[] = (data ?? []).map((raw) => {
      const row = raw as Record<string, unknown>
      const rec = (Array.isArray(row.recorders) ? row.recorders[0] : row.recorders) as
        | { name?: string; companies?: unknown }
        | null
      return {
        id: row.id as string,
        recorded_by: row.recorded_by as string,
        summary: row.summary as string,
        tags: (row.tags as string[]) ?? [],
        created_at: row.created_at as string,
        recorder_name: rec?.name,
        company_name: nameOf(rec?.companies),
      }
    })
    return Response.json(result)
  } catch (e) {
    return jsonError(e)
  }
}

// POST /api/ideas — store an idea recorded by the caller.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const body = (await request.json().catch(() => ({}))) as {
      summary?: string
      tags?: string[]
    }

    const { data, error } = await supabaseAdmin()
      .from('ideas')
      .insert({
        recorded_by: user.id,
        summary: body.summary,
        tags: body.tags ?? [],
      })
      .select('*')
      .single()
    if (error) throw error

    const result: IdeaResponse = {
      id: data.id,
      recorded_by: data.recorded_by,
      summary: data.summary,
      tags: data.tags ?? [],
      created_at: data.created_at,
      recorder_name: undefined,
      company_name: undefined,
    }
    return Response.json(result, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
