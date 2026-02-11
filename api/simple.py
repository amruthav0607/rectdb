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
            # Move imports inside to catch import-time errors
            try:
                from youtube_transcript_api import YouTubeTranscriptApi
            except Exception as ie:
                self._send_json({"success": False, "error": f"Import failed: {str(ie)}", "v": "v7-debug"}, 200)
                return

            query = urlparse(self.path).query
            params = parse_qs(query)
            video_id = params.get('videoId', [None])[0]

            if not video_id:
                self._send_json({"success": False, "error": "No videoId", "v": "v7-debug"}, 400)
                return

            try:
                api = YouTubeTranscriptApi()
                t_obj = api.fetch(video_id, languages=['en', 'en-US'])
                data = t_obj.to_raw_data()
                text = " ".join([d.get('text', '') for d in data if isinstance(d, dict)])
                
                if text:
                    self._send_json({"success": True, "text": text, "v": "v7-debug"})
                else:
                    self._send_json({"success": False, "error": "Empty text", "v": "v7-debug"})
                return

            except Exception as e:
                self._send_json({"success": False, "error": f"Logic error: {str(e)}", "v": "v7-debug"}, 200)
                return

        except Exception as global_e:
            try:
                self._send_json({"success": False, "error": f"Global crash: {str(global_e)}", "v": "v7-debug"}, 200)
            except:
                pass
