import { requireUser } from '@/lib/server/auth'
import { jsonError } from '@/lib/server/http'

// GET /api/auth/me — the caller's own profile. Ports backend /auth/me.
export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    return Response.json(user)
  } catch (e) {
    return jsonError(e)
  }
}
