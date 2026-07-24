import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedTask, ExtractedMeeting, ExtractedIdea } from '../types'

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

const TASK_SYSTEM = `You extract a single task delegation from a voice transcript.
The speaker is delegating work to one person. Extract exactly:
- doer_name: name of the person who must do the task (string or null)
- description: what they need to do (string)
- deadline: deadline as ISO 8601 datetime, e.g. "2024-12-31T17:00:00" (string or null)
- report_to_name: who the doer reports completion to (string or null)

Return ONLY valid JSON with these four keys. No markdown, no explanation.`

const MEETING_SYSTEM = `You extract a meeting summary and task list from a voice transcript.
Extract:
- mom_summary: concise minutes-of-meeting in plain text (string)
- tasks: array of objects, each with:
    - doer_name: string or null
    - description: string
    - deadline: ISO 8601 datetime string or null
    - report_to_name: string or null

Return ONLY valid JSON with keys "mom_summary" and "tasks". No markdown, no explanation.`

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

export function extractTask(transcript: string): Promise<ExtractedTask> {
  return call<ExtractedTask>(TASK_SYSTEM + nowContext(), transcript)
}

export function extractMeeting(transcript: string): Promise<ExtractedMeeting> {
  return call<ExtractedMeeting>(MEETING_SYSTEM + nowContext(), transcript)
}

export function extractIdea(transcript: string): Promise<ExtractedIdea> {
  return call<ExtractedIdea>(IDEA_SYSTEM, transcript)
}
