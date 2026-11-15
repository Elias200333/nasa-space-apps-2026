"""Mapa SLAM como ARRAY DE COORDENADAS (JSON): un punto por cubo del visor.

Qué hace
    De los vóxeles del mapa acumulado (índices enteros k del mundo: los mismos de los que salen
    la malla PLY y el GLB) saca el CENTRO de cada cubo, k · res, en metros y en los ejes del
    robot (los mismos que el .ply). Van TODOS los cubos, también los interiores que la malla no
    dibuja porque no se ven. El dashboard lo guarda como <scan_id>.coords.json junto al .ply y
    el .glb, con su SHA-256.

Formato
    {"scan_id", …, "cube_size_m", "point", "order", "count", "points": [[x, y, z], …]}
    Un punto por línea, sin repetidos, ordenados por x, luego y, luego z. Cada cubo va de
    punto − cube_size_m/2 a punto + cube_size_m/2 en cada eje: es la caja que pinta el visor.
    Unidad «m» ASUMIDA, como en todo el módulo (ver voxel_codec): sin verificar físicamente.
"""
from __future__ import annotations

import json

import numpy as np

from .voxel_mesh import _check_resolution

COORDS_FORMAT = ("JSON UTF-8 · array [x, y, z] en m: centro de cada cubo del visor (uno por vóxel, "
                 "también los interiores), ejes del robot como el .ply")


def voxel_centers(voxels: np.ndarray, resolution: float) -> np.ndarray:
    """(N, 3) índices enteros del mundo → (M, 3) centros en m (k · res), sin repetidos y
    ordenados por x, luego y, luego z."""
    res = _check_resolution(resolution)
    idx = np.asarray(voxels, dtype=np.int64).reshape(-1, 3)
    if idx.shape[0] == 0:
        return np.empty((0, 3), dtype=np.float64)
    idx = np.unique(idx, axis=0)                      # filas ordenadas: x, luego y, luego z
    return np.round(idx.astype(np.float64) * res, 6)  # 3 · 0,05 = 0,15000000000000002 → 0,15


def build_coords_json(voxels: np.ndarray, resolution: float, *, info: dict | None = None) -> bytes:
    """El archivo .coords.json. ``info`` = datos del escaneo que van delante (scan_id, clase de
    evidencia, marco…). ValueError si no hay vóxeles o la resolución no vale."""
    res = _check_resolution(resolution)
    pts = voxel_centers(voxels, res)
    if pts.shape[0] == 0:
        raise ValueError("no hay vóxeles: el mapa está vacío")
    fields = {
        **(info or {}),
        "unit": "m",
        "units_verification": "unverified",
        "axes": "los del marco del robot, como el .ply (sin verificar físicamente); el .glb usa Y arriba",
        "cube_size_m": res,
        "point": "centro de cada cubo: el cubo va de punto − cube_size_m/2 a punto + cube_size_m/2 en cada eje",
        "order": "por x, luego y, luego z",
        "count": int(pts.shape[0]),
    }
    head = json.dumps(fields, ensure_ascii=False, indent=2)           # termina en "\n}"
    rows = json.dumps(pts.tolist())[1:-1].replace("], [", "],\n    [")  # un punto por línea
    return (head[:-2] + ',\n  "points": [\n    ' + rows + "\n  ]\n}\n").encode("utf-8")
