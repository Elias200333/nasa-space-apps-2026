"""Flujo en vivo del LiDAR hacia el visor 3D del dashboard (WebSocket binario).

Origen
    ``pack_raw_frame`` y el formato ``LVX1`` vienen de ``lidar_service.py`` del visor
    LiDAR «Bridge» aportado al equipo (2026-11-14), sin cambios de formato.

Formato de cada mensaje binario
    b"LVX1" | uint32 LE largo de la cabecera | cabecera JSON | bytes lz4 TAL CUAL
    llegaron del robot (unos KB). El navegador los descomprime en un Web Worker.
    Mandar los bytes originales evita un JSON de cientos de KB por mapa.

Pose
    ``rt/utlidar/robot_pose`` trae ``pose.position`` y ``pose.orientation`` (cuaternión)
    en el mismo marco que el mapa de vóxeles (``odom``, según su ``header.frame_id``).
    El rumbo (yaw) se calcula del cuaternión. Unidades: metros/radianes ASUMIDOS.
"""
from __future__ import annotations

import json
import math
import struct
from collections.abc import Mapping
from typing import Any

from .voxel_codec import MAX_SRC_SIZE

RAW_MAGIC = b"LVX1"


def pack_raw_frame(raw: bytes, meta: dict) -> bytes:
    header = json.dumps(meta, separators=(",", ":")).encode()
    return RAW_MAGIC + struct.pack("<I", len(header)) + header + raw


def raw_frame_fields(meta: Mapping[str, Any]) -> tuple[list[float], float, int] | None:
    """(origin, resolution, src_size) de los metadatos de un mapa, o None si no valen."""
    try:
        origin = [float(v) for v in list(meta.get("origin"))[:3]]
        resolution = float(meta.get("resolution"))
        src_size = int(meta.get("src_size"))
    except (TypeError, ValueError):
        return None
    if (len(origin) != 3 or not all(math.isfinite(v) for v in origin)
            or not math.isfinite(resolution) or resolution <= 0
            or src_size <= 0 or src_size > MAX_SRC_SIZE):
        return None
    return origin, resolution, src_size


def live_frame(meta: Mapping[str, Any], raw: bytes) -> bytes | None:
    """Mensaje LIDAR_VOXELS para el visor, o None si el mapa no es utilizable."""
    fields = raw_frame_fields(meta)
    if fields is None or not raw:
        return None
    origin, resolution, src_size = fields
    return pack_raw_frame(bytes(raw), {
        "type": "LIDAR_VOXELS",
        "origin": origin,
        "resolution": resolution,
        "src_size": src_size,
        "stamp": meta.get("stamp"),
        "frame_id": meta.get("frame_id"),
        "width": meta.get("width"),
    })


def yaw_from_quaternion(x: float, y: float, z: float, w: float) -> float:
    """Rumbo (giro alrededor de Z) de un cuaternión, en radianes."""
    return math.atan2(2.0 * (w * z + x * y), 1.0 - 2.0 * (y * y + z * z))


def pose_from_robot_pose(data: Any) -> dict | None:
    """``rt/utlidar/robot_pose`` → {x, y, z, yaw, frame_id}, o None si falta algo."""
    if not isinstance(data, Mapping):
        return None
    pose = data.get("pose")
    if not isinstance(pose, Mapping):
        return None
    pos, ori = pose.get("position"), pose.get("orientation")
    if not isinstance(pos, Mapping) or not isinstance(ori, Mapping):
        return None
    try:
        x, y, z = (float(pos[k]) for k in ("x", "y", "z"))
        qx, qy, qz, qw = (float(ori[k]) for k in ("x", "y", "z", "w"))
    except (KeyError, TypeError, ValueError):
        return None
    if not all(math.isfinite(v) for v in (x, y, z, qx, qy, qz, qw)):
        return None
    header = data.get("header")
    frame_id = header.get("frame_id") if isinstance(header, Mapping) else None
    return {"x": x, "y": y, "z": z, "yaw": yaw_from_quaternion(qx, qy, qz, qw), "frame_id": frame_id}
