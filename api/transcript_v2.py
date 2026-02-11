from youtube_transcript_api import YouTubeTranscriptApi
import json
from urllib.parse import urlparse, parse_qs
from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def _send_json(self, data, status=200):
        try:
            self.send_response(status)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())
        except Exception as e:
            print(f"Error: {e}")

    def do_GET(self):
        try:
            query = urlparse(self.path).query
            params = parse_qs(query)
            video_id = params.get('videoId', [None])[0]

            if not video_id:
                self._send_json({"success": False, "error": "No videoId"}, 400)
                return

            try:
                # Use the new instance-based API
                api = YouTubeTranscriptApi()
                
                # Fetch as raw data (most compatible)
                try:
                    t_obj = api.fetch(video_id, languages=['en', 'en-US'])
                    data = t_obj.to_raw_data()
                    text = " ".join([d.get('text', '') for d in data if isinstance(d, dict)])
                    if text:
                        self._send_json({"success": True, "text": text, "src": "py-s"})
                        return
                except:
                    pass

                # Fallback to list()
                tl = api.list(video_id)
                t = None
                try:
                    t = tl.find_transcript(['en', 'en-US'])
                except:
                    for item in tl:
                        t = item
                        break
                
                if t:
                    data = t.fetch().to_raw_data()
                    text = " ".join([d.get('text', '') for d in data if isinstance(d, dict)])
                    self._send_json({"success": True, "text": text, "src": "py-l"})
                    return
                
                self._send_json({"success": False, "error": "No transcript available"}, 200)

            except Exception as e:
                self._send_json({"success": False, "error": str(e)}, 200)

        except Exception as ge:
            try:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(ge).encode())
            except:
                pass
