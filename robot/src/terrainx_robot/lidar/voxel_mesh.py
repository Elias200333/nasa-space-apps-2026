"""Malla de cubos del mapa SLAM acumulado: el PLY se ve como el visor, no como puntos.

Qué hace
    Convierte vóxeles ocupados (índices enteros del mundo k = (kx, ky, kz)) en una malla de
    cubos: solo las caras que dan a un hueco (las de dentro no se ven), dos triángulos por
    cara y normales hacia fuera (vértices en orden antihorario vistos desde fuera).
    El vóxel k ocupa de (k − ½)·res a (k + ½)·res en cada eje: la misma caja que pinta el
    visor del dashboard (static/lidar/voxelMesh.js) y que manda el robot.

Color
    La paleta de la app de Unitree que usa el visor (static/lidar/LidarMapEngine.js,
    SWATCHES): franja = kz + 9, de 0 a 30, la misma que paletteColor() da a ese vóxel.
    Las aristas grises del visor son un efecto de pantalla (shader): no van al archivo.

Vértices
    Se comparten entre caras del MISMO color (esquina + franja). Así cada cara tiene un
    color liso, como en el visor, y el archivo ocupa mucho menos que con 4 vértices por cara.

Clase de evidencia
    La del mapa del que sale (el acumulado es DERIVADO). Esto solo cambia la forma de
    dibujarlo: no añade ni quita vóxeles.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

# Paleta de la app (copiada de LidarMapEngine.js: deben coincidir).
SWATCHES = (
    0x0004FF, 0x002BFF, 0x0055FF, 0x007BFF, 0x00A6FF, 0x00CCFF, 0x00F2FF, 0x00FFE1,
    0x00FFBB, 0x00FF6F, 0x00FF44, 0x00FF15, 0x15FF00, 0x95FF00, 0xBFFF00, 0xEEFF00,
    0xFFE100, 0xFF9500, 0xFF7700, 0xFF5E00, 0xFF5100, 0x9500FF, 0xBF00FF, 0xFF00C8,
    0xFF0095, 0xFF0077, 0xFF0059, 0xFF003C, 0xFF003C, 0xFF003C, 0xFF003C, 0xFF003C,
)
N_BANDS = 31                     # franjas usadas: 0…30
BAND_OFFSET = 9                  # franja = kz + 9 (= floor(origen_z / res) + capa + 10 en el visor)
PALETTE = np.array([[(c >> 16) & 255, (c >> 8) & 255, c & 255] for c in SWATCHES[:N_BANDS]], dtype=np.uint8)

# Por cada cara: dirección del vecino y sus 4 esquinas (en vóxeles, desde la esquina baja del
# cubo) en orden antihorario visto desde fuera: (v1 − v0) × (v2 − v0) apunta hacia fuera.
FACES = (
    ((-1, 0, 0), ((0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0))),
    ((1, 0, 0), ((1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1))),
    ((0, -1, 0), ((0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1))),
    ((0, 1, 0), ((0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0))),
    ((0, 0, -1), ((0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0))),
    ((0, 0, 1), ((0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1))),
)


@dataclass
class VoxelMesh:
    vertices: np.ndarray    # (V, 3) float64, metros del marco del mapa
    colors: np.ndarray      # (V, 3) uint8, RGB de la paleta de la app
    triangles: np.ndarray   # (T, 3) int32, índices de vértice
    voxels: int             # vóxeles ocupados que representa
    cube_faces: int         # caras de cubo visibles (2 triángulos cada una)
    resolution: float       # lado del cubo (m)


def band(kz: np.ndarray) -> np.ndarray:
    """Franja de color de la paleta para la capa del mundo kz."""
    return np.clip(np.asarray(kz, dtype=np.int64) + BAND_OFFSET, 0, N_BANDS - 1)


def _empty(res: float) -> VoxelMesh:
    return VoxelMesh(np.empty((0, 3)), np.empty((0, 3), np.uint8), np.empty((0, 3), np.int32), 0, 0, res)


def _check_resolution(resolution: float) -> float:
    res = float(resolution)
    if not np.isfinite(res) or res <= 0:
        raise ValueError(f"resolución no válida: {resolution!r}")
    return res


def _grid_key(lo: np.ndarray, span: np.ndarray):
    """Clave entera única por celda de la caja [lo, lo + span)."""
    if float(span[0]) * float(span[1]) * float(span[2]) * N_BANDS >= 2.0 ** 62:
        raise ValueError("mapa demasiado extenso para la clave de 64 bits")

    def key(a: np.ndarray) -> np.ndarray:
        a = a - lo
        return (a[:, 0] * span[1] + a[:, 1]) * span[2] + a[:, 2]
    return key


def visible_faces(voxels: np.ndarray) -> tuple[np.ndarray, np.ndarray, int]:
    """Caras de cubo que dan a un hueco: (esquinas (F, 4, 3) enteras en orden antihorario visto
    desde fuera, franja de color (F,), nº de vóxeles distintos). La usan el PLY y el GLB: los
    dos llevan exactamente los mismos cubos."""
    idx = np.asarray(voxels, dtype=np.int64).reshape(-1, 3)
    if idx.shape[0] == 0:
        return np.empty((0, 4, 3), np.int64), np.empty(0, np.int64), 0
    # Caben los vecinos (−1) de todos en la caja de claves
    lo = idx.min(axis=0) - 1
    key = _grid_key(lo, idx.max(axis=0) - lo + 2)
    keys, first = np.unique(key(idx), return_index=True)     # ordenadas y sin repetidos
    idx = idx[first]

    corners, bands = [], []
    for normal, quad in FACES:
        nk = key(idx + np.asarray(normal, dtype=np.int64))
        pos = np.minimum(np.searchsorted(keys, nk), keys.size - 1)
        visible = keys[pos] != nk                                # el vecino está vacío
        v = idx[visible]
        if v.shape[0]:
            corners.append(v[:, None, :] + np.asarray(quad, dtype=np.int64)[None, :, :])
            bands.append(band(v[:, 2]))
    if not corners:                                               # no pasa con vóxeles finitos
        return np.empty((0, 4, 3), np.int64), np.empty(0, np.int64), int(idx.shape[0])
    return np.concatenate(corners), np.concatenate(bands), int(idx.shape[0])


def build_voxel_mesh(voxels: np.ndarray, resolution: float) -> VoxelMesh:
    """voxels: (N, 3) índices enteros del mundo (los repetidos se quitan); resolution en m."""
    res = _check_resolution(resolution)
    corners_all, bands_all, n_voxels = visible_faces(voxels)
    n_faces = corners_all.shape[0]
    if n_faces == 0:
        return _empty(res)

    # Vértices compartidos solo entre caras del mismo color: clave = esquina · 31 + franja
    flat = corners_all.reshape(-1, 3)
    lo = flat.min(axis=0)
    span = flat.max(axis=0) - lo + 1
    key = _grid_key(lo, span)
    vkey = key(flat) * N_BANDS + np.repeat(bands_all, 4)
    uniq, inverse = np.unique(vkey, return_inverse=True)
    quads = inverse.reshape(n_faces, 4).astype(np.int32)
    triangles = np.stack((quads[:, [0, 1, 2]], quads[:, [0, 2, 3]]), axis=1).reshape(-1, 3)

    vband = uniq % N_BANDS
    ck = uniq // N_BANDS
    z = ck % span[2]
    xy = ck // span[2]
    corner = np.column_stack((xy // span[1], xy % span[1], z)) + lo
    vertices = (corner.astype(np.float64) - 0.5) * res            # esquina c → (c − ½)·res
    return VoxelMesh(vertices, PALETTE[vband], triangles, n_voxels, int(n_faces), res)
