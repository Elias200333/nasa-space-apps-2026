"""Cuevas mapeadas e integradas en el mapa 3D de la interfaz («Integrar en el mapa 3D»).

Qué guarda
    Un registro pequeño por cueva en <data_dir>/caves/<id>.json. No copia la nube: apunta al
    escaneo de su misión (la nube está en <scan_id>.mission.json, con su SHA-256) y guarda
    DÓNDE la colocó el operador sobre el terreno: latitud y longitud de la entrada, cota de la
    superficie en ese punto, rumbo y profundidad.

Honestidad
    Esa posición es DECLARADA por el operador (el Go2 no tiene GPS ni brújula) y así consta en
    cada registro. La nube es DERIVADA (mapa acumulado del LiDAR, sin cierre de bucles).

Errores: CaveError (datos no válidos, escaneo sin nube de misión, cueva inexistente).
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any

from ..storage.scan_store import ScanStore, ScanStoreError
from ..util import iso_utc, new_id, utc_now, write_json_atomic

CAVE_ID = re.compile(r"^cave-[A-Za-z0-9_.\-]{1,100}$")
PLACEMENT_NOTE = "DECLARADA por el operador al integrarla en el mapa (el robot no tiene GPS ni brújula)"


class CaveError(ValueError):
    pass


def _num(body: dict, key: str, lo: float, hi: float) -> float:
    v = body.get(key)
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not lo <= v <= hi:
        raise CaveError(f"«{key}» debe ser un número entre {lo} y {hi}")
    return float(v)


def _text(v: Any, limit: int) -> str | None:
    return v.strip()[:limit] if isinstance(v, str) and v.strip() else None


class CaveStore:
    def __init__(self, data_dir: Path, scans: ScanStore) -> None:
        self.dir = Path(data_dir) / "caves"
        self.scans = scans

    def list(self) -> list[dict[str, Any]]:
        if not self.dir.is_dir():
            return []
        out = []
        for path in self.dir.glob("cave-*.json"):
            try:
                out.append(json.loads(path.read_text(encoding="utf-8")))
            except (OSError, ValueError):
                continue                      # un registro roto no impide ver los demás
        return sorted(out, key=lambda c: c.get("created_utc", ""))

    def create(self, body: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(body, dict):
            raise CaveError("cuerpo no válido")
        scan_id = body.get("scan_id")
        if not isinstance(scan_id, str):
            raise CaveError("falta «scan_id»")
        try:
            meta = self.scans.load_metadata(scan_id)
        except ScanStoreError as exc:
            raise CaveError(str(exc)) from exc
        if "mission" not in meta.files:
            raise CaveError(f"el escaneo {scan_id} no es de una misión (no tiene nube de misión)")
        mission = (meta.provenance or {}).get("mission") or {}
        lat, lon = _num(body, "lat", -90, 90), _num(body, "lon", -180, 180)
        surface = _num(body, "surface_elev_m", -12000, 30000)
        heading = _num(body, "heading_deg", 0, 360)
        depth = _num(body, "depth_m", 0, 1000)
        site = body.get("site") if isinstance(body.get("site"), dict) else {}
        number = len(self.list()) + 1
        record = {
            "schema": "terrainx.robot.cave/1",
            "id": new_id("cave"),
            "created_utc": iso_utc(utc_now()),
            "number": number,
            "name": _text(body.get("name"), 60) or f"Cueva {number}",
            "scan_id": scan_id,
            "mission_id": mission.get("mission_id"),
            "site": {k: site[k] for k in ("name", "lat", "lon", "body")
                     if isinstance(site.get(k), (str, int, float)) and not isinstance(site.get(k), bool)},
            "terrain_source": _text(body.get("terrain_source"), 300),
            "location": {"lat": lat, "lon": lon, "surface_elev_m": surface},
            "heading_deg": heading,
            "depth_m": depth,
            "placement": PLACEMENT_NOTE,
            "cloud": {"file": meta.files["mission"].path, "count": mission.get("count"),
                      "cube_size_m": mission.get("cube_size_m"), "evidence_class": meta.evidence_class.value,
                      "extent_local_m": mission.get("extent_local_m")},
        }
        write_json_atomic(self.dir / f"{record['id']}.json", record)
        return record

    def delete(self, cave_id: str) -> None:
        if not isinstance(cave_id, str) or not CAVE_ID.match(cave_id):
            raise CaveError(f"identificador de cueva no válido: {cave_id!r}")
        path = self.dir / f"{cave_id}.json"
        if not path.is_file():
            raise CaveError(f"no existe la cueva {cave_id}")
        path.unlink()
