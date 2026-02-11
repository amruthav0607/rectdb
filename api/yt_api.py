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
            print(f"Error sending response: {e}")

    def do_GET(self):
        try:
            query = urlparse(self.path).query
            params = parse_qs(query)
            video_id = params.get('videoId', [None])[0]

            if not video_id:
                self._send_json({"success": False, "error": "No videoId provided"}, 400)
                return

            try:
                # youtube-transcript-api v1.2.4 uses instance-based API
                ytt_api = YouTubeTranscriptApi()
                
                # Try simple fetch first
                try:
                    transcript_obj = ytt_api.fetch(video_id, languages=['en', 'en-US'])
                    raw_data = transcript_obj.to_raw_data()
                    full_text = " ".join([t.get('text', '') for t in raw_data if isinstance(t, dict)])
                    
                    if len(full_text) > 20:
                        self._send_json({"success": True, "text": full_text, "source": "py-fetch"})
                        return
                except Exception as fe:
                    print(f"Fetch failed: {fe}")

                # Fallback to list()
                tl = ytt_api.list(video_id)
                try:
                    t = tl.find_transcript(['en', 'en-US'])
                except:
                    # Just take the first one available
                    t = None
                    for item in tl:
                        t = item
                        break
                
                if t:
                    fetched = t.fetch()
                    raw_data = fetched.to_raw_data()
                    full_text = " ".join([item.get('text', '') for item in raw_data if isinstance(item, dict)])
                    self._send_json({"success": True, "text": full_text, "source": "py-list"})
                    return
                
                self._send_json({"success": False, "error": "No transcript found for this video."}, 200)

            except Exception as e:
                error_msg = str(e)
                if "blocked" in error_msg.lower() or "403" in error_msg or "sign-in" in error_msg.lower():
                    error_msg = "YouTube blocked the cloud request. Try a different video."
                self._send_json({"success": False, "error": error_msg}, 200)

        except Exception as global_e:
            # Last resort crash handler
            try:
                self._send_json({"success": False, "error": f"Runtime error: {str(global_e)}"}, 500)
            except:
                pass
