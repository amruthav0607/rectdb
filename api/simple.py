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
            self._send_json({"success": False, "error": f"Import error: {str(ie)}"}, 200)
            return

        try:
            query = urlparse(self.path).query
            params = parse_qs(query)
            video_id = params.get('videoId', [None])[0]

            if not video_id:
                self._send_json({"success": False, "error": "No videoId provided"}, 400)
                return

            try:
                # Use instance method as per detected version 1.2.4
                api = YouTubeTranscriptApi()
                transcript = api.fetch(video_id)
                if transcript:
                    # transcript.snippets is the iterator/list in older versions
                    full_text = " ".join([snippet.text for snippet in transcript.snippets])
                    if full_text and len(full_text) > 20:
                        self._send_json({"success": True, "text": full_text})
                        return
                    else:
                         self._send_json({"success": False, "error": "Transcript too short or empty."}, 200)
                         return

            except Exception as e:
                error_msg = str(e)
                if "blocked" in error_msg.lower() or "403" in error_msg or "sign" in error_msg.lower():
                    self._send_json({"success": False, "error": "YouTube blocked this request. Fallback mode will be triggered."}, 200)
                else:
                    self._send_json({"success": False, "error": f"Transcript fetch failed: {error_msg}"}, 200)
                return

        except Exception as ge:
            self._send_json({"success": False, "error": f"Internal error: {str(ge)}"}, 500)
