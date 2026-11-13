import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { MAX_TASKS, type ExtractedMeeting, type MeetingTask } from '../types'
import { matchName } from '../nameMatch'

// AI extraction is Claude-only (locked in plan.md §8/§17 — no OpenAI).
// Direct 1:1 port of backend/services/extraction.py, which was verified
// end-to-end against live Claude. The three prompts and JSON shapes are
// unchanged. Thinking is intentionally left off (omitted): extraction is a
// simple structured-output call, and this preserves the verified behaviour
// and keeps latency low (objective FAST).

const MODEL = 'claude-opus-4-8'

let _client: Anthropic | null = null
function client(): Anthropic {
  if (_client === null) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('Missing ANTHROPIC_API_KEY')
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

// IST is a fixed UTC+5:30 (no DST), so a hardcoded offset needs no tz database.
function nowContext(): string {
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, '+05:30')
  return (
    `\n\nCurrent date and time: ${now} (Asia/Kolkata, IST). ` +
    "Resolve every relative deadline (e.g. 'Friday', 'Monday tak', 'kal', " +
    "'parso', 'agle hafte', 'shaam 5 baje') to an absolute ISO 8601 datetime " +
    'relative to this current time. Never output a deadline in the past.'
  )
}

const MEETING_SYSTEM = `You turn a speaker-tagged meeting transcript into a title, minutes of
meeting (MOM) and an action-item list. The transcript is diarized: each line
starts with an anonymous label like "Speaker A:" from an automated system that
cannot identify people — only the words said can tell you who someone is.

The transcript may be Hindi, English or Hinglish (possibly in Devanagari).
ALWAYS write every output field in ENGLISH, translating where needed.

Extract exactly:

- title: a short, specific meeting title (max 10 words), e.g.
  "Q3 dealer onboarding review". No date, no quotes.

- mom: the minutes of meeting as plain text, bullet-point style, in exactly
  this shape (blank line between sections, "-" for bullets):

    Summary
    A 1-2 line plain-language overview of what the meeting was about.

    Key Discussion Points
    - Point one
    - Point two

    Decisions Made
    - Decision one

    Next Steps
    - One forward-looking line: what should happen next

  Rules for mom:
  - Omit the "Decisions Made" section entirely if nothing was actually
    decided — never write it with a filler line.
  - Do NOT include an "Action Items" section — action items are returned
    separately in "tasks".
  - Do NOT include a date, time or attendees line.
  - Use real names wherever they can be resolved; fall back to "Speaker A"
    style only when a name truly cannot be inferred.

- tasks: array of action items from the meeting, AT MOST ${MAX_TASKS}. If more
  than ${MAX_TASKS} exist, merge related ones and keep the most important.
  Each task has:
    - assignee: the person who must do it (string, Latin script). If one
      instruction names several people, write them comma-separated in this one
      string, e.g. "Rahul, Priya". Empty string only if truly nobody is named.
    - description: what they need to do (string, English)
    - deadline: ISO 8601 DATE "YYYY-MM-DD" or null if no deadline was said
    - reporting_to: the person the assignee reports completion to (string,
      Latin script) or "" if not said

Always write people's names in Latin script, even when the transcript is in
Devanagari ("अरमान" -> "Arman"). Names are later matched to an employee list.

Return ONLY valid JSON with keys "title", "mom" and "tasks". No markdown, no explanation.`

async function call<T>(system: string, transcript: string): Promise<T> {
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: transcript }],
  })
  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text content')
  }
  return parseJson<T>(textBlock.text)
}

/**
 * Every system prompt above ends with "Return ONLY valid JSON ... No markdown",
 * but the model occasionally wraps the object in a ```json fence anyway. A bare
 * JSON.parse then throws `Unexpected token '\``, the job is marked errored and
 * the recording is lost — that has happened to three real recordings.
 *
 * Stripping the fence costs nothing and is not a workaround for a bad prompt:
 * it is defence against a failure mode whose only symptom is a lost recording.
 */
function parseJson<T>(raw: string): T {
  let text = raw.trim()
  if (text.startsWith('```')) {
    text = text
      .replace(/^```(?:json)?\s*\n?/i, '')
      .replace(/\n?```\s*$/, '')
      .trim()
  }
  try {
    return JSON.parse(text) as T
  } catch {
    // Last resort: the outermost {...} in the response.
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start > -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1)) as T
    }
    throw new Error('Claude returned malformed JSON')
  }
}

type RawMeeting = {
  title?: unknown
  mom?: unknown
  tasks?: Array<{ assignee?: unknown; description?: unknown; deadline?: unknown; reporting_to?: unknown }>
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/**
 * Extract title + MOM + tasks, then normalise: names matched to the employee
 * directory, deadlines reduced to YYYY-MM-DD, tasks capped at MAX_TASKS.
 */
export async function extractMeeting(
  transcript: string,
  employeeNames: string[],
): Promise<ExtractedMeeting> {
  const directory = employeeNames.length
    ? '\n\nEmployee directory (use these exact spellings when a spoken name matches one):\n' +
      employeeNames.join('\n')
    : ''
  const raw = await call<RawMeeting>(MEETING_SYSTEM + directory + nowContext(), transcript)

  const tasks: MeetingTask[] = (raw.tasks ?? []).slice(0, MAX_TASKS).map((t) => {
    // "Rahul, Priya" → match each part, rejoin.
    const assignee = str(t.assignee)
      .split(/\s*(?:,|&|\band\b)\s*/i)
      .filter(Boolean)
      .map((n) => matchName(n, employeeNames))
      .join(', ')
    const dl = str(t.deadline)
    return {
      assignee,
      description: str(t.description),
      deadline: /^\d{4}-\d{2}-\d{2}/.test(dl) ? dl.slice(0, 10) : null,
      reporting_to: matchName(str(t.reporting_to), employeeNames),
    }
  })

  return {
    title: str(raw.title) || 'Untitled meeting',
    mom: str(raw.mom),
    tasks,
  }
}
