from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from moviepy.editor import VideoFileClip
from supabase import create_client, Client
import shutil
import os
import uuid
import datetime
import time
from services import ai, video, social

# --- CONFIGURATION ---
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://zasbsaanmlsuytesxmsk.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "YOUR_SERVICE_ROLE_KEY")

# Initialize Client
supabase: Client = None
def get_supabase():
    global supabase
    if supabase is None:
        try:
            supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        except Exception as e:
            print(f"Supabase Init Error: {e}")
    return supabase

# Init immediately
get_supabase()

app = FastAPI()

# --- HEALTH CHECK ---
@app.get("/")
def health_check():
    return {"status": "active", "service": "Laundry SaaS Backend"}

# --- CORS ---
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://video-saas-1.onrender.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "temp_storage"
if not os.path.exists(UPLOAD_DIR): os.makedirs(UPLOAD_DIR)

UI_LOGS = []
def log_ui(msg):
    timestamp = datetime.datetime.now().strftime("%H:%M:%S")
    formatted_msg = f"[{timestamp}] {msg}"
    print(formatted_msg)
    UI_LOGS.append(formatted_msg)
    if len(UI_LOGS) > 50: UI_LOGS.pop(0)

@app.get("/logs")
def get_logs(): return {"logs": UI_LOGS}

@app.get("/gallery/{user_id}")
def get_gallery(user_id: str):
    db = get_supabase()
    try:
        response = db.table("clips").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        return response.data
    except Exception as e:
        # Suppress the specific 'ConnectionTerminated' noise, it usually reconnects automatically next request
        err_str = str(e)
        if "ConnectionTerminated" not in err_str:
            print(f"DB Error: {err_str}")
        return []

@app.get("/video/{filename}")
def get_video(filename: str):
    path = os.path.join(UPLOAD_DIR, filename)
    if os.path.exists(path): return FileResponse(path)
    return {"error": "File not found"}

# --- SOCIAL MEDIA ENDPOINTS ---

@app.post("/social/connect")
def social_connect(user_id: str = Form(...)):
    link = social.generate_connect_link(user_id)
    if link:
        return {"status": "success", "url": link}
    # If no link, return error so frontend sees it
    return {"status": "error", "message": "Check server logs. API Key might be invalid."}

@app.post("/social/post")
def social_post(
    user_id: str = Form(...),
    video_url: str = Form(...),
    caption: str = Form(...),
    platforms: str = Form(...) 
):
    platform_list = [p.strip() for p in platforms.split(",")]
    result = social.post_to_networks(user_id, video_url, caption, platform_list)
    return result

# --- VIDEO PIPELINE (Standard) ---

def convert_to_clean_mp4(input_path):
    output_path = input_path.replace(".webm", "_clean.mp4")
    try:
        clip = VideoFileClip(input_path)
        clip.write_videofile(output_path, codec='libx264', audio_codec='aac', preset='ultrafast', logger=None)
        clip.close()
        return output_path
    except Exception as e:
        log_ui(f"❌ Conversion Failed: {e}")
        return None

def upload_to_supabase_storage(local_path, destination_name):
    db = get_supabase()
    try:
        with open(local_path, 'rb') as f:
            db.storage.from_("videos").upload(
                path=destination_name,
                file=f,
                file_options={"content-type": "video/mp4"}
            )
        project_id = SUPABASE_URL.split("//")[1].split(".")[0]
        public_url = f"https://{project_id}.supabase.co/storage/v1/object/public/videos/{destination_name}"
        return public_url
    except Exception as e:
        log_ui(f"❌ Storage Upload Error: {e}")
        return None

def process_video_pipeline(raw_file_path, user_id):
    filename = os.path.basename(raw_file_path)
    log_ui(f"⚙️ Processing for User: {user_id[:5]}...")

    clean_video_path = convert_to_clean_mp4(raw_file_path)
    if not clean_video_path: cleanup(raw_file_path); return

    log_ui("🎙️ Transcribing...")
    temp_audio = clean_video_path.replace(".mp4", ".mp3")
    try:
        clip = VideoFileClip(clean_video_path)
        clip.audio.write_audiofile(temp_audio, verbose=False, logger=None)
        clip.close()
        transcript_data = ai.transcribe_audio_groq(temp_audio)
    except Exception as e:
        log_ui(f"❌ Transcribe Error: {e}")
        cleanup(raw_file_path, clean_video_path, temp_audio)
        return

    log_ui("🧠 Analyzing...")
    ai_response = ai.analyze_viral_clips(transcript_data)
    clips_found = ai_response.get('clips', [])
    log_ui(f"✂️ Found {len(clips_found)} clip(s).")

    try:
        final_videos = video.process_video_clips(clean_video_path, ai_response, transcript_data)
        
        for vid_path, title in final_videos:
            local_filename = os.path.basename(vid_path)
            
            log_ui(f"☁️ Uploading {title}...")
            public_url = upload_to_supabase_storage(vid_path, local_filename)
            
            if public_url:
                clip_meta = next((c for c in clips_found if c['title'] == title), None)
                score = clip_meta['score'] if clip_meta else 0
                desc = clip_meta.get('viral_description', "Auto-generated clip")

                data = {
                    "user_id": user_id,
                    "filename": public_url,
                    "title": title,
                    "description": desc,
                    "score": score
                }
                get_supabase().table("clips").insert(data).execute()
                log_ui(f"✅ PUBLISHED: {title}")
                if os.path.exists(vid_path): os.remove(vid_path)
            
    except Exception as e:
        log_ui(f"❌ Edit Error: {e}")
        import traceback
        traceback.print_exc()

    cleanup(raw_file_path, clean_video_path, temp_audio)

def cleanup(*files):
    for f in files:
        if f and os.path.exists(f):
            try: os.remove(f)
            except: pass

@app.post("/upload-chunk") 
async def upload_chunk(
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...),
    user_id: str = Form(...) 
):
    filename = f"chunk_{uuid.uuid4().hex}.webm"
    file_path = os.path.join(UPLOAD_DIR, filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    background_tasks.add_task(process_video_pipeline, file_path, user_id)
    return {"status": "received"}