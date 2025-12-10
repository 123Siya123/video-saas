import os
import json
import requests
import time
from supabase import create_client
import google_auth_oauthlib.flow
import googleapiclient.discovery
import googleapiclient.http
from requests_oauthlib import OAuth2Session

# --- CONFIG ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Change for production
REDIRECT_URI = "https://video-saas-1.onrender.com/auth/callback" 
# REDIRECT_URI = "https://your-app.onrender.com/auth/callback"

# --- PLATFORM CONFIGS ---
CONFIG = {
    'youtube': {
        'scope': ["https://www.googleapis.com/auth/youtube.upload"],
        'auth_url': "https://accounts.google.com/o/oauth2/auth",
        'token_url': "https://oauth2.googleapis.com/token"
    },
    'instagram': {
        # Permissions to upload to IG Business accounts
        'scope': ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement'],
        'auth_url': "https://www.facebook.com/v18.0/dialog/oauth",
        'token_url': "https://graph.facebook.com/v18.0/oauth/access_token"
    },
    'tiktok': {
        'scope': ['user.info.basic', 'video.upload'],
        'auth_url': "https://www.tiktok.com/v2/auth/authorize/",
        'token_url': "https://open.tiktokapis.com/v2/oauth/token/"
    },
    'twitter': {
        'scope': ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
        'auth_url': "https://twitter.com/i/oauth2/authorize",
        'token_url': "https://api.twitter.com/2/oauth2/token"
    }
}

def get_auth_url(user_id, platform, client_id, client_secret):
    """Generates the Login URL for the specific platform"""
    
    # Save keys temporarily to DB so we have them when user returns
    data = { "user_id": user_id, "platform": platform, "client_id": client_id, "client_secret": client_secret }
    supabase.table("platforms").upsert(data, on_conflict="user_id,platform").execute()

    if platform == 'youtube':
        flow = google_auth_oauthlib.flow.Flow.from_client_config(
            {"web": {"client_id": client_id, "client_secret": client_secret, "auth_uri": CONFIG['youtube']['auth_url'], "token_uri": CONFIG['youtube']['token_url']}},
            scopes=CONFIG['youtube']['scope']
        )
        flow.redirect_uri = REDIRECT_URI
        auth_url, _ = flow.authorization_url(prompt='consent', access_type='offline')
        return auth_url

    elif platform in ['instagram', 'tiktok', 'twitter']:
        # Generic OAuth 2.0 Flow
        oauth = OAuth2Session(client_id, redirect_uri=REDIRECT_URI, scope=CONFIG[platform]['scope'])
        
        # Twitter requires PKCE (Code Challenge)
        if platform == 'twitter':
            authorization_url, state = oauth.authorization_url(CONFIG[platform]['auth_url'], code_challenge_method="S256")
        else:
            authorization_url, state = oauth.authorization_url(CONFIG[platform]['auth_url'])
            
        return authorization_url

    return None

def exchange_code_for_token(user_id, code, platform):
    """Exchanges code for access_token/refresh_token"""
    try:
        # 1. Retrieve Client ID/Secret from DB
        res = supabase.table("platforms").select("*").eq("user_id", user_id).eq("platform", platform).single().execute()
        creds = res.data
        if not creds: return {"error": "Credentials not found"}

        token_data = {}

        if platform == 'youtube':
            flow = google_auth_oauthlib.flow.Flow.from_client_config(
                {"web": {"client_id": creds['client_id'], "client_secret": creds['client_secret'], "auth_uri": CONFIG['youtube']['auth_url'], "token_uri": CONFIG['youtube']['token_url']}},
                scopes=CONFIG['youtube']['scope']
            )
            flow.redirect_uri = REDIRECT_URI
            flow.fetch_token(code=code)
            token_data = {
                "access_token": flow.credentials.token,
                "refresh_token": flow.credentials.refresh_token
            }

        elif platform == 'instagram':
            # Facebook Exchange
            params = {
                'client_id': creds['client_id'],
                'client_secret': creds['client_secret'],
                'redirect_uri': REDIRECT_URI,
                'code': code
            }
            r = requests.get(CONFIG['instagram']['token_url'], params=params)
            data = r.json()
            token_data = {"access_token": data.get('access_token'), "expires_at": time.time() + data.get('expires_in', 0)}
            
            # Instagram needs a "Long Lived Token" immediately
            if token_data['access_token']:
                ll_r = requests.get("https://graph.facebook.com/v18.0/oauth/access_token", params={
                    'grant_type': 'fb_exchange_token',
                    'client_id': creds['client_id'],
                    'client_secret': creds['client_secret'],
                    'fb_exchange_token': token_data['access_token']
                })
                ll_data = ll_r.json()
                if 'access_token' in ll_data:
                    token_data['access_token'] = ll_data['access_token']

        elif platform == 'twitter':
            oauth = OAuth2Session(creds['client_id'], redirect_uri=REDIRECT_URI)
            # Twitter PKCE needs client_secret for confidential clients
            token = oauth.fetch_token(
                CONFIG['twitter']['token_url'],
                client_secret=creds['client_secret'],
                code=code
            )
            token_data = {"access_token": token.get('access_token'), "refresh_token": token.get('refresh_token')}

        # 4. Save Tokens
        if 'access_token' in token_data:
            supabase.table("platforms").update(token_data).eq("user_id", user_id).eq("platform", platform).execute()
            return {"status": "success", "platform": platform}
        else:
            return {"error": "Failed to fetch token", "details": token_data}

    except Exception as e:
        print(f"Auth Exchange Error: {e}")
        return {"error": str(e)}

# --- UPLOAD LOGIC ---

def upload_video(user_id, platform, video_path_or_url, title, description):
    res = supabase.table("platforms").select("*").eq("user_id", user_id).eq("platform", platform).single().execute()
    creds = res.data
    if not creds or not creds.get('access_token'): return {"error": f"Not connected to {platform}"}

    if platform == 'youtube':
        return _upload_youtube(creds, video_path_or_url, title, description)
    elif platform == 'instagram':
        return _upload_instagram(creds, video_path_or_url, title)
    elif platform == 'twitter':
        return _upload_twitter(creds, video_path_or_url, title)
    
    return {"error": "Platform upload not implemented"}

def _upload_youtube(creds, video_path, title, description):
    # Requires local file
    import google.oauth2.credentials
    credentials = google.oauth2.credentials.Credentials(
        token=creds['access_token'],
        refresh_token=creds.get('refresh_token'),
        token_uri=CONFIG['youtube']['token_url'],
        client_id=creds['client_id'],
        client_secret=creds['client_secret']
    )
    youtube = googleapiclient.discovery.build("youtube", "v3", credentials=credentials)
    request = youtube.videos().insert(
        part="snippet,status",
        body={
            "snippet": {"title": title, "description": description, "tags": ["shorts"], "categoryId": "22"},
            "status": {"privacyStatus": "private"}
        },
        media_body=googleapiclient.http.MediaFileUpload(video_path)
    )
    response = request.execute()
    return {"status": "success", "id": response.get('id')}

def _upload_instagram(creds, video_url, caption):
    # 1. Get Facebook Page ID linked to Instagram
    token = creds['access_token']
    base = "https://graph.facebook.com/v18.0"
    
    # Get Pages
    r = requests.get(f"{base}/me/accounts?access_token={token}")
    pages = r.json().get('data', [])
    if not pages: return {"error": "No Facebook Pages found"}
    
    # Find IG Business Account linked to first page
    page_id = pages[0]['id']
    r_ig = requests.get(f"{base}/{page_id}?fields=instagram_business_account&access_token={token}")
    ig_acc = r_ig.json().get('instagram_business_account')
    
    if not ig_acc: return {"error": "No Instagram Business Account linked to this Page"}
    ig_id = ig_acc['id']

    # 2. Create Media Container
    # Instagram requires a PUBLIC URL for video uploads via API
    container_payload = {
        'media_type': 'REELS',
        'video_url': video_url,
        'caption': caption,
        'access_token': token
    }
    r_cont = requests.post(f"{base}/{ig_id}/media", params=container_payload)
    container_id = r_cont.json().get('id')
    
    if not container_id: return {"error": "Failed to create IG container", "details": r_cont.json()}

    # 3. Wait for processing (Naive wait)
    time.sleep(10) # In prod, implement polling status

    # 4. Publish
    r_pub = requests.post(f"{base}/{ig_id}/media_publish", params={
        'creation_id': container_id,
        'access_token': token
    })
    
    return {"status": "success", "details": r_pub.json()}

def _upload_twitter(creds, video_path, text):
    # Twitter V2 doesn't support video upload cleanly yet, using V1.1 for media
    # NOTE: This requires requests_oauthlib
    from requests_oauthlib import OAuth1Session # If using v1 user creds
    # However, we used OAuth2. Standard Twitter API v2 Media Upload is complex.
    # For MVP, this serves as a placeholder or requires 'tweepy' library for ease.
    return {"error": "Twitter Upload requires complex chunking. Recommend using 'tweepy' library internally."}