import 'server-only'
import { createSign } from 'crypto'
import { SHEET_HEADERS, COL_COUNT, meetingToRow, type SheetMeeting } from '../sheetFormat'

// Google Sheets writer — REST + a service-account JWT, no SDK.
//
// Env (server-only):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL  the robot's email (the sheet is shared with it as Editor)
//   GOOGLE_SERVICE_ACCOUNT_KEY    its private key (PEM). "\n" escapes are accepted.
//
// Rows are written with valueInputOption=RAW so MOM / task text that happens to
// start with "=" or "+" is stored as text, never evaluated as a formula.

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://sheets.googleapis.com/v4/spreadsheets'

export class SheetError extends Error {}

export function robotEmail(): string | null {
  return process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || null
}

function privateKey(): string {
  const k = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!k) throw new SheetError('Google service account is not configured on the server.')
  return k.replace(/\\n/g, '\n')
}

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

let cached: { token: string; exp: number } | null = null

async function accessToken(): Promise<string> {
  if (cached && cached.exp - 60_000 > Date.now()) return cached.token
  const email = robotEmail()
  if (!email) throw new SheetError('Google service account is not configured on the server.')

  const now = Math.floor(Date.now() / 1000)
  const unsigned =
    b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) +
    '.' +
    b64url(JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }))
  const sig = createSign('RSA-SHA256').update(unsigned).sign(privateKey())
  const assertion = `${unsigned}.${b64url(sig)}`

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number }
  if (!res.ok || !json.access_token) {
    throw new SheetError('Could not sign in to Google with the service account key.')
  }
  cached = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 }
  return cached.token
}

async function sheetsFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken()
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  })
  if (!res.ok) {
    if (res.status === 403) {
      throw new SheetError(
        `No access to the sheet. Share it with ${robotEmail() ?? 'the MeetUp robot email'} as Editor.`,
      )
    }
    if (res.status === 404) throw new SheetError('Sheet not found — check the link.')
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new SheetError(`Google Sheets error ${res.status}: ${body?.error?.message ?? res.statusText}`)
  }
  return (await res.json()) as T
}

type Tab = { sheetId: number; title: string }

async function listTabs(spreadsheetId: string): Promise<Tab[]> {
  const j = await sheetsFetch<{ sheets?: { properties: Tab }[] }>(
    `/${spreadsheetId}?fields=sheets.properties(sheetId,title)`,
  )
  return (j.sheets ?? []).map((s) => s.properties)
}

const q = (title: string) => `'${title.replace(/'/g, "''")}'`

/** Throws a readable SheetError unless the robot can open the sheet. */
export async function verifyAccess(spreadsheetId: string): Promise<void> {
  await listTabs(spreadsheetId)
}

async function writeHeader(spreadsheetId: string, title: string): Promise<void> {
  await sheetsFetch(
    `/${spreadsheetId}/values/${encodeURIComponent(`${q(title)}!A1`)}?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values: [SHEET_HEADERS] }) },
  )
}

/** Create the tab (with header + basic formatting) if it does not exist. */
export async function ensureTab(spreadsheetId: string, title: string): Promise<void> {
  const tabs = await listTabs(spreadsheetId)
  let tab = tabs.find((t) => t.title === title)
  if (!tab) {
    const r = await sheetsFetch<{ replies: { addSheet: { properties: Tab } }[] }>(
      `/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: { title, gridProperties: { rowCount: 1000, columnCount: COL_COUNT, frozenRowCount: 1 } },
              },
            },
          ],
        }),
      },
    )
    tab = r.replies[0].addSheet.properties
    const id = tab.sheetId
    await sheetsFetch(`/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          // bold header
          {
            repeatCell: {
              range: { sheetId: id, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.93, green: 0.93, blue: 0.98 } } },
              fields: 'userEnteredFormat(textFormat,backgroundColor)',
            },
          },
          // wrap + top-align the data rows (MOM + task cells are multi-line)
          {
            repeatCell: {
              range: { sheetId: id, startRowIndex: 1 },
              cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } },
              fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)',
            },
          },
          // MOM column wide, task columns medium
          { updateDimensionProperties: { range: { sheetId: id, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 420 }, fields: 'pixelSize' } },
          { updateDimensionProperties: { range: { sheetId: id, dimension: 'COLUMNS', startIndex: 5, endIndex: 15 }, properties: { pixelSize: 260 }, fields: 'pixelSize' } },
        ],
      }),
    })
  }
  // Header is (re)written every time — idempotent, and heals a hand-edited header.
  await writeHeader(spreadsheetId, title)
}

/** Rename a tab (department rename). No-op if the old tab does not exist. */
export async function renameTab(spreadsheetId: string, from: string, to: string): Promise<void> {
  if (from === to) return
  const tabs = await listTabs(spreadsheetId)
  const tab = tabs.find((t) => t.title === from)
  if (!tab || tabs.some((t) => t.title === to)) return
  await sheetsFetch(`/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{ updateSheetProperties: { properties: { sheetId: tab.sheetId, title: to }, fields: 'title' } }],
    }),
  })
}

/**
 * Fast path for a meeting that has NEVER been sent to the sheet (the Save
 * click): append the row straight away — 1 Google call instead of 4. A brand
 * new meeting cannot already have a row, so listing tabs, rewriting the header
 * and scanning column A first (what upsertMeetingRow does) is wasted time the
 * user spends waiting on the Save button.
 *
 * It falls back to the careful upsertMeetingRow whenever anything is off:
 *  - any error (tab missing, quota, network). The careful path looks the row up
 *    by Meeting ID first, so even if this append actually landed and only the
 *    reply was lost, nothing is duplicated.
 *  - the row landed in row 1, i.e. the tab was empty (header deleted). The
 *    careful path rewrites the header — over that row — then appends the
 *    meeting again, so the tab ends up with a header and exactly one row.
 */
export async function appendMeetingRowFast(
  spreadsheetId: string,
  tabName: string,
  meeting: SheetMeeting,
): Promise<void> {
  try {
    const res = await sheetsFetch<{ updates?: { updatedRange?: string } }>(
      `/${spreadsheetId}/values/${encodeURIComponent(`${q(tabName)}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: [meetingToRow(meeting, new Date())] }) },
    )
    // updatedRange looks like 'Sales'!A7:P7 — a department name can't contain "!",
    // so the first "!" is the sheet/range separator.
    const first = /![A-Z]+(\d+)/.exec(res.updates?.updatedRange ?? '')
    if (!first || Number(first[1]) >= 2) return // landed below the header: done
  } catch {
    // fall through to the careful path
  }
  await upsertMeetingRow(spreadsheetId, tabName, meeting)
}

/**
 * Write the meeting as ONE row in `tabName`. Meeting ID (column A) is the key:
 * if a row with this id already exists it is overwritten, so a retry can never
 * create a duplicate.
 */
export async function upsertMeetingRow(
  spreadsheetId: string,
  tabName: string,
  meeting: SheetMeeting,
): Promise<void> {
  await ensureTab(spreadsheetId, tabName)

  const col = await sheetsFetch<{ values?: string[][] }>(
    `/${spreadsheetId}/values/${encodeURIComponent(`${q(tabName)}!A:A`)}`,
  )
  const ids = (col.values ?? []).map((r) => r[0])
  const idx = ids.indexOf(meeting.id) // 0-based; row 1 is the header

  const row = meetingToRow(meeting, new Date())
  if (idx >= 1) {
    const rowNum = idx + 1
    await sheetsFetch(
      `/${spreadsheetId}/values/${encodeURIComponent(`${q(tabName)}!A${rowNum}`)}?valueInputOption=RAW`,
      { method: 'PUT', body: JSON.stringify({ values: [row] }) },
    )
  } else {
    await sheetsFetch(
      `/${spreadsheetId}/values/${encodeURIComponent(`${q(tabName)}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: [row] }) },
    )
  }
}
