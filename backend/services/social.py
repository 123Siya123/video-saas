import os
import requests

# Get this from your Render Environment Variables
AYRSHARE_API_KEY = os.environ.get("AYRSHARE_API_KEY") 

def generate_connect_link(user_id):
    """
    Creates a link for your USER to connect THEIR social accounts (YouTube, TikTok, etc).
    """
    url = "https://api.ayrshare.com/api/profiles/generate-jwt"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {AYRSHARE_API_KEY}"
    }
    
    # We create a profile for this specific user_id
    # If the profile doesn't exist, Ayrshare usually creates it or you might need to hit /profile-create first.
    # For simplicity, we try to get the JWT directly.
    payload = {
        "title": f"DirectorFlow User {user_id}",
        "profileKey": user_id
    }

    try:
        # First ensure profile exists
        requests.post(
            "https://api.ayrshare.com/api/profiles/profile-create", 
            json=payload, 
            headers=headers
        )
        
        # Now get the frontend link
        response = requests.post(url, json=payload, headers=headers)
        data = response.json()
        
        if "url" in data:
            return data["url"] # The link to show the user
        return None
    except Exception as e:
        print(f"Ayrshare Connect Error: {e}")
        return None

def post_to_networks(user_id, video_url, caption, platforms):
    """
    The Python version of your CURL command.
    """
    url = "https://api.ayrshare.com/api/post"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {AYRSHARE_API_KEY}"
    }
    
    # payload matching your curl command
    payload = {
        "post": caption,
        "platforms": platforms, # e.g. ["tiktok", "youtube"]
        "mediaUrls": [video_url],
        "profileKey": user_id # This ensures it posts to the USER'S account, not yours
    }

    try:
        print(f"📤 Posting to {platforms} for {user_id}...")
        response = requests.post(url, json=payload, headers=headers)
        return response.json()
    except Exception as e:
        print(f"Ayrshare Post Error: {e}")
        return {"status": "error", "message": str(e)}