import os
import json
import requests
from supabase import create_client
import google_auth_oauthlib.flow
import googleapiclient.discovery
import googleapiclient.http

# Initialize Supabase Admin (Service Role) to write tokens securely
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# This must match exactly what you tell users to type in their Google Console
# Update this to your production URL when you deploy!
REDIRECT_URI = "http://localhost:5173/auth/callback" 
# On Render, change this to: "https://your-app-name.onrender.com/auth/callback"

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]

def get_auth_url(user_id, platform, client_id, client_secret):
    """
    1. Saves the Client ID/Secret temporarily (or updates DB).
    2. Generates the Google Login URL using THEIR keys.
    """
    if platform == 'youtube':
        # Create a flow using the User's credentials
        flow = google_auth_oauthlib.flow.Flow.from_client_config(
            {
                "web": {
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
            },
            scopes=SCOPES
        )
        flow.redirect_uri = REDIRECT_URI
        
        auth_url, _ = flow.authorization_url(prompt='consent', access_type='offline')
        
        # Save credentials to DB so we can use them when they return
        data = {
            "user_id": user_id,
            "platform": "youtube",
            "client_id": client_id,
            "client_secret": client_secret
        }
        # Upsert: Update if exists, Insert if not
        supabase.table("platforms").upsert(data, on_conflict="user_id,platform").execute()
        
        return auth_url
    
    return None

def exchange_code_for_token(user_id, code):
    """
    User returns from Google with a 'code'.
    We look up their Client ID/Secret from DB, and swap code for Tokens.
    """
    try:
        # 1. Get User's Keys
        res = supabase.table("platforms").select("*").eq("user_id", user_id).eq("platform", "youtube").single().execute()
        creds = res.data
        
        if not creds:
            return {"error": "Credentials not found. Please try again."}

        # 2. Build Flow again
        flow = google_auth_oauthlib.flow.Flow.from_client_config(
            {
                "web": {
                    "client_id": creds['client_id'],
                    "client_secret": creds['client_secret'],
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
            },
            scopes=SCOPES
        )
        flow.redirect_uri = REDIRECT_URI
        
        # 3. Exchange code for Access/Refresh Token
        flow.fetch_token(code=code)
        credentials = flow.credentials

        # 4. Save Tokens to DB
        update_data = {
            "refresh_token": credentials.refresh_token,
            "access_token": credentials.token,
            "expires_at": 0 # We rely on refresh token usually
        }
        supabase.table("platforms").update(update_data).eq("user_id", user_id).eq("platform", "youtube").execute()
        
        return {"status": "success"}
        
    except Exception as e:
        print(f"Auth Exchange Error: {e}")
        return {"error": str(e)}

def upload_video(user_id, video_path, title, description):
    """
    Uploads a video to YouTube using the stored Refresh Token.
    """
    try:
        # 1. Get Tokens
        res = supabase.table("platforms").select("*").eq("user_id", user_id).eq("platform", "youtube").single().execute()
        creds_db = res.data
        
        if not creds_db or not creds_db.get('refresh_token'):
            return {"error": "Not connected to YouTube"}

        # 2. Reconstruct Credentials
        import google.oauth2.credentials
        credentials = google.oauth2.credentials.Credentials(
            token=creds_db['access_token'],
            refresh_token=creds_db['refresh_token'],
            token_uri="https://oauth2.googleapis.com/token",
            client_id=creds_db['client_id'],
            client_secret=creds_db['client_secret'],
            scopes=SCOPES
        )

        # 3. Initialize API
        youtube = googleapiclient.discovery.build("youtube", "v3", credentials=credentials)

        # 4. Upload
        request = youtube.videos().insert(
            part="snippet,status",
            body={
                "snippet": {
                    "title": title,
                    "description": description,
                    "tags": ["shorts", "viral"],
                    "categoryId": "22"
                },
                "status": {
                    "privacyStatus": "private" # Always upload private first for safety
                }
            },
            media_body=googleapiclient.http.MediaFileUpload(video_path)
        )
        response = request.execute()
        return {"status": "success", "video_id": response.get('id')}

    except Exception as e:
        print(f"Upload Error: {e}")
        return {"error": str(e)}