from youtube_transcript_api import YouTubeTranscriptApi
import json

video_id = 'UF8uR6Z6KLc'
try:
    print("Testing instance method...")
    api = YouTubeTranscriptApi()
    fetched = api.fetch(video_id, languages=['en'])
    print(f"Fetch return type: {type(fetched)}")
    snippet = fetched[0]
    print(f"Snippet type: {type(snippet)}")
    print(f"Snippet dir: {[m for m in dir(snippet) if not m.startswith('_')]}")
    print(f"Snippet text: {snippet.text[:50]}...")
except Exception as e:
    print(f"Instance method failed: {e}")
