import os
import json
from datetime import datetime, timezone, timedelta
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

# IST is a fixed UTC+5:30 (no DST), so a hardcoded offset needs no tz database.
_IST = timezone(timedelta(hours=5, minutes=30))


def _now_context() -> str:
    """Current-time context appended to deadline-bearing prompts so the model
    can resolve relative deadlines ("Friday", "Monday tak", "kal", "shaam 5 baje")
    to correct absolute dates."""
    now = datetime.now(_IST).isoformat(timespec="seconds")
    return (
        f"\n\nCurrent date and time: {now} (Asia/Kolkata, IST). "
        "Resolve every relative deadline (e.g. 'Friday', 'Monday tak', 'kal', "
        "'parso', 'agle hafte', 'shaam 5 baje') to an absolute ISO 8601 datetime "
        "relative to this current time. Never output a deadline in the past."
    )

# AI extraction is Claude-only (decision locked in plan.md §8/§17 — no OpenAI).
# The three system prompts and JSON return shapes are unchanged from the
# original; only the client init + create call moved from OpenAI to Anthropic.

MODEL = "claude-opus-4-8"

_TASK_SYSTEM = """You extract a single task delegation from a voice transcript.
The speaker is delegating work to one person. Extract exactly:
- doer_name: name of the person who must do the task (string or null)
- description: what they need to do (string)
- deadline: deadline as ISO 8601 datetime, e.g. "2024-12-31T17:00:00" (string or null)
- report_to_name: who the doer reports completion to (string or null)

Return ONLY valid JSON with these four keys. No markdown, no explanation."""

_MEETING_SYSTEM = """You extract a meeting summary and task list from a voice transcript.
Extract:
- mom_summary: concise minutes-of-meeting in plain text (string)
- tasks: array of objects, each with:
    - doer_name: string or null
    - description: string
    - deadline: ISO 8601 datetime string or null
    - report_to_name: string or null

Return ONLY valid JSON with keys "mom_summary" and "tasks". No markdown, no explanation."""

_IDEA_SYSTEM = """You extract an idea from a voice transcript.
Extract:
- summary: concise summary of the idea (string)
- tags: array of short topic tags (max 5, lowercase, use underscores not spaces)

Return ONLY valid JSON with keys "summary" and "tags". No markdown, no explanation."""


def _client() -> Anthropic:
    return Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


def _call(system: str, transcript: str) -> dict:
    response = _client().messages.create(
        model=MODEL,
        max_tokens=4096,
        system=system,
        messages=[
            {"role": "user", "content": transcript},
        ],
    )
    text = next(block.text for block in response.content if block.type == "text")
    return json.loads(text)


def extract_task(transcript: str) -> dict:
    return _call(_TASK_SYSTEM + _now_context(), transcript)


def extract_meeting(transcript: str) -> dict:
    return _call(_MEETING_SYSTEM + _now_context(), transcript)


def extract_idea(transcript: str) -> dict:
    return _call(_IDEA_SYSTEM, transcript)
