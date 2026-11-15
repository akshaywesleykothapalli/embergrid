"""Serve Embergrid and its local, read-only archive."""
import argparse
import gzip
import json
from district_calendar import benchmark, calculate
import global_archive
import world_districts
from functools import lru_cache
from http import HTTPStatus
from io import BytesIO
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import re
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT.parent / "frontend"
DATA = ROOT / "data"
PAGES = {"/": "/index.html", "/explore": "/explorer.html", "/sangrur": "/sangrur.html",
         "/global": "/global.html", "/india.html": "/explorer.html", "/calendar": "/calendar.html"}
DATASETS = {
    "/api/global/boundaries": "world-boundaries.json",
    "/api/global/globe": "world-globe.json",
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
            admin = re.fullmatch(r"/api/global/subdivisions/([A-Za-z0-9]{3})", path)
            if admin:
                country = admin[1]
                source = DATA / "world-admin1" / f"{country}.json.gz"
                if source.is_file():
                    payload = source.read_bytes()
                    compressed = "gzip" in self.headers.get("Accept-Encoding", "").lower()
                    if not compressed:
                        payload = gzip.decompress(payload)
                else:
                    payload, compressed = b'{"type":"FeatureCollection","features":[]}', False
            district = re.fullmatch(r"/api/calendar/district/([0-9]{1,4})", path)
            if admin:
                pass
            elif path in {"/api/global/areas", "/api/global/series", "/api/global/overview", "/api/global/points",
                          "/api/global/districts", "/api/global/district-totals"}:
                try:
                    query = parse_qs(urlsplit(self.path).query)
                    area_id = query.get("area", ["WORLD"])[0]
                    if path.endswith("/areas"):
                        result = global_archive.areas()
                    elif path.endswith("/series"):
                        result = global_archive.series(area_id)
                    elif path.endswith("/districts"):
                        result = world_districts.districts(area_id)[0]
                    else:
                        year = int(query.get("year", ["2025"])[0])
                        month = int(query.get("month", ["10"])[0])
                        if not (2000 <= year <= 2026 and 1 <= month <= 12):
                            raise ValueError("Invalid month")
                        sensor = query.get("sensor", ["all"])[0]
                        if path.endswith("/overview"):
                            result = global_archive.overview(year, month)
                        elif path.endswith("/district-totals"):
                            result = world_districts.totals(area_id, year, month, sensor)
                        else:
                            district_id = query.get("district", [""])[0]
                            geometry = world_districts.selection(area_id, district_id) if district_id else None
                            day = int(query.get("day", ["0"])[0])
                            result = global_archive.points(area_id, year, month, sensor, geometry, day)
                    payload = json.dumps(result, allow_nan=False).encode("utf-8")
                except ValueError:
                    self.send_error(HTTPStatus.NOT_FOUND)
                    return None
                except ImportError as error:
                    self.log_error("%s", error)
                    self.send_error(HTTPStatus.SERVICE_UNAVAILABLE, "Global archive dependencies unavailable")
                    return None
                except OSError as error:
                    self.log_error("%s", error)
                    self.send_error(HTTPStatus.SERVICE_UNAVAILABLE, "Global archive or boundary source unavailable")
                    return None
                compressed = False
            elif path == "/api/calendar/benchmark":
                payload, compressed = json.dumps(benchmark()).encode("utf-8"), False
            elif district:
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
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=os.environ.get("PORT", "8765"))
    args = parser.parse_args()
    with ThreadingHTTPServer((args.host, args.port), CalendarHandler) as server:
        print(f"Embergrid is running at http://{args.host}:{server.server_port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
