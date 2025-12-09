import os
import requests

# Get this from your Render Environment Variables
AYRSHARE_API_KEY = os.environ.get("AYRSHARE_API_KEY") 

def generate_connect_link(user_id):
    """
    Creates a link for your USER to connect THEIR social accounts.
    """
    if not AYRSHARE_API_KEY:
        print("❌ Error: AYRSHARE_API_KEY is missing in environment variables.")
        return None

    url = "https://api.ayrshare.com/api/profiles/generate-jwt"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {AYRSHARE_API_KEY}"
    }
    
    # payload to create/get profile
    payload = {
        "title": f"DirectorFlow User {user_id}",
        "profileKey": user_id
    }

    try:
        # 1. Try to create profile first (idempotent)
        print(f"... Creating/Checking profile for {user_id} ...")
        create_res = requests.post(
            "https://api.ayrshare.com/api/profiles/profile-create", 
            json=payload, 
            headers=headers
        )
        # We don't check result here because if it exists, it returns 400, which is fine.

        # 2. Generate the JWT link
        print(f"... Generating Link for {user_id} ...")
        response = requests.post(url, json=payload, headers=headers)
        data = response.json()
        
        if "url" in data:
            return data["url"] # The link to show the user
        
        # Log error if no URL
        print(f"❌ Ayrshare Error Response: {data}")
        return None

    except Exception as e:
        print(f"❌ Ayrshare Connect Exception: {e}")
        return None

def post_to_networks(user_id, video_url, caption, platforms):
    """
    Posts video to selected platforms.
    """
    if not AYRSHARE_API_KEY:
        return {"status": "error", "message": "Server missing API Key"}

    url = "https://api.ayrshare.com/api/post"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {AYRSHARE_API_KEY}"
    }
    
    payload = {
        "post": caption,
        "platforms": platforms, 
        "mediaUrls": [video_url],
        "profileKey": user_id 
    }

    try:
        print(f"📤 Posting to {platforms} for {user_id}...")
        response = requests.post(url, json=payload, headers=headers)
        data = response.json()
        
        if response.status_code != 200 or data.get("status") == "error":
            print(f"❌ Post Failed: {data}")
            return {"status": "error", "message": str(data)}
            
        return data
    except Exception as e:
        print(f"❌ Ayrshare Post Exception: {e}")
        return {"status": "error", "message": str(e)}