import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedTaskDelegation, ExtractedMeeting, ExtractedIdea } from '../types'

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

const TASK_SYSTEM = `You extract one or more task delegations from a voice transcript.
The speaker may delegate a single task, or several distinct tasks in the same
recording (e.g. "tell Rahul to finish the drawing by Friday, and ask Priya to
send the vendor quote by Monday") — extract every distinct task mentioned.

Extract a "tasks" array, each entry with exactly:
- doer_names: array of every person's name this specific task is being
  assigned to — most tasks name exactly one person, so this is usually a
  single-element array, but write every name mentioned when one instruction
  is given to several people at once (e.g. "Rahul and Priya, get this done
  by Friday" -> ["Rahul", "Priya"])
- description: what they need to do (string)
- deadline: deadline as ISO 8601 datetime, e.g. "2024-12-31T17:00:00" (string or null)
- report_to_name: who the doer reports completion to (string or null)

Return ONLY valid JSON with the single key "tasks". No markdown, no explanation.`

const MEETING_SYSTEM = `You extract minutes of meeting, speakers, and a task list from a
speaker-tagged meeting transcript. The transcript is diarized: each line
starts with an anonymous label like "Speaker A:" or "Speaker B:" from an
automated system that cannot identify who these people actually are — only
the words said can tell you that.

Extract exactly:

- mom_summary: the minutes of meeting as plain text, bullet-point style,
  in exactly this shape (blank line between sections, "-" for bullets):

    Summary
    A 1-2 line plain-language overview of what the meeting was about.

    Key Discussion Points
    - Point one
    - Point two

    Decisions Made
    - Decision one

    Action Items
    - <Name> — <one-line task> (by <deadline>)

    Next Steps
    - One forward-looking line: the call to action, what should happen next

  Rules for mom_summary:
  - Omit the "Decisions Made" section entirely if nothing was actually
    decided — never write it with a filler line.
  - Omit the "Action Items" section entirely if the tasks array below is
    empty — never write it with a filler line.
  - Never include a "Date & Time" or "Attendees" line yourself — those are
    added separately, outside of what you produce.
  - Use real names in mom_summary wherever you can resolve them (see
    speakers below); fall back to "Speaker A" style only when a name
    truly cannot be inferred.

- speakers: array of objects, one per distinct speaker label that actually
  appears in the transcript, each with:
    - label: the letter used in the transcript, e.g. "A"
    - guessed_name: the person's real name if it can be confidently
      inferred from what was said (a self-introduction, or being addressed
      by name by someone else) — otherwise null. Never guess from writing
      style or vibes; only from an explicit naming in the dialogue.

- tasks: array of objects, each with:
    - doer_names: array of every person's name this specific task is being
      assigned to — most tasks name exactly one person, so this is usually
      a single-element array, but write every name mentioned when one
      instruction is given to several people at once (e.g. "Rahul and
      Priya, get this done by Friday" -> ["Rahul", "Priya"])
    - description: string
    - deadline: ISO 8601 datetime string or null
    - report_to_name: string or null

Return ONLY valid JSON with keys "mom_summary", "speakers" and "tasks". No markdown, no explanation.`

const IDEA_SYSTEM = `You extract an idea from a voice transcript.
Extract:
- summary: concise summary of the idea (string)
- tags: array of short topic tags (max 5, lowercase, use underscores not spaces)

Return ONLY valid JSON with keys "summary" and "tags". No markdown, no explanation.`

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
  return JSON.parse(textBlock.text) as T
}

export function extractTask(transcript: string): Promise<ExtractedTaskDelegation> {
  return call<ExtractedTaskDelegation>(TASK_SYSTEM + nowContext(), transcript)
}

export function extractMeeting(transcript: string): Promise<ExtractedMeeting> {
  return call<ExtractedMeeting>(MEETING_SYSTEM + nowContext(), transcript)
}

export function extractIdea(transcript: string): Promise<ExtractedIdea> {
  return call<ExtractedIdea>(IDEA_SYSTEM, transcript)
}
