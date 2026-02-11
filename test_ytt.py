from youtube_transcript_api import YouTubeTranscriptApi
import json

video_id = 'UF8uR6Z6KLc'
try:
    print("Testing instance method...")
    api = YouTubeTranscriptApi()
    transcript = api.fetch(video_id, languages=['en'])
    print(f"Success! Fetched {len(transcript)} snippets")
except Exception as e:
    print(f"Instance method failed: {e}")

try:
    print("\nTesting class method fetch...")
    transcript = YouTubeTranscriptApi.fetch(video_id, languages=['en'])
    print(f"Success! Fetched {len(transcript)} snippets")
except Exception as e:
    print(f"Class method fetch failed: {e}")

try:
    print("\nTesting class method list...")
    tl = YouTubeTranscriptApi.list(video_id)
    print(f"Success! Found {len(tl)} transcripts")
except Exception as e:
    print(f"Class method list failed: {e}")
