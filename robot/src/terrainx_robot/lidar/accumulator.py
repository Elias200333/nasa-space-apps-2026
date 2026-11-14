"""Acumulación de frames LiDAR durante una ventana de captura.

Qué hace
    Recibe LidarFrames y produce una única nube:
      - mode="last": el último frame válido (instantánea del mapa).
      - mode="accumulate": unión de todos los frames válidos, sin vóxeles
        duplicados (misma celda de la rejilla => un solo punto).
    Rechaza (y cuenta el motivo) los frames con error de decodificación, vacíos,
    o con frame_id / resolución distintos del primero: mezclar marcos de
    referencia distintos produciría una nube geométricamente falsa.

Rendimiento (importa: add() corre en el bucle asyncio de la conexión WebRTC)
    Los duplicados se quitan frame a frame: cada celda se resume en un único
    int64 y se busca en un array ordenado de celdas ya vistas. Antes se juntaban
    todos los puntos y se deduplicaba al final con np.unique(axis=0): con Pluffy,
    15 s de captura = 5,4 M puntos → 14 s con el bucle congelado al pulsar
    «Detener y guardar», y el Go2 cortaba la conexión. Ahora result() solo
    concatena lo ya deduplicado. El resultado es el mismo (primera aparición).

Unidades: metros (asumidos, ver voxel_codec).
Errores: PointCloudTooLarge si la nube final supera el máximo.
"""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass, field
from typing import Literal

import numpy as np

from ..models import LidarFrameInfo, PointType
from .frames import LidarFrame
from .validation import (
    DEFAULT_MAX_ABS_COORD_M,
    DEFAULT_MAX_POINTS,
    PointCloudTooLarge,
    validate_points,
)

CaptureMode = Literal["accumulate", "last"]

# Índice de celda (i, j, k) → un int64: 21 bits por eje con desplazamiento, |índice| < 2^20.
# Con 0,05 m y coordenadas ≤ 1000 m (validation) el índice llega a 20 000: cabe de sobra.
_KEY_BITS = 21
_KEY_OFFSET = 1 << (_KEY_BITS - 1)


def _cell_keys(points: np.ndarray, res: float) -> np.ndarray | None:
    """Clave int64 de la celda de cada punto (round(p / res), la misma regla de siempre).
    None si algún índice no cabe en 21 bits (entonces se usa el camino antiguo)."""
    idx = np.rint(points / res).astype(np.int64)
    if idx.size and int(np.abs(idx).max()) >= _KEY_OFFSET:
        return None
    u = idx + _KEY_OFFSET
    return (u[:, 0] << (2 * _KEY_BITS)) | (u[:, 1] << _KEY_BITS) | u[:, 2]


@dataclass
class AccumulatedCloud:
    points: np.ndarray
    mode: str
    topic: str | None
    frame_id: str | None
    resolution: float | None
    point_type: PointType
    decoder: str | None
    frames_received: int
    frames_used: int
    frames_rejected: int
    rejection_reasons: dict[str, int]
    first_info: LidarFrameInfo | None
    last_info: LidarFrameInfo | None
    validation: dict = field(default_factory=dict)
    deduplication: dict = field(default_factory=dict)
    # Solo en una malla (point_type = voxel_mesh): ``points`` son sus vértices, ``faces``
    # los triángulos (T, 3) y ``colors`` el RGB uint8 de cada vértice.
    faces: np.ndarray | None = None
    colors: np.ndarray | None = None


class CaptureAccumulator:
    def __init__(
        self,
        mode: CaptureMode = "accumulate",
        *,
        max_points: int = DEFAULT_MAX_POINTS,
        max_abs_coord_m: float = DEFAULT_MAX_ABS_COORD_M,
    ) -> None:
        if mode not in ("accumulate", "last"):
            raise ValueError(f"modo de captura desconocido: {mode}")
        self.mode = mode
        self.max_points = max_points
        self.max_abs_coord_m = max_abs_coord_m
        self._chunks: list[np.ndarray] = []
        self._raw_count = 0            # puntos guardados en _chunks
        self._points_in = 0            # puntos válidos recibidos (antes de quitar duplicados)
        # Deduplicación incremental (modo accumulate con resolución): claves ya vistas, ordenadas.
        # Si una captura no la admite (sin resolución o índices enormes), se usa la deduplicación
        # al final de siempre y _incremental pasa a False para el resto de la captura.
        self._seen_keys = np.empty(0, dtype=np.int64)
        self._incremental = True
        self.frames_received = 0
        self.frames_used = 0
        self._reasons: Counter[str] = Counter()
        self._first: LidarFrameInfo | None = None
        self._last: LidarFrameInfo | None = None
        self._non_finite = 0
        self._out_of_bounds = 0

    # ------------------------------------------------------------------ entrada
    def _reject_reason(self, frame: LidarFrame) -> str | None:
        info = frame.info
        if info.decode_error:
            return "decode_error"
        if frame.points.shape[0] == 0:
            return "empty_frame"
        if self._first is not None:
            if info.frame_id != self._first.frame_id:
                return "frame_id_mismatch"
            ref, cur = self._first.resolution, info.resolution
            if (ref is None) != (cur is None) or (
                ref is not None and cur is not None and not math.isclose(ref, cur, rel_tol=1e-9)
            ):
                return "resolution_mismatch"
            if info.point_type != self._first.point_type:
                return "point_type_mismatch"
        return None

    def add(self, frame: LidarFrame) -> bool:
        """Añade un frame. Devuelve False si se rechaza (el motivo queda contado)."""
        self.frames_received += 1
        reason = self._reject_reason(frame)
        if reason:
            self._reasons[reason] += 1
            return False
        clean, report = validate_points(
            frame.points, max_points=self.max_points, max_abs_coord_m=self.max_abs_coord_m
        )
        self._non_finite += report.non_finite_removed
        self._out_of_bounds += report.out_of_bounds_removed
        if clean.shape[0] == 0:
            self._reasons["empty_after_validation"] += 1
            return False
        if self._first is None:
            self._first = frame.info
        self._last = frame.info
        self.frames_used += 1
        self._points_in += clean.shape[0]
        if self.mode == "last":
            self._chunks = [clean]
            self._raw_count = clean.shape[0]
            return True
        if self._incremental and self._add_new_cells(clean):
            return True
        self._incremental = False
        self._chunks.append(clean)
        self._raw_count += clean.shape[0]
        if self._raw_count > 2 * self.max_points:
            self._compact()
        return True

    def _add_new_cells(self, clean: np.ndarray) -> bool:
        """Guarda solo los puntos de celdas no vistas (primera aparición, en orden de llegada).
        False si no se puede (sin resolución o índices fuera de rango)."""
        res = self._first.resolution if self._first else None
        keys = _cell_keys(clean, res) if res else None
        if keys is None:
            return False
        uniq, first = np.unique(keys, return_index=True)   # 1-D: rápido (≈ 50 k claves por mapa)
        seen = self._seen_keys
        if seen.size:
            pos = np.searchsorted(seen, uniq)
            known = pos < seen.size
            known[known] = seen[pos[known]] == uniq[known]
            uniq, first, pos = uniq[~known], first[~known], pos[~known]
        else:
            pos = np.zeros(uniq.size, dtype=np.intp)
        if uniq.size:
            self._seen_keys = np.insert(seen, pos, uniq)    # sigue ordenado
            new_points = clean[np.sort(first)]
            self._chunks.append(new_points)
            self._raw_count += new_points.shape[0]
        return True

    # ----------------------------------------------------------------- salida
    def _rule(self) -> str:
        res = self._first.resolution if self._first else None
        if res:
            return f"un punto por celda de {res} m (round(p / resolution)); se conserva la primera aparición"
        return "eliminación de coordenadas idénticas"

    def _dedupe(self, points: np.ndarray) -> tuple[np.ndarray, dict]:
        res = self._first.resolution if self._first else None
        if points.shape[0] == 0:
            return points, {"rule": "none", "removed": 0}
        rule = self._rule()
        if res:
            keys = np.rint(points / res).astype(np.int64)
        else:
            keys = points
        _, first_idx = np.unique(keys, axis=0, return_index=True)
        first_idx.sort()
        unique = points[first_idx]
        return unique, {"rule": rule, "removed": int(points.shape[0] - unique.shape[0])}

    def _compact(self) -> None:
        merged = np.concatenate(self._chunks, axis=0)
        unique, _ = self._dedupe(merged)
        self._chunks = [unique]
        self._raw_count = unique.shape[0]

    def result(self) -> AccumulatedCloud:
        if self._chunks:
            merged = np.concatenate(self._chunks, axis=0)
        else:
            merged = np.empty((0, 3), dtype=np.float64)
        if self.mode == "last":
            points, dedup = merged, {"rule": "none (modo last)", "removed": 0}
            total_before = int(merged.shape[0])
        else:
            if self._incremental:   # ya deduplicado frame a frame: solo se junta
                points = merged
            else:
                points, _ = self._dedupe(merged)
            total_before = self._points_in
            dedup = {"rule": self._rule() if total_before else "none",
                     "removed": int(total_before - points.shape[0])}
        if points.shape[0] > self.max_points:
            raise PointCloudTooLarge(
                f"la nube acumulada tiene {points.shape[0]} puntos (máximo {self.max_points})"
            )
        dedup["points_before"] = total_before
        first = self._first
        return AccumulatedCloud(
            points=points,
            mode=self.mode,
            topic=first.topic if first else None,
            frame_id=first.frame_id if first else None,
            resolution=first.resolution if first else None,
            point_type=first.point_type if first else PointType.UNKNOWN,
            decoder=first.decoder if first else None,
            frames_received=self.frames_received,
            frames_used=self.frames_used,
            frames_rejected=self.frames_received - self.frames_used,
            rejection_reasons=dict(self._reasons),
            first_info=first,
            last_info=self._last,
            validation={
                "non_finite_removed": self._non_finite,
                "out_of_bounds_removed": self._out_of_bounds,
                "max_abs_coord_m": self.max_abs_coord_m,
            },
            deduplication=dedup,
        )
