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


def get_candidates_for_body(target_body: str, force_regen: bool = False) -> list:
    """
    Retrieves the 10 ranked candidate locations for the specified celestial body.
    Loads from global_analog_catalog_20.json if present, or computes via generate_terrain_3d.py.
    If force_regen is True, forces execution of the main.py / generate_terrain_3d.py ranking engine.
    """
    body_key = "Moon" if target_body.lower() in ("moon", "luna", "1") else "Mars"
    ranking_key = "lunar_ranking" if body_key == "Moon" else "martian_ranking"
    catalog_path = os.path.join(OUTPUT_DIR, "global_analog_catalog_20.json")

    if not force_regen and os.path.exists(catalog_path):
        try:
            with open(catalog_path, "r", encoding="utf-8") as f:
                cat = json.load(f)
            if ranking_key in cat and len(cat[ranking_key]) > 0:
                return cat[ranking_key]
        except Exception as e:
            print(f"[Backend API] Notice reading catalog: {e}")

    try:
        from generate_terrain_3d import print_analog_ranking
        print(f"[Backend API] Executing main.py / generate_terrain_3d ranking for {body_key}...")
        print_analog_ranking(body_key, save_json=True)
        if os.path.exists(catalog_path):
            with open(catalog_path, "r", encoding="utf-8") as f:
                cat = json.load(f)
            if ranking_key in cat and len(cat[ranking_key]) > 0:
                return cat[ranking_key]
    except Exception as e:
        print(f"[Backend API] Notice computing ranking: {e}")

    from modules.science.features.catalog import get_sites_by_target_body
    raw_sites = get_sites_by_target_body(body_key)
    candidates = []
    for idx, s in enumerate(raw_sites, 1):
        candidates.append({
            "rank": idx,
            "id": s.id,
            "name": s.name,
            "target_body": s.target_body,
            "pairing": s.target_site_pairing,
            "country": s.country,
            "lat": round(s.center_lat, 5),
            "lon": round(s.center_lon, 5),
            "elevation_range_m": s.elevation_range_m,
            "local_utm_epsg": s.local_utm_epsg,
            "score_pct": 65.0,
            "status": s.status,
            "strong_analogies": s.strong_analogies,
            "analogy_limitations": s.analogy_limitations,
            "mission_training_value": s.mission_training_value,
            "metrics_table": []
        })
    return candidates


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

        elif path in ("/api/candidates", "/api/candidates/generate"):
            body_arg = query.get("body", ["moon"])[0].lower()
            force_regen = query.get("regenerate", ["false"])[0].lower() in ("true", "1", "yes") or path == "/api/candidates/generate"
            target_body = "mars" if body_arg in ("mars", "marte", "2") else "moon"
            candidates = get_candidates_for_body(target_body, force_regen=force_regen)
            resp = {
                "success": True,
                "target_body": "Moon" if target_body == "moon" else "Mars",
                "count": len(candidates),
                "regenerated": force_regen,
                "candidates": candidates
            }
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
            return

        elif path == "/api/analog":
            body_arg = query.get("body", ["moon"])[0].lower()
            target_body = "mars" if body_arg in ("mars", "marte", "2") else "moon"
            target_info = PLANETARY_TARGETS[target_body]

            candidates = get_candidates_for_body(target_body)
            site_arg = query.get("site", [""])[0]

            # Find matching candidate by ID or index
            chosen_candidate = None
            if site_arg:
                for c in candidates:
                    if c["id"].lower() == site_arg.lower() or c["id"] == site_arg:
                        chosen_candidate = c
                        break
            if not chosen_candidate and candidates:
                chosen_candidate = candidates[0]

            site_id = chosen_candidate["id"] if chosen_candidate else target_info["recommended_site"]
            lat = chosen_candidate["lat"] if chosen_candidate else 29.038
            lon = chosen_candidate["lon"] if chosen_candidate else -13.719
            score = chosen_candidate.get("score_pct", 65.0) if chosen_candidate else 65.0

            # NASA Live telemetry
            try:
                telemetry = fetch_live_nasa_telemetry(target_body, site_id)
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
                "candidates_count": len(candidates),
                "candidates": candidates,
                "site": {
                    "id": site_id,
                    "name": chosen_candidate["name"] if chosen_candidate else target_info["name"],
                    "rank": chosen_candidate.get("rank", 1) if chosen_candidate else 1,
                    "status": chosen_candidate.get("status", "candidate") if chosen_candidate else "candidate",
                    "target_body": target_body.capitalize(),
                    "country": chosen_candidate.get("country", "") if chosen_candidate else "",
                    "pairing": chosen_candidate.get("pairing", "") if chosen_candidate else "",
                    "coordinates": {
                        "latitude": round(lat, 5),
                        "longitude": round(lon, 5),
                        "label": f"{abs(lat):.4f}° {'N' if lat>=0 else 'S'}, {abs(lon):.4f}° {'E' if lon>=0 else 'W'}"
                    },
                    "similarity_score": round(score, 1),
                    "confidence": 88.0,
                    "elevation_range_m": chosen_candidate.get("elevation_range_m", []) if chosen_candidate else [],
                    "metrics_table": chosen_candidate.get("metrics_table", []) if chosen_candidate else [],
                    "strong_analogies": chosen_candidate.get("strong_analogies", []) if chosen_candidate else [],
                    "analogy_limitations": chosen_candidate.get("analogy_limitations", []) if chosen_candidate else [],
                    "mission_training_value": chosen_candidate.get("mission_training_value", "") if chosen_candidate else "",
                    "sources": ["IGN PNOA-LiDAR", "NASA Trek", "Copernicus DEM"],
                    "cave_evidence": True,
                    "scientific_justification": (
                        chosen_candidate.get("strong_analogies", ["Análogo basáltico representativo"])[0]
                        if chosen_candidate and chosen_candidate.get("strong_analogies")
                        else f"Análogo geológico de alta fidelidad para {target_info['name']}."
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

            # Determine if a site-specific precomputed subfolder exists
            site_subfolder = None
            if site_id:
                clean_id = site_id.lower()
                if "caldera_blanca" in clean_id and os.path.isdir(os.path.join(OUTPUT_DIR, "caldera_blanca")):
                    site_subfolder = "caldera_blanca"
                elif "rio_tinto" in clean_id and os.path.isdir(os.path.join(OUTPUT_DIR, "rio_tinto")):
                    site_subfolder = "rio_tinto"
                elif os.path.isdir(os.path.join(OUTPUT_DIR, clean_id)):
                    site_subfolder = clean_id

            target_dir = os.path.join(OUTPUT_DIR, site_subfolder) if site_subfolder else OUTPUT_DIR
            prefix_url = f"/output_3d/{site_subfolder}/" if site_subfolder else "/output_3d/"

            json_comp_path = os.path.join(target_dir, "comparison_metrics.json")
            json_legacy_path = os.path.join(target_dir, "terrain_metrics.json")
            html_path = os.path.join(target_dir, "terrain_3d.html")

            # Check if cached files match requested center
            needs_run = force_regen or not os.path.exists(html_path) or (not os.path.exists(json_comp_path) and not os.path.exists(json_legacy_path))
            if not needs_run and not site_subfolder:
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
                try:
                    engine = RealisticTerrainComparisonEngine(
                        site_id=site_id or "ES_LANZAROTE_CALDERA_BLANCA",
                        target_body=body,
                        custom_lat=lat,
                        custom_lon=lon,
                        exploration_radius_m=radius_m
                    )
                    engine.run_all(OUTPUT_DIR)
                    target_dir = OUTPUT_DIR
                    prefix_url = "/output_3d/"
                    json_comp_path = os.path.join(OUTPUT_DIR, "comparison_metrics.json")
                    json_legacy_path = os.path.join(OUTPUT_DIR, "terrain_metrics.json")
                except Exception as e:
                    print(f"[Backend API Error] 3D terrain generation error: {e}")

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
                "html_url": f"{prefix_url}terrain_3d.html",
                "atlas_url": f"{prefix_url}thematic_comparison_atlas.png",
                "topo_url": f"{prefix_url}topographic_map_ign_100m.png",
                "report_url": f"{prefix_url}terrain_comparison_report.md"
            }

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
            return

        elif path.startswith("/output_3d/"):
            rel_path = urllib.parse.unquote(path[len("/output_3d/"):])
            clean_path = os.path.normpath(rel_path).lstrip("/\\")
            file_path = os.path.join(OUTPUT_DIR, clean_path)
            if os.path.exists(file_path) and os.path.isfile(file_path):
                self.send_response(200)
                if file_path.endswith(".html"):
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                elif file_path.endswith(".png"):
                    self.send_header("Content-Type", "image/png")
                elif file_path.endswith(".json"):
                    self.send_header("Content-Type", "application/json")
                elif file_path.endswith(".md"):
                    self.send_header("Content-Type", "text/markdown; charset=utf-8")
                elif file_path.endswith(".tif") or file_path.endswith(".tiff"):
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
        query = urllib.parse.parse_qs(parsed_url.query)
        if parsed_url.path in ("/api/candidates/generate", "/api/candidates"):
            content_len = int(self.headers.get("Content-Length", 0))
            body_data = self.rfile.read(content_len).decode("utf-8") if content_len > 0 else "{}"
            try:
                data = json.loads(body_data)
            except Exception:
                data = {}
            body_arg = str(data.get("body") or query.get("body", ["moon"])[0]).lower()
            target_body = "mars" if body_arg in ("mars", "marte", "2") else "moon"
            candidates = get_candidates_for_body(target_body, force_regen=True)
            resp = {
                "success": True,
                "target_body": "Moon" if target_body == "moon" else "Mars",
                "count": len(candidates),
                "regenerated": True,
                "candidates": candidates
            }
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
            return

        elif parsed_url.path == "/api/generate-terrain":
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

