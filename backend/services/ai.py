import os
import json
from groq import Groq

def get_client():
    """Helper to get a clean Groq client with debugging"""
    api_key = os.environ.get("GROQ_API_KEY")
    
    # --- DEBUGGING BLOCK ---
    if not api_key:
        print("🚨 CRITICAL: GROQ_API_KEY is missing from Environment Variables!")
        raise Exception("GROQ_API_KEY not set")
    
    # Strip whitespace (fixes copy-paste errors)
    clean_key = api_key.strip()
    
    # Print Masked Key to Logs (Safe to show)
    # This helps you see if it's reading the wrong variable or an empty string
    print(f"🔍 DEBUG: Loading Groq Key. Length: {len(clean_key)}")
    if len(clean_key) > 5:
        print(f"🔍 DEBUG: Key starts with: {clean_key[:4]}... and ends with: ...{clean_key[-3:]}")
    else:
        print(f"🔍 DEBUG: Key seems too short!")
    # -----------------------

    return Groq(api_key=clean_key)

def transcribe_audio_groq(audio_path):
    print(f"🎙️ Sending {os.path.basename(audio_path)} to Groq...")
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
        print(f"❌ Transcribe Logic Error: {e}")
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