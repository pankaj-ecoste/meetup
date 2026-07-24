import 'server-only'
import type { TaskResponse } from '../types'

// Task row select with the three user joins, matching backend _TASK_SELECT.
// (No companies join — the FastAPI version didn't select it either, so
// company_name stays undefined, preserving 1:1 behaviour.)
export const TASK_SELECT = `
  *,
  assignees:users!assignee_id(name),
  assignors:users!assignor_id(name),
  report_tos:users!report_to_id(name)
`

// supabase-js types a to-one embed as an array; at runtime it's a single
// object. Handle both shapes defensively.
function nameOf(v: unknown): string | undefined {
  const o = Array.isArray(v) ? v[0] : v
  if (o && typeof o === 'object' && 'name' in o) {
    return String((o as { name: unknown }).name)
  }
  return undefined
}

/** Flatten the joined name fields onto each task row (port of backend _enrich). */
export function enrichTasks(rows: unknown[]): TaskResponse[] {
  return rows.map((row) => {
    const { assignees, assignors, report_tos, companies, ...rest } =
      row as Record<string, unknown>
    return {
      ...rest,
      assignee_name: nameOf(assignees),
      assignor_name: nameOf(assignors),
      report_to_name: nameOf(report_tos),
      company_name: nameOf(companies),
    } as unknown as TaskResponse
  })
}
