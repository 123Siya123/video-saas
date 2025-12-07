import os
import numpy as np
from moviepy.editor import VideoFileClip, AudioFileClip, ImageClip, CompositeVideoClip
from PIL import Image, ImageDraw, ImageFont

def create_caption_clip(text, duration, video_width):
    # --- SMART FONT SCALING (9:16 Optimized) ---
    # 1. Define safe width (80% of video width to account for vertical edges)
    max_text_width = int(video_width * 0.80)
    fontsize = 80 
    
    font_name = "arialbd.ttf" 
    font = None

    # 2. Shrink font until text fits
    while fontsize > 20:
        try:
            font = ImageFont.truetype(font_name, fontsize)
        except:
            try:
                font = ImageFont.truetype("arial.ttf", fontsize)
            except:
                font = ImageFont.load_default()
                break 

        # Measure Text
        dummy_img = Image.new('RGB', (10, 10))
        dummy_draw = ImageDraw.Draw(dummy_img)
        left, top, right, bottom = dummy_draw.textbbox((0, 0), text, font=font)
        text_width = right - left
        text_height = bottom - top

        if text_width <= max_text_width:
            break # It fits!
        
        fontsize -= 5 # Too big, shrink it
    
    # 3. Draw Image
    img_width = int(video_width)
    img_height = text_height + 60 # Extra padding
    img = Image.new('RGBA', (img_width, img_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    x_pos = (img_width - text_width) / 2
    y_pos = (img_height - text_height) / 2

    # Outline
    for x in range(-4, 5):
        for y in range(-4, 5):
            draw.text((x_pos+x, y_pos+y), text, font=font, fill="black")

    # Text
    draw.text((x_pos, y_pos), text, font=font, fill="#FFFF00")

    img_np = np.array(img)
    return ImageClip(img_np).set_duration(duration)

def process_video_clips(video_path, clips_metadata, transcript_data):
    processed_files = []
    
    # Load Video
    original_clip = VideoFileClip(video_path)
    
    # --- 9:16 CROP ---
    w, h = original_clip.size
    target_ratio = 9 / 16
    current_ratio = w / h

    # Crop to 9:16 if wider
    if current_ratio > target_ratio:
        new_width = h * target_ratio
        center_x = w / 2
        x1 = center_x - (new_width / 2)
        x2 = center_x + (new_width / 2)
        original_clip = original_clip.crop(x1=x1, y1=0, x2=x2, y2=h)
        print(f"✂️ Cropped video to 9:16 ({int(new_width)}x{h})")
    
    video_duration = original_clip.duration
    video_width = original_clip.w 
    
    all_words = transcript_data['words'] 

    for i, clip_meta in enumerate(clips_metadata.get('clips', [])):
        if clip_meta['score'] < 1: continue 

        start_ts, end_ts = find_timestamps(all_words, clip_meta['start_text'], clip_meta['end_text'])
        
        if start_ts is None or end_ts is None: continue
        if end_ts > video_duration: end_ts = video_duration - 0.1
        if start_ts >= end_ts: continue
        if (end_ts - start_ts) < 2: continue 

        print(f"🎬 Editing {clip_meta['title']}: {start_ts:.2f}s to {end_ts:.2f}s")

        subclip = original_clip.subclip(start_ts, end_ts).copy()

        clip_words = [w for w in all_words if w['start'] >= start_ts and w['end'] <= end_ts]
        final_filename = f"{os.path.dirname(video_path)}/viral_{i}_{uuid_short()}.mp4"
        
        try:
            final_clip = None
            
            if clip_words:
                captions = []
                bucket_size = 2
                
                # Sort words by start time to prevent logical overlap
                clip_words.sort(key=lambda x: x['start'])

                for j in range(0, len(clip_words), bucket_size):
                    chunk = clip_words[j:j+bucket_size]
                    if not chunk: continue
                    
                    text_str = " ".join([w['word'].strip() for w in chunk]).upper()
                    
                    w_start = chunk[0]['start'] - start_ts
                    if w_start < 0: w_start = 0
                    
                    # Calculate duration to avoid overlap
                    if j + bucket_size < len(clip_words):
                        next_chunk_start = clip_words[j+bucket_size]['start'] - start_ts
                        duration = next_chunk_start - w_start
                    else:
                        w_end = chunk[-1]['end'] - start_ts
                        duration = w_end - w_start

                    if duration < 0.3: duration = 0.3

                    txt_clip = create_caption_clip(text_str, duration, video_width)
                    txt_clip = txt_clip.set_position(('center', 0.75), relative=True).set_start(w_start)
                    captions.append(txt_clip)
                
                final_clip = CompositeVideoClip([subclip, *captions])
                
                # Audio Safety Check
                if final_clip.audio is None:
                    audio_source = AudioFileClip(video_path).subclip(start_ts, end_ts)
                    final_clip = final_clip.set_audio(audio_source)
            else:
                final_clip = subclip

            final_clip.write_videofile(
                final_filename, 
                codec='libx264', 
                audio_codec='mp3', 
                fps=24,
                preset='ultrafast',
                threads=4,
                logger=None
            )
            processed_files.append((final_filename, clip_meta['title']))
            final_clip.close()

        except Exception as e:
            print(f"⚠️ Edit failed for clip {i}: {e}")

    original_clip.close()
    return processed_files

def find_timestamps(all_words, start_text, end_text):
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