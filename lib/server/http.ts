import 'server-only'
import { HttpError } from './auth'

/**
 * Map a thrown error to a JSON Response. HttpError carries its own status;
 * anything else is an unexpected 500. Body shape is `{ detail }` to match the
 * FastAPI backend, so the frontend's lib/api.ts error handling is unchanged.
 */
export function jsonError(e: unknown): Response {
  if (e instanceof HttpError) {
    return Response.json({ detail: e.message }, { status: e.status })
  }
  console.error('[api] unhandled error:', e)
  return Response.json({ detail: 'Internal server error' }, { status: 500 })
}
