import os
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

def transcribe_audio_groq(audio_path):
    with open(audio_path, "rb") as file:
        transcription = client.audio.transcriptions.create(
            file=(os.path.basename(audio_path), file.read()),
            model="whisper-large-v3",
            response_format="verbose_json",
            timestamp_granularities=["word", "segment"]
        )
    return {
        "text": transcription.text,
        "words": transcription.words,
        "segments": transcription.segments
    }

def analyze_viral_clips(transcript_data):
    formatted_transcript = ""
    for seg in transcript_data.get('segments', []):
        start_time = int(seg['start'])
        text = seg['text'].strip()
        formatted_transcript += f"[{start_time}s] {text}\n"

    prompt = f"""
    You are a viral content strategist. Analyze the transcript.
    Identify engaging segments (15-60s).
    
    Rules:
    1. Mind the Gaps: Don't bridge large silences.
    2. Output JSON ONLY.
    
    Format:
    {{
      "clips": [
        {{
          "title": "Short Punchy Title (Max 5 words)",
          "viral_description": "A 1-sentence hook explaining why this is interesting, written for a social media caption.",
          "start_text": "Exact first 3 words",
          "end_text": "Exact last 3 words",
          "score": 9
        }}
      ]
    }}

    Transcript:
    "{formatted_transcript}"
    """

    try:
        completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"}
        )
        return json.loads(completion.choices[0].message.content)
    except Exception as e:
        print(f"AI Error: {e}")
        return {"clips": []}