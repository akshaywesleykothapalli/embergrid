"""Serve Fire Calendar and its local, read-only archive."""
import argparse
import gzip
import json
from district_calendar import calculate
from functools import lru_cache
from http import HTTPStatus
from io import BytesIO
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT.parent / "frontend"
DATA = ROOT / "data"
PAGES = {"/": "/index.html", "/explore": "/explorer.html", "/sangrur": "/sangrur.html",
         "/india.html": "/explorer.html", "/calendar": "/calendar.html"}
DATASETS = {
    "/api/sangrur/harmonized": "harmonized.json",
    "/api/india/boundaries": "india/boundaries.js",
    "/api/india/review": "india/review-summary.js",
    "/api/sangrur/detections": "data.js",
    "/api/sangrur/context": "context.js",
    "/api/sangrur/cloud-dates": "cloud-dates.js",
}


@lru_cache(maxsize=8)
def archive_payload(filename, compressed):
    source = (DATA / filename).read_text(encoding="utf-8")
    payload = (source if filename.endswith(".json") else source.split("=", 1)[1].strip().removesuffix(";")).encode("utf-8")
    return gzip.compress(payload, compresslevel=4) if compressed else payload


class CalendarHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND), **kwargs)

    def send_head(self):
        path = urlsplit(self.path).path
        if path.startswith("/api/"):
            filename = DATASETS.get(path)
            match = re.fullmatch(r"/api/india/month/(20(?:1[2-9]|2[0-5])-(?:0[1-9]|1[0-2]))", path)
            if match:
                filename = f"india/{match[1]}.js"
            district = re.fullmatch(r"/api/calendar/district/([0-9]{1,4})", path)
            if district:
                try:
                    payload = json.dumps(calculate(int(district[1]))).encode("utf-8")
                except ValueError:
                    self.send_error(HTTPStatus.NOT_FOUND)
                    return None
                compressed = False
            elif path == "/api/health":
                payload, compressed = b'{"status":"ok"}', False
            elif filename and (DATA / filename).is_file():
                compressed = "gzip" in [item.strip() for item in self.headers.get("Accept-Encoding", "").lower().split(",")]
                payload = archive_payload(filename, compressed)
            else:
                self.send_error(HTTPStatus.NOT_FOUND)
                return None
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Vary", "Accept-Encoding")
            if compressed:
                self.send_header("Content-Encoding", "gzip")
            self.end_headers()
            return BytesIO(payload)
        self.path = PAGES.get(path, path)
        return super().send_head()

    def list_directory(self, path):
        self.send_error(HTTPStatus.NOT_FOUND)
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    with ThreadingHTTPServer(("127.0.0.1", args.port), CalendarHandler) as server:
        print(f"Fire Calendar is running at http://127.0.0.1:{server.server_port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
