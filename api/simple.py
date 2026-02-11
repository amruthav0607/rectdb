import json
from urllib.parse import urlparse, parse_qs
from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def _send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_GET(self):
        try:
            from youtube_transcript_api import YouTubeTranscriptApi
        except Exception as ie:
            self._send_json({"success": False, "error": "Environment setup issue on Vercel. Please check deployment logs."}, 200)
            return

        try:
            query = urlparse(self.path).query
            params = parse_qs(query)
            video_id = params.get('videoId', [None])[0]

            if not video_id:
                self._send_json({"success": False, "error": "No videoId provided"}, 400)
                return

            try:
                # Use instance-based API (v1.2.4+)
                api = YouTubeTranscriptApi()
                
                # Preferred: English fetch
                try:
                    t_obj = api.fetch(video_id, languages=['en', 'en-US'])
                    data = t_obj.to_raw_data()
                    text = " ".join([d.get('text', '') for d in data if isinstance(d, dict)])
                    if text:
                        self._send_json({"success": True, "text": text})
                        return
                except:
                    pass

                # Fallback: List and select best
                tl = api.list(video_id)
                t = None
                try:
                    t = tl.find_transcript(['en', 'en-US'])
                except:
                    # Take the first available
                    for item in tl:
                        t = item
                        break
                
                if t:
                    data = t.fetch().to_raw_data()
                    text = " ".join([d.get('text', '') for d in data if isinstance(d, dict)])
                    if text:
                        self._send_json({"success": True, "text": text})
                        return
                
                self._send_json({"success": False, "error": "No transcript found for this video."}, 200)

            except Exception as e:
                # YouTube cloud-blocking is common on Vercel
                error_msg = str(e)
                if "blocked" in error_msg.lower() or "403" in error_msg or "sign-in" in error_msg.lower():
                    error_msg = "YouTube blocked the cloud request. Fallback mode will be triggered."
                self._send_json({"success": False, "error": error_msg}, 200)

        except Exception as ge:
            self._send_json({"success": False, "error": f"Internal error: {str(ge)}"}, 500)
