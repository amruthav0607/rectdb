import json
import sys
import urllib.request
from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            # Try to fetch YT page directly
            video_id = "UF8uR6Z6KLc"
            url = f"https://www.youtube.com/watch?v={video_id}"
            
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
            }
            
            req = urllib.request.Request(url, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=10) as response:
                    status = response.getcode()
                    content = response.read(1000).decode('utf-8', errors='ignore')
                    has_captions = "captionTracks" in content
            except Exception as e:
                status = "Fetch failed"
                content = str(e)
                has_captions = False

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            data = {
                "success": True,
                "status": status,
                "has_captions_in_first_kb": has_captions,
                "content_preview": content[:200]
            }
            self.wfile.write(json.dumps(data).encode())
        except Exception as ge:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(ge)}).encode())
