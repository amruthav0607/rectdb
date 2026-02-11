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
                # Simple direct fetch - works with youtube-transcript-api 1.x
                transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=['en', 'en-US'])
                if transcript:
                    text = " ".join([entry.get('text', '') for entry in transcript])
                    if text and len(text) > 20:
                        self._send_json({"success": True, "text": text})
                        return
            except Exception as e1:
                # Try auto-generated captions (any language)
                try:
                    transcript = YouTubeTranscriptApi.get_transcript(video_id)
                    if transcript:
                        text = " ".join([entry.get('text', '') for entry in transcript])
                        if text and len(text) > 20:
                            self._send_json({"success": True, "text": text})
                            return
                except Exception as e2:
                    error_msg = str(e2)
                    if "blocked" in error_msg.lower() or "403" in error_msg or "sign" in error_msg.lower():
                        self._send_json({"success": False, "error": "YouTube blocked this request. Fallback mode will be triggered."}, 200)
                        return

            self._send_json({"success": False, "error": "No transcript found for this video."}, 200)

        except Exception as ge:
            self._send_json({"success": False, "error": f"Internal error: {str(ge)}"}, 500)
