import json
import sys
from http.server import BaseHTTPRequestHandler
from youtube_transcript_api import YouTubeTranscriptApi

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            api = YouTubeTranscriptApi()
            # Try a known video
            video_id = "UF8uR6Z6KLc"
            try:
                transcript = api.fetch(video_id, languages=['en'])
                status = f"Success! Fetched {len(transcript)} snippets"
            except Exception as e:
                status = f"Fetch failed: {str(e)}"

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            data = {
                "success": True,
                "status": status,
                "python": sys.version
            }
            self.wfile.write(json.dumps(data).encode())
        except Exception as ge:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(ge)}).encode())
