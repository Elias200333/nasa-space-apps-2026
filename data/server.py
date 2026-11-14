"""
TERRAIN-X Backend HTTP Service
=============================
Connects the web interface directly to the Python scientific data pipelines:
- main.py / analyze_analog.py for official NASA planetary analog coordinates & evaluation
- generate_terrain_3d.py for 3D elevation reconstruction, hydrology, and cavity detection
"""

import sys
import os
import json
import math
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.parse

# Ensure data root is on sys.path
_DATA_ROOT = os.path.dirname(os.path.abspath(__file__))
if _DATA_ROOT not in sys.path:
    sys.path.insert(0, _DATA_ROOT)

from analyze_analog import PLANETARY_TARGETS, fetch_live_nasa_telemetry
from modules.science.features.catalog import ANALOG_CATALOG
from modules.science.score import AnalogScorer
from generate_terrain_3d import Terrain3DEngine

OUTPUT_DIR = os.path.join(_DATA_ROOT, "output_3d")
os.makedirs(OUTPUT_DIR, exist_ok=True)


class TerrainXAPIHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        if path == "/api/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._send_cors_headers()
            self.end_headers()
            resp = {
                "status": "online",
                "service": "TERRAIN-X Python Backend Subsystem",
                "version": "2026.1.0",
                "endpoints": ["/api/analog", "/api/terrain-3d", "/output_3d/<file>"]
            }
            self.wfile.write(json.dumps(resp).encode("utf-8"))
            return

        elif path == "/api/analog":
            body_arg = query.get("body", ["moon"])[0].lower()
            if body_arg in ("mars", "marte", "2"):
                target_body = "mars"
            else:
                target_body = "moon"

            target_info = PLANETARY_TARGETS[target_body]
            site_id = query.get("site", [target_info["recommended_site"]])[0]
            site = ANALOG_CATALOG.get(site_id, ANALOG_CATALOG.get(target_info["recommended_site"]))

            # Extract site centroid from GeoJSON coordinates
            coords = site.earth_geojson["coordinates"][0]
            lon = sum(p[0] for p in coords[:-1]) / (len(coords) - 1)
            lat = sum(p[1] for p in coords[:-1]) / (len(coords) - 1)

            # Quantitative evaluation using AnalogScorer
            scorer = AnalogScorer()
            assessment = scorer.evaluate_site(site, target_info["mission_id"])

            # NASA Live telemetry
            try:
                telemetry = fetch_live_nasa_telemetry(target_body, site.id)
            except Exception as e:
                telemetry = {
                    "cmr": "LPCLOUD ASTGTM v003",
                    "power": f"Climatology proxy: ~18.5°C ({e})",
                    "ode": f"Archive record: {target_info['ode_product']}",
                    "wmts_template": f"https://trek.nasa.gov/tiles/{target_info['name'].split()[0]}/EQ/..."
                }

            result = {
                "success": True,
                "target_body": target_info["name"],
                "target_body_code": target_body.capitalize(),
                "mission_id": target_info["mission_id"],
                "primary_region": target_info["primary_region"],
                "target_gravity": target_info["target_gravity"],
                "atmosphere": target_info["atmosphere"],
                "site": {
                    "id": site.id,
                    "name": site.name,
                    "status": site.status,
                    "target_body": target_body.capitalize(),
                    "coordinates": {
                        "latitude": round(lat, 5),
                        "longitude": round(lon, 5)
                    },
                    "similarity_score": round(assessment.score * 100, 1),
                    "confidence": round(assessment.confidence * 100, 1),
                    "feature_scores": {k: round(v, 4) for k, v in assessment.feature_scores.items()},
                    "sources": site.sources,
                    "cave_evidence": site.cave_evidence,
                    "scientific_justification": (
                        f"Análogo volcánico basáltico tholeiítico de alta fidelidad para {target_info['name']}. "
                        f"Preserva morfologías de jameos/skylights de tubos de lava y amortiguación térmica interior."
                    )
                },
                "telemetry": telemetry
            }

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))
            return

        elif path == "/api/terrain-3d":
            try:
                lat = float(query.get("lat", [29.148])[0])
                lon = float(query.get("lon", [-13.450])[0])
                radius = float(query.get("radius", [10.0])[0])
                force_regen = query.get("force", ["false"])[0].lower() == "true"
            except (ValueError, IndexError):
                lat, lon, radius, force_regen = 29.148, -13.450, 10.0, False

            json_path = os.path.join(OUTPUT_DIR, "terrain_metrics.json")
            html_path = os.path.join(OUTPUT_DIR, "terrain_3d.html")

            # Check if cached files match requested center
            needs_run = force_regen or not os.path.exists(json_path) or not os.path.exists(html_path)
            if not needs_run:
                try:
                    with open(json_path, "r", encoding="utf-8") as f:
                        cached = json.load(f)
                        c_lat = cached.get("center", {}).get("lat", 0)
                        c_lon = cached.get("center", {}).get("lon", 0)
                        if abs(c_lat - lat) > 0.05 or abs(c_lon - lon) > 0.05:
                            needs_run = True
                except Exception:
                    needs_run = True

            if needs_run:
                print(f"[Backend API] Generating 3D terrain for ({lat:.4f}°, {lon:.4f}°) Radius: {radius} km...")
                engine = Terrain3DEngine(lat=lat, lon=lon, radius_km=radius)
                engine.run_all(OUTPUT_DIR)

            # Load metrics and cavities
            try:
                with open(json_path, "r", encoding="utf-8") as f:
                    terrain_data = json.load(f)
            except Exception as e:
                terrain_data = {"error": str(e), "metrics": {}, "cavities": []}

            resp = {
                "success": True,
                "center": {"lat": lat, "lon": lon},
                "radius_km": radius,
                "metrics": terrain_data.get("metrics", {}),
                "cavities": terrain_data.get("cavities", []),
                "html_url": "/output_3d/terrain_3d.html",
                "thematic_url": "/output_3d/thematic_maps.png"
            }

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
            return

        elif path.startswith("/output_3d/"):
            filename = os.path.basename(path)
            file_path = os.path.join(OUTPUT_DIR, filename)
            if os.path.exists(file_path) and os.path.isfile(file_path):
                self.send_response(200)
                if filename.endswith(".html"):
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                elif filename.endswith(".png"):
                    self.send_header("Content-Type", "image/png")
                elif filename.endswith(".json"):
                    self.send_header("Content-Type", "application/json")
                else:
                    self.send_header("Content-Type", "application/octet-stream")
                self._send_cors_headers()
                self.end_headers()
                with open(file_path, "rb") as f:
                    self.wfile.write(f.read())
                return
            else:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b"404 Not Found")
                return

        else:
            self.send_response(404)
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(b"Endpoint not found")

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        if parsed_url.path == "/api/generate-terrain":
            content_len = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_len).decode("utf-8") if content_len > 0 else "{}"
            try:
                data = json.loads(body)
            except Exception:
                data = {}

            lat = float(data.get("lat", 29.148))
            lon = float(data.get("lon", -13.450))
            radius = float(data.get("radius", 10.0))

            print(f"[Backend API POST] Generating 3D terrain for ({lat:.4f}°, {lon:.4f}°) Radius: {radius} km...")
            engine = Terrain3DEngine(lat=lat, lon=lon, radius_km=radius)
            engine.run_all(OUTPUT_DIR)

            json_path = os.path.join(OUTPUT_DIR, "terrain_metrics.json")
            with open(json_path, "r", encoding="utf-8") as f:
                terrain_data = json.load(f)

            resp = {
                "success": True,
                "center": {"lat": lat, "lon": lon},
                "radius_km": radius,
                "metrics": terrain_data.get("metrics", {}),
                "cavities": terrain_data.get("cavities", []),
                "html_url": "/output_3d/terrain_3d.html",
                "thematic_url": "/output_3d/thematic_maps.png"
            }

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
            return
        else:
            self.send_response(404)
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(b"Endpoint not found")

    def log_message(self, format, *args):
        # Concise logging
        sys.stderr.write(f"[DataServer] {self.address_string()} - {format % args}\n")


def run_server(port=8000):
    server_address = ("127.0.0.1", port)
    httpd = HTTPServer(server_address, TerrainXAPIHandler)
    print(f"[✓] TERRAIN-X Scientific Backend Server running on http://127.0.0.1:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()


if __name__ == "__main__":
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    run_server(port)

