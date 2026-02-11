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
                # Use instance-based API
                api = YouTubeTranscriptApi()
                
                # Try to list transcripts first (more robust)
                try:
                    transcript_list = api.list_transcripts(video_id)
                    
                    # 1. Try manual transcripts (English preferred)
                    try:
                        t = transcript_list.find_transcript(['en', 'en-US'])
                    except:
                        # 2. Try generated transcripts (English preferred)
                        try:
                            t = transcript_list.find_generated_transcript(['en', 'en-US'])
                        except:
                            # 3. Take whatever is available first
                            t = next(iter(transcript_list))

                    if t:
                        data = t.fetch()
                        text = " ".join([d.get('text', '') for d in data])
                        if text:
                            self._send_json({"success": True, "text": text})
                            return
                except Exception as le:
                    # If list_transcripts fails, it's often a block
                    error_msg = str(le)
                    if "blocked" in error_msg.lower() or "403" in error_msg:
                        self._send_json({"success": False, "error": "[BLOCK] YouTube blocked cloud IP for metadata."}, 200)
                        return
                    raise le

                self._send_json({"success": False, "error": "No transcript found for this video."}, 200)

            except Exception as e:
                error_msg = str(e)
                if "blocked" in error_msg.lower() or "403" in error_msg or "sign-in" in error_msg.lower():
                    error_msg = "[BLOCK] YouTube blocked this request."
                self._send_json({"success": False, "error": error_msg}, 200)

        except Exception as ge:
            self._send_json({"success": False, "error": f"Internal error: {str(ge)}"}, 500)
