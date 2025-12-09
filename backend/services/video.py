import os
import numpy as np
from moviepy.editor import VideoFileClip, AudioFileClip, ImageClip, CompositeVideoClip
from PIL import Image, ImageDraw, ImageFont

def get_best_font(fontsize):
    """
    Tries to load a font. 
    1. Looks for 'font.ttf' in the current directory (Best for custom look).
    2. Looks for standard Linux fonts (Render/Ubuntu).
    3. Falls back to default.
    """
    font_candidates = [
        "font.ttf",                   # Your custom font if you upload one
        "arialbd.ttf",                # Windows/Standard
        "Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", # Linux standard
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" # Linux standard
    ]
    
    for font_name in font_candidates:
        try:
            return ImageFont.truetype(font_name, fontsize)
        except OSError:
            continue
            
    # Absolute fallback (might look small/pixelated, but prevents crash)
    return ImageFont.load_default()

def create_caption_clip(text, duration, video_width):
    # --- 1. DYNAMIC SCALING ---
    # We want the text to be roughly 10% of the video width in height
    # For 1080p width, this starts around 110px
    base_fontsize = int(video_width * 0.12) 
    max_text_width = int(video_width * 0.90) # Use 90% of screen width
    
    fontsize = base_fontsize
    font = get_best_font(fontsize)
    
    # Initialize measurement variables
    dummy_img = Image.new('RGB', (10, 10))
    dummy_draw = ImageDraw.Draw(dummy_img)
    
    # --- 2. SHRINK TO FIT ---
    # Iteratively shrink font if it's too wide for the screen
    whileUX_Safety = 20
    while fontsize > whileUX_Safety:
        font = get_best_font(fontsize)
        left, top, right, bottom = dummy_draw.textbbox((0, 0), text, font=font)
        text_width = right - left
        text_height = bottom - top

        if text_width <= max_text_width:
            break
        
        fontsize -= 5 # Shrink by 5px steps

    # --- 3. DRAW IMAGE ---
    # Create canvas with padding for stroke
    stroke_width = int(fontsize * 0.08) # Dynamic stroke thickness
    img_width = int(video_width)
    img_height = text_height + (stroke_width * 4) + 20 
    
    img = Image.new('RGBA', (img_width, img_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Center text
    x_pos = (img_width - text_width) / 2
    y_pos = (img_height - text_height) / 2

    # Draw Stroke (Outline) - We draw it multiple times to make it thick
    for x in range(-stroke_width, stroke_width + 1):
        for y in range(-stroke_width, stroke_width + 1):
            draw.text((x_pos+x, y_pos+y), text, font=font, fill="black")

    # Main Text
    # Yellow text looks most "Viral", specifically #FFEE00
    draw.text((x_pos, y_pos), text, font=font, fill="#FFEE00")

    img_np = np.array(img)
    return ImageClip(img_np).set_duration(duration)

def process_video_pipeline(video_path, clips_metadata, transcript_data):
    # ... (Keep existing logic for cropping and setup) ...
    # This function body remains largely the same, 
    # just ensure it calls the updated create_caption_clip above
    return process_video_clips(video_path, clips_metadata, transcript_data)

# Re-paste the rest of your process_video_clips logic here from your original file
# ensuring it uses the new create_caption_clip function.
# Below is the logic from your file for context:

def process_video_clips(video_path, clips_metadata, transcript_data):
    processed_files = []
    
    original_clip = VideoFileClip(video_path)
    
    # Crop to 9:16
    w, h = original_clip.size
    target_ratio = 9 / 16
    current_ratio = w / h

    if current_ratio > target_ratio:
        new_width = h * target_ratio
        center_x = w / 2
        x1 = center_x - (new_width / 2)
        x2 = center_x + (new_width / 2)
        original_clip = original_clip.crop(x1=x1, y1=0, x2=x2, y2=h)
    
    video_width = original_clip.w 
    all_words = transcript_data['words'] 

    for i, clip_meta in enumerate(clips_metadata.get('clips', [])):
        if clip_meta['score'] < 1: continue 

        start_ts, end_ts = find_timestamps(all_words, clip_meta['start_text'], clip_meta['end_text'])
        
        if start_ts is None or end_ts is None: continue
        if end_ts > original_clip.duration: end_ts = original_clip.duration - 0.1
        if start_ts >= end_ts: continue
        if (end_ts - start_ts) < 2: continue 

        subclip = original_clip.subclip(start_ts, end_ts).copy()

        clip_words = [w for w in all_words if w['start'] >= start_ts and w['end'] <= end_ts]
        final_filename = f"{os.path.dirname(video_path)}/viral_{i}_{uuid_short()}.mp4"
        
        try:
            final_clip = None
            if clip_words:
                captions = []
                # Reduced bucket size to 1 or 2 words for punchier, larger text
                bucket_size = 2 
                clip_words.sort(key=lambda x: x['start'])

                for j in range(0, len(clip_words), bucket_size):
                    chunk = clip_words[j:j+bucket_size]
                    if not chunk: continue
                    
                    text_str = " ".join([w['word'].strip() for w in chunk]).upper()
                    
                    w_start = chunk[0]['start'] - start_ts
                    if w_start < 0: w_start = 0
                    
                    if j + bucket_size < len(clip_words):
                        next_chunk_start = clip_words[j+bucket_size]['start'] - start_ts
                        duration = next_chunk_start - w_start
                    else:
                        w_end = chunk[-1]['end'] - start_ts
                        duration = w_end - w_start

                    if duration < 0.3: duration = 0.3

                    txt_clip = create_caption_clip(text_str, duration, video_width)
                    # Position: Center X, 70% down Y (Chest level)
                    txt_clip = txt_clip.set_position(('center', 0.70), relative=True).set_start(w_start)
                    captions.append(txt_clip)
                
                final_clip = CompositeVideoClip([subclip, *captions])
                
                if final_clip.audio is None:
                    audio_source = AudioFileClip(video_path).subclip(start_ts, end_ts)
                    final_clip = final_clip.set_audio(audio_source)
            else:
                final_clip = subclip

            final_clip.write_videofile(
                final_filename, 
                codec='libx264', 
                audio_codec='aac',  # Changed to AAC for better social compatibility
                fps=24,
                preset='ultrafast',
                threads=4,
                logger=None
            )
            processed_files.append((final_filename, clip_meta['title']))
            final_clip.close()

        except Exception as e:
            print(f"Edit failed: {e}")

    original_clip.close()
    return processed_files

def find_timestamps(all_words, start_text, end_text):
    # (Keep your existing find_timestamps logic)
    start_time = None
    end_time = None
    s_tokens = start_text.lower().split()
    e_tokens = end_text.lower().split()
    if not s_tokens or not e_tokens: return None, None
    for i in range(len(all_words) - len(s_tokens) + 1):
        match = True
        for j in range(len(s_tokens)):
            if s_tokens[j] not in all_words[i+j]['word'].lower():
                match = False
                break
        if match:
            start_time = all_words[i]['start']
            break
    for i in range(len(all_words)-1, -1, -1):
         if e_tokens[-1] in all_words[i]['word'].lower():
             end_time = all_words[i]['end']
             break
    return start_time, end_time

def uuid_short():
    import uuid
    return uuid.uuid4().hex[:6]