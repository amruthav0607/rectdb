import sys
import json
from youtube_transcript_api import YouTubeTranscriptApi

def get_transcript(video_id):
    try:
        # Instantiate the API class
        api = YouTubeTranscriptApi()
        
        # Fetch the transcript
        transcript = api.fetch(video_id)
        
        # Combine snippets into full text
        full_text = " ".join([snippet.text for snippet in transcript.snippets])
        
        print(json.dumps({"success": True, "text": full_text}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    if len(sys.argv) > 1:
        get_transcript(sys.argv[1])
    else:
        print(json.dumps({"success": False, "error": "No video ID provided"}))
