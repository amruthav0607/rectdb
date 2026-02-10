from youtube_transcript_api import YouTubeTranscriptApi
import json
from urllib.parse import urlparse, parse_qs
from http.server import BaseHTTPRequestHandler

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
            # youtube-transcript-api v1.2.4 uses instance-based API
            ytt_api = YouTubeTranscriptApi()

            # Method 1: Direct fetch (simplest, tries English by default)
            try:
                fetched = ytt_api.fetch(video_id, languages=['en', 'en-US'])
                full_text = " ".join([snippet.text for snippet in fetched])

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "text": full_text}).encode())
                return
            except Exception as e1:
                print(f"[transcript.py] Direct fetch failed: {e1}")

            # Method 2: List transcripts and find the best one
            try:
                transcript_list = ytt_api.list(video_id)

                # Try English manual first, then generated
                transcript = None
                try:
                    transcript = transcript_list.find_transcript(['en', 'en-US'])
                except:
                    try:
                        transcript = transcript_list.find_generated_transcript(['en', 'en-US'])
                    except:
                        # Fall back to any available transcript
                        for t in transcript_list:
                            transcript = t
                            break

                if transcript:
                    data = transcript.fetch()
                    full_text = " ".join([snippet.text for snippet in data])

                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": True, "text": full_text}).encode())
                    return

            except Exception as e2:
                print(f"[transcript.py] List method failed: {e2}")
                raise e2

        except Exception as e:
            error_msg = str(e)
            # Categorize the error
            if "proxy" in error_msg.lower() or "bot" in error_msg.lower() or "403" in error_msg or "sign-in" in error_msg.lower() or "blocked" in error_msg.lower():
                error_msg = "YouTube blocked our cloud server. This is common for certain videos on Vercel. Try using more educational/tutorial videos."
            elif "subtitles" in error_msg.lower() or "no transcript" in error_msg.lower():
                error_msg = "No subtitles found for this video. Please try one with Captions/CC enabled."

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": error_msg}).encode())
            return
