import os
import json
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# ── When you get the Anthropic key, replace this file with the anthropic SDK ──
# Only the client init + create call change; prompts and return shapes stay identical.

MODEL = "gpt-4o"

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


def _client() -> OpenAI:
    return OpenAI(api_key=os.environ["OPENAI_API_KEY"])


def _call(system: str, transcript: str) -> dict:
    response = _client().chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": transcript},
        ],
        response_format={"type": "json_object"},
        temperature=0,
    )
    return json.loads(response.choices[0].message.content)


def extract_task(transcript: str) -> dict:
    return _call(_TASK_SYSTEM, transcript)


def extract_meeting(transcript: str) -> dict:
    return _call(_MEETING_SYSTEM, transcript)


def extract_idea(transcript: str) -> dict:
    return _call(_IDEA_SYSTEM, transcript)
