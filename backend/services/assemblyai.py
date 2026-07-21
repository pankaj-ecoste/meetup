import os
import assemblyai as aai
from dotenv import load_dotenv

load_dotenv()


def transcribe(audio_url: str) -> str:
    """Transcribe audio from a Supabase Storage signed URL.

    Uses AssemblyAI with speaker diarization (helps for meetings).
    Returns the plain transcript text.
    """
    aai.settings.api_key = os.environ["ASSEMBLYAI_API_KEY"]

    config = aai.TranscriptionConfig(
        language_code="hi",
        speaker_labels=True,
    )
    transcriber = aai.Transcriber(config=config)
    transcript = transcriber.transcribe(audio_url)

    if transcript.status == aai.TranscriptStatus.error:
        raise RuntimeError(f"AssemblyAI transcription failed: {transcript.error}")

    return transcript.text or ""
