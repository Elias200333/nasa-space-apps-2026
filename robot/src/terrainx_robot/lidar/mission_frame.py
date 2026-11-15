"""Marco LOCAL de una misión de mapeo («Mapear zona subterránea» desde la interfaz).

Qué hace
    Pasa los centros de los cubos del mapa acumulado (marco ``odom`` del perro, los mismos
    puntos que el .coords.json) a un marco propio de la misión:
        origen = posición del robot al empezar la misión,
        x = hacia donde miraba el robot, y = a su izquierda, z = arriba.
    Es solo un giro alrededor de la vertical más una traslación: NO cambia ninguna distancia,
    así que la escala es la del LiDAR (metros ASUMIDOS, como en todo el módulo; ver
    docs/VERIFICACION_FISICA.md). La interfaz coloca después ese marco sobre el terreno con un
    anclaje que declara el operador (el perro no tiene GPS ni brújula).

Suelo bajo el punto de partida (ESTIMADO, no medido)
    Entre los cubos a ≤ FLOOR_RADIUS_M en horizontal del punto de partida y por debajo de él,
    el nivel de altura con más cubos. Sirve para apoyar el punto de partida sobre el terreno.
    Si no hay ninguno, queda en None y la interfaz usa la altura del propio robot.
"""

from __future__ import annotations

import json
import math

import numpy as np

FLOOR_RADIUS_M = 1.0
MISSION_FORMAT = ("JSON UTF-8 · centros de cubo en el marco local de la misión, en m: x adelante, "
                  "y izquierda, z arriba; origen = robot al empezar")


def _centers(voxels: np.ndarray, res: float) -> np.ndarray:
    idx = np.unique(np.asarray(voxels, dtype=np.int64).reshape(-1, 3), axis=0)
    return idx.astype(np.float64) * float(res)          # k · res: igual que el .coords.json


def to_local(points_odom: np.ndarray, start_pose: dict) -> np.ndarray:
    """(N, 3) en el marco odom → (N, 3) en el marco de la misión (giro de −yaw y traslación)."""
    p0 = np.array([start_pose["x"], start_pose["y"], start_pose["z"]], dtype=np.float64)
    c, s = math.cos(start_pose["yaw"]), math.sin(start_pose["yaw"])
    d = np.asarray(points_odom, dtype=np.float64) - p0
    return np.column_stack((c * d[:, 0] + s * d[:, 1], -s * d[:, 0] + c * d[:, 1], d[:, 2]))


def floor_below_start(local: np.ndarray, res: float) -> float | None:
    """z local (m) del nivel con más cubos bajo el punto de partida, o None si no hay ninguno."""
    near = local[(np.hypot(local[:, 0], local[:, 1]) <= FLOOR_RADIUS_M) & (local[:, 2] < 0)]
    if not len(near):
        return None
    levels, counts = np.unique(np.round(near[:, 2] / res).astype(np.int64), return_counts=True)
    return round(float(levels[counts.argmax()] * res), 4)


def build_mission_json(voxels: np.ndarray, res: float, start_pose: dict, *,
                       info: dict | None = None) -> tuple[bytes, dict]:
    """El archivo <scan_id>.mission.json y un resumen (sin los puntos) para los metadatos."""
    local = to_local(_centers(voxels, res), start_pose)
    if not len(local):
        raise ValueError("no hay vóxeles: el mapa está vacío")
    floor = floor_below_start(local, res)
    summary = {
        "count": int(local.shape[0]),
        "cube_size_m": float(res),
        "start_pose_odom": {k: round(float(start_pose[k]), 4) for k in ("x", "y", "z", "yaw")},
        "floor_z_local_m": floor,
        "floor_method": (f"ESTIMADO: nivel con más cubos a ≤ {FLOOR_RADIUS_M} m del punto de partida y "
                         "por debajo de él" if floor is not None else "no encontrado (sin cubos bajo el punto de partida)"),
        "extent_local_m": {"min": np.round(local.min(axis=0), 3).tolist(),
                           "max": np.round(local.max(axis=0), 3).tolist()},
    }
    head = {
        **(info or {}),
        "frame": "local de la misión: origen = robot al empezar, x = hacia donde miraba, y = izquierda, z = arriba",
        "transform": "giro de −yaw alrededor de z + traslación desde el marco odom: no cambia distancias",
        "unit": "m",
        "units_verification": "unverified",
        **summary,
    }
    text = json.dumps(head, ensure_ascii=False, indent=2)
    rows = json.dumps(np.round(local, 4).tolist())[1:-1].replace("], [", "],\n    [")
    return (text[:-2] + ',\n  "points": [\n    ' + rows + "\n  ]\n}\n").encode("utf-8"), summary
