from http.server import BaseHTTPRequestHandler
from youtube_transcript_api import YouTubeTranscriptApi
import json
from urllib.parse import urlparse, parse_qs

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
            # 1. Use list_transcripts for better control
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
            
            # 2. Try to find a manual/English transcript first
            try:
                transcript = transcript_list.find_transcript(['en', 'en-US', 'en-GB'])
            except:
                # 3. Fallback to any available transcript (auto-generated)
                try:
                    transcript = transcript_list.find_generated_transcript(['en', 'en-US', 'en-GB'])
                except:
                    # 4. Final attempt: translation fallback
                    transcript = transcript_list.find_transcript(['en']).translate('en')

            data = transcript.fetch()
            full_text = " ".join([snippet['text'] for snippet in data])
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "text": full_text}).encode())
        except Exception as e:
            error_msg = str(e)
            # Detect common blocks and return a cleaner message
            if "proxy" in error_msg.lower() or "bot" in error_msg.lower() or "sign-in" in error_msg.lower():
                error_msg = "YouTube blocked the request from our server. This is common for certain videos in cloud environments."
            
            self.send_response(200) # Always return 200 to handle JSON error in action
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": error_msg}).encode())
            return
