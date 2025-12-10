import os
import json
from groq import Groq

def get_client():
    """Helper to get a clean Groq client"""
    api_key = os.environ.get("GROQ_API_KEY")
    
    if not api_key:
        print("❌ CRITICAL ERROR: GROQ_API_KEY is missing in Environment Variables.")
        raise Exception("GROQ_API_KEY not set")
    
    # Clean the key (Remove accidental spaces from copy-pasting)
    api_key = api_key.strip()
    
    return Groq(api_key=api_key)

def transcribe_audio_groq(audio_path):
    try:
        client = get_client()
        
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
    except Exception as e:
        # Pass the error up so main.py logs it
        raise e

def analyze_viral_clips(transcript_data):
    try:
        client = get_client()
        
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

        completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"}
        )
        return json.loads(completion.choices[0].message.content)
    except Exception as e:
        print(f"AI Analysis Error: {e}")
        return {"clips": []}