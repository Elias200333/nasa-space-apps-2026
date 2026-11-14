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
from modules.science.features.catalog import ANALOG_CATALOG, EXPANDED_ANALOG_CATALOG, get_extended_site_by_id
from modules.science.score import AnalogScorer
from generate_terrain_3d import RealisticTerrainComparisonEngine, Terrain3DEngine

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

            # Check if expanded site metadata provides explicit geodetic center
            ext_site = get_extended_site_by_id(site.id) or EXPANDED_ANALOG_CATALOG.get(site.id)
            if ext_site:
                lat = ext_site.center_lat
                lon = ext_site.center_lon

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
                lat = float(query.get("lat", [29.038])[0])
                lon = float(query.get("lon", [-13.719])[0])
                radius = float(query.get("radius", [100.0])[0])
                body = query.get("body", ["Moon"])[0].capitalize()
                site_id = query.get("site", [""])[0]
                force_regen = query.get("force", ["false"])[0].lower() == "true"
            except (ValueError, IndexError):
                lat, lon, radius, body, site_id, force_regen = 29.038, -13.719, 100.0, "Moon", "", False

            # Convert to meters if passed in km
            radius_m = radius if radius >= 20.0 else radius * 1000.0

            json_comp_path = os.path.join(OUTPUT_DIR, "comparison_metrics.json")
            json_legacy_path = os.path.join(OUTPUT_DIR, "terrain_metrics.json")
            html_path = os.path.join(OUTPUT_DIR, "terrain_3d.html")

            # Check if cached files match requested center
            needs_run = force_regen or not os.path.exists(html_path) or (not os.path.exists(json_comp_path) and not os.path.exists(json_legacy_path))
            if not needs_run:
                try:
                    target_json = json_comp_path if os.path.exists(json_comp_path) else json_legacy_path
                    with open(target_json, "r", encoding="utf-8") as f:
                        cached = json.load(f)
                        c_gps = cached.get("center_gps") or cached.get("center", {})
                        c_lat = c_gps.get("lat", 0)
                        c_lon = c_gps.get("lon", 0)
                        if abs(c_lat - lat) > 0.05 or abs(c_lon - lon) > 0.05:
                            needs_run = True
                except Exception:
                    needs_run = True

            if needs_run:
                print(f"[Backend API] Generating synchronized 3D terrain for ({lat:.4f}°, {lon:.4f}°) Radius: {radius_m:.0f}m...")
                engine = RealisticTerrainComparisonEngine(
                    site_id=site_id or "ES_LANZAROTE_CALDERA_BLANCA",
                    target_body=body,
                    custom_lat=lat,
                    custom_lon=lon,
                    exploration_radius_m=radius_m
                )
                engine.run_all(OUTPUT_DIR)

            # Load metrics from synchronized comparison_metrics.json or legacy
            terrain_data = {}
            actual_gps = {"lat": lat, "lon": lon}
            actual_site_id = site_id
            actual_site_name = ""
            actual_radius_m = radius_m

            if os.path.exists(json_comp_path):
                try:
                    with open(json_comp_path, "r", encoding="utf-8") as f:
                        comp_raw = json.load(f)
                    actual_gps = comp_raw.get("center_gps") or actual_gps
                    actual_site_id = comp_raw.get("site_id") or actual_site_id
                    actual_site_name = comp_raw.get("site_name") or ""
                    actual_radius_m = comp_raw.get("exploration_radius_m", radius_m)
                    terrain_data = {
                        "metrics": comp_raw.get("metrics_100m", {}),
                        "evaluation": comp_raw.get("evaluation", {}),
                        "dem_metadata": comp_raw.get("dem_metadata", {}),
                        "similarity_pct": comp_raw.get("similarity_pct", 0),
                        "deliverables": comp_raw.get("deliverables", {})
                    }
                except Exception as e:
                    terrain_data = {"error": str(e), "metrics": {}}
            elif os.path.exists(json_legacy_path):
                try:
                    with open(json_legacy_path, "r", encoding="utf-8") as f:
                        terrain_data = json.load(f)
                except Exception as e:
                    terrain_data = {"error": str(e), "metrics": {}}

            resp = {
                "success": True,
                "site_id": actual_site_id,
                "site_name": actual_site_name,
                "center": actual_gps,
                "center_gps": actual_gps,
                "radius_m": actual_radius_m,
                "radius_km": round(actual_radius_m / 1000.0, 3),
                "target_body": body,
                "metrics": terrain_data.get("metrics", {}),
                "evaluation": terrain_data.get("evaluation", {}),
                "dem_metadata": terrain_data.get("dem_metadata", {}),
                "similarity_pct": terrain_data.get("similarity_pct", 0),
                "html_url": "/output_3d/terrain_3d.html",
                "atlas_url": "/output_3d/thematic_comparison_atlas.png",
                "topo_url": "/output_3d/topographic_map_ign_100m.png",
                "report_url": "/output_3d/terrain_comparison_report.md"
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
                elif filename.endswith(".md"):
                    self.send_header("Content-Type", "text/markdown; charset=utf-8")
                elif filename.endswith(".tif") or filename.endswith(".tiff"):
                    self.send_header("Content-Type", "image/tiff")
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

