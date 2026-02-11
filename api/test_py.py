import json
import sys
from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            import youtube_transcript_api
            lib_info = "Imported successfully"
        except Exception as e:
            lib_info = f"Failed to import: {str(e)}"

        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        
        data = {
            "success": True,
            "python_version": sys.version,
            "library_status": lib_info,
            "path": sys.path
        }
        self.wfile.write(json.dumps(data).encode())
