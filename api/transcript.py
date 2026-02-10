import requests
from youtube_transcript_api import YouTubeTranscriptApi
import json
from urllib.parse import urlparse, parse_qs
from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = urlparse(self.path).query
        params = parse_qs(query)
        video_id = params.get('videoId', [None])[0]

        if not video_id:
            self.send_response(400)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": "No videoId provided"}).encode())
            return

        try:
            # Stealth Mode: Use a session with browser headers
            session = requests.Session()
            session.headers.update({
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.youtube.com/'
            })
            
            # Establish session by hitting the video page first
            session.get(f"https://www.youtube.com/watch?v={video_id}", timeout=5)

            # Use the established session for transcript fetching
            # We pass cookies from our session to the API
            cookies = session.cookies.get_dict()
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id, cookies=cookies)
            
            # Prioritize English manual, then generated
            try:
                transcript = transcript_list.find_transcript(['en', 'en-US'])
            except:
                try:
                    transcript = transcript_list.find_generated_transcript(['en', 'en-US'])
                except:
                    # Final fallback: any English available
                    transcript = transcript_list.find_transcript(['en'])

            data = transcript.fetch()
            full_text = " ".join([snippet['text'] for snippet in data])
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "text": full_text}).encode())
        except Exception as e:
            error_msg = str(e)
            # Categorize the block
            if "proxy" in error_msg.lower() or "bot" in error_msg.lower() or "403" in error_msg or "sign-in" in error_msg.lower():
                error_msg = "YouTube blocked our cloud server. This is common for certain videos on Vercel. Try using more educational/tutorial videos."
            elif "manual" in error_msg.lower() or "subtitles" in error_msg.lower():
                error_msg = "No subtitles found for this video. Please try one with Captions/CC enabled."
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": error_msg}).encode())
            return
