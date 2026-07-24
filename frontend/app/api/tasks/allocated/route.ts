import { requireUser } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import { jsonError } from '@/lib/server/http'
import { TASK_SELECT, enrichTasks } from '@/lib/server/tasks'

const PAGE_SIZE = 20

// GET /api/tasks/allocated?page=&search= — tasks the caller assigned to others.
export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    const sp = new URL(request.url).searchParams
    const search = sp.get('search') ?? ''
    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)
    const offset = (page - 1) * PAGE_SIZE

    let q = supabaseAdmin()
      .from('tasks')
      .select(TASK_SELECT)
      .eq('assignor_id', user.id)
    if (search) q = q.ilike('description', `%${search}%`)

    const { data, error } = await q
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error

    return Response.json(enrichTasks(data ?? []))
  } catch (e) {
    return jsonError(e)
  }
}
