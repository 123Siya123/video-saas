from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from moviepy.editor import VideoFileClip
from supabase import create_client, Client
from pydantic import BaseModel
import shutil
import os
import uuid
import datetime
import requests # Needed for downloading remote videos
from services import ai, video, social

# --- CONFIGURATION ---
# Ensure these are set in your Render Environment Variables
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://zasbsaanmlsuytesxmsk.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "YOUR_SERVICE_ROLE_KEY")

# Initialize Supabase Client
supabase: Client = None
def get_supabase():
    global supabase
    if supabase is None:
        try:
            supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        except Exception as e:
            print(f"Supabase Init Error: {e}")
    return supabase

# Initialize immediately to fail fast if config is wrong
get_supabase()

app = FastAPI()

# --- HEALTH CHECK ---
@app.get("/")
def health_check():
    return {"status": "active", "service": "DirectorFlow Backend"}

# --- CORS ---
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://video-saas-1.onrender.com",
    "https://video-saas.onrender.com"
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

# --- LOGGING UTILS ---
UI_LOGS = []
def log_ui(msg):
    timestamp = datetime.datetime.now().strftime("%H:%M:%S")
    formatted_msg = f"[{timestamp}] {msg}"
    print(formatted_msg)
    UI_LOGS.append(formatted_msg)
    if len(UI_LOGS) > 50: UI_LOGS.pop(0)

@app.get("/logs")
def get_logs(): return {"logs": UI_LOGS}

# --- DATABASE & STORAGE ROUTES ---

@app.get("/gallery/{user_id}")
def get_gallery(user_id: str):
    db = get_supabase()
    try:
        # Fetch clips sorted by newest
        response = db.table("clips").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        return response.data
    except Exception as e:
        # Filter out connection noise in logs
        if "ConnectionTerminated" not in str(e):
            print(f"DB Error: {e}")
        return []

@app.get("/video/{filename}")
def get_video(filename: str):
    """Serves local temporary video files"""
    path = os.path.join(UPLOAD_DIR, filename)
    if os.path.exists(path): return FileResponse(path)
    return {"error": "File not found"}

# --- SOCIAL AUTHENTICATION (BYOK) ---

class AuthInit(BaseModel):
    user_id: str
    platform: str
    client_id: str
    client_secret: str

class AuthCallback(BaseModel):
    user_id: str
    code: str
    platform: str

class DisconnectRequest(BaseModel):
    user_id: str
    platform: str

@app.get("/auth/status/{user_id}")
def get_auth_status(user_id: str):
    """Returns a list of connected platforms for the user"""
    try:
        db = get_supabase()
        # Fetch only the 'platform' column for this user
        res = db.table("platforms").select("platform").eq("user_id", user_id).execute()
        
        # Convert list of dicts [{'platform': 'youtube'}] -> ['youtube']
        connected = [row['platform'] for row in res.data]
        return {"connected": connected}
    except Exception as e:
        print(f"Status Error: {e}")
        return {"connected": []}

@app.post("/auth/init")
def auth_init(data: AuthInit):
    """
    Step 1: User provides keys. We save them and generate a Login URL.
    """
    url = social.get_auth_url(data.user_id, data.platform, data.client_id, data.client_secret)
    if url:
        return {"url": url}
    return {"error": "Failed to generate auth URL. Check server logs."}

@app.post("/auth/callback")
def auth_callback(data: AuthCallback):
    """
    Step 2: User returns from Platform with a code. We exchange it for tokens.
    """
    return social.exchange_code_for_token(data.user_id, data.code, data.platform)

@app.post("/auth/disconnect")
def auth_disconnect(data: DisconnectRequest):
    """
    Deletes the credentials for a specific platform.
    """
    try:
        db = get_supabase()
        res = db.table("platforms").delete().eq("user_id", data.user_id).eq("platform", data.platform).execute()
        return {"status": "success", "message": f"Disconnected {data.platform}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/upload")
def upload_content(
    user_id: str = Form(...),
    clip_id: str = Form(...), # Needed to update DB
    video_filename: str = Form(...), 
    caption: str = Form(...),
    platforms: str = Form(...) 
):
    platform_list = [p.strip() for p in platforms.split(",")]
    results = {}
    local_path = ""
    is_temp_download = False

    # 1. Download logic
    if "http" in video_filename:
        try:
            log_ui(f"📥 Downloading video for upload...")
            response = requests.get(video_filename, stream=True)
            temp_name = f"social_upload_{uuid.uuid4().hex}.mp4"
            local_path = os.path.join(UPLOAD_DIR, temp_name)
            with open(local_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            is_temp_download = True
        except Exception as e:
            return {"error": f"Failed to download video: {e}"}
    else:
        local_path = os.path.join(UPLOAD_DIR, os.path.basename(video_filename))
    
    if not os.path.exists(local_path):
        return {"error": "Video file not found on server."}

    # 2. Iterate and Upload
    db = get_supabase()
    
    # Fetch existing refs to append to them
    current_clip = db.table("clips").select("social_refs").eq("id", clip_id).single().execute()
    social_refs = current_clip.data.get("social_refs") or {}

    for p in platform_list:
        log_ui(f"🚀 Uploading to {p}...")
        path_to_pass = local_path
        if p == 'instagram' and "http" in video_filename:
            path_to_pass = video_filename 
        
        try:
            res = social.upload_video(user_id, p, path_to_pass, caption, caption)
            
            if res.get("status") == "success":
                log_ui(f"✅ {p}: Upload Successful")
                
                # Generate Link based on ID
                video_id = res.get("id") or res.get("details", {}).get("id")
                link = ""
                if p == 'youtube': link = f"https://youtube.com/shorts/{video_id}"
                elif p == 'instagram': link = "https://instagram.com" 
                
                # Save to results and DB object
                results[p] = {"status": "success", "link": link, "id": video_id}
                social_refs[p] = link
            else:
                results[p] = {"status": "error", "message": res.get("error")}
                log_ui(f"❌ {p}: {res.get('error')}")
                
        except Exception as e:
            results[p] = {"error": str(e)}
            log_ui(f"❌ {p}: Exception {e}")

    # 3. Update Database
    db.table("clips").update({"social_refs": social_refs}).eq("id", clip_id).execute()

    # 4. Cleanup
    if is_temp_download and os.path.exists(local_path):
        os.remove(local_path)

    return results

# --- VIDEO PROCESSING PIPELINE ---

def convert_to_clean_mp4(input_path):
    """Converts WebM to MP4 with AAC audio (compatible with IG/TikTok)"""
    output_path = input_path.replace(".webm", "_clean.mp4")
    try:
        clip = VideoFileClip(input_path)
        clip.write_videofile(
            output_path, 
            codec='libx264', 
            audio_codec='aac', 
            preset='ultrafast', 
            logger=None
        )
        clip.close()
        return output_path
    except Exception as e:
        log_ui(f"❌ Conversion Failed: {e}")
        return None

def upload_to_supabase_storage(local_path, destination_name):
    """Uploads processed video to Supabase Storage Bucket"""
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
    """
    Core logic: Convert -> Transcribe -> Analyze -> Edit -> Upload to Cloud
    """
    filename = os.path.basename(raw_file_path)
    log_ui(f"⚙️ Processing for User: {user_id[:5]}...")

    # 1. Convert
    clean_video_path = convert_to_clean_mp4(raw_file_path)
    if not clean_video_path: 
        cleanup(raw_file_path)
        return

    # 2. Transcribe
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

    # 3. Analyze
    log_ui("🧠 Analyzing...")
    ai_response = ai.analyze_viral_clips(transcript_data)
    clips_found = ai_response.get('clips', [])
    log_ui(f"✂️ Found {len(clips_found)} clip(s).")

    # 4. Edit & Save
    try:
        # Note: process_video_clips now handles dynamic font sizing
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

    # 5. Cleanup Source Files
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
    """
    Receives video chunks from frontend, saves locally, and starts background processing.
    """
    filename = f"chunk_{uuid.uuid4().hex}.webm"
    file_path = os.path.join(UPLOAD_DIR, filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    background_tasks.add_task(process_video_pipeline, file_path, user_id)
    return {"status": "received"}