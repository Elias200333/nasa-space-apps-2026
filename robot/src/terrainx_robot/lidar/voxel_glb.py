"""Mapa de vóxeles → GLB (glTF 2.0 binario) que se ve COMO EL VISOR del dashboard.

Por qué existe
    El PLY lleva la misma geometría y los mismos colores, pero no puede decir «sin luz» ni
    llevar las aristas: cada programa lo ilumina a su manera y se ve distinto del visor. El
    GLB sí lo lleva:
      · Material SIN LUZ (KHR_materials_unlit): el color sale tal cual, como el
        MeshBasicMaterial del visor (static/lidar/LidarMapEngine.js).
      · Textura con la paleta de la app de Unitree y una ARISTA gris en el borde de cada
        cara: 1/32 del lado por cada borde y el gris 0x7a7a7a, lo mismo que pinta el shader
        del visor (EDGE_GLSL).
      · Las dos caras de cada cuadrado visibles (doubleSided), como el visor (DoubleSide).
    Lo abren Blender, el navegador (visores glTF), Windows y BabylonJS (la interfaz del
    equipo) sin plugins.

Geometría y color
    Exactamente los mismos cubos que el PLY (voxel_mesh.visible_faces): el vóxel k ocupa de
    (k − ½)·res a (k + ½)·res; color = franja kz + 9 de la paleta. Cuatro vértices por cara
    (cada uno con su coordenada de textura).

Ejes
    glTF tiene la Y hacia arriba; el robot, la Z. Se escribe (x, y, z) del robot como
    (x, z, −y) del glTF (giro de 90°, sin espejo): Blender y Babylon lo vuelven a poner
    de pie solos. Las coordenadas siguen en el marco del mapa (odom, metros ASUMIDOS).

Clase de evidencia
    La del mapa del que sale (el acumulado es DERIVADO). Va en asset.extras junto con las
    advertencias; esto solo cambia la forma de dibujarlo.

Diferencia que queda con el visor (honesta)
    El visor dibuja las aristas en píxeles de pantalla y las quita cuando la cara mide menos
    de unos píxeles; aquí van en la textura, así que de lejos la superficie se ve un poco
    más apagada (el visor de cada programa hace la media con los mipmaps).
"""

from __future__ import annotations

import json
import struct
import zlib
from dataclasses import dataclass
from typing import Any

import numpy as np

from .voxel_mesh import N_BANDS, PALETTE, visible_faces

EDGE_RGB = (0x7A, 0x7A, 0x7A)   # gris de las aristas del visor (EDGE_COLOR de LidarMapEngine.js)
TILE = 64                       # px de una cara en la textura
BORDER = TILE // 32             # arista: 1/32 del lado de la cara por cada borde (como el visor)
CELL = 128                      # celda del atlas: la cara en el centro rodeada de su color, para que
PAD = (CELL - TILE) // 2        # al alejarse (mipmaps) no se mezclen franjas ni domine el gris
COLS, ROWS = 8, 4               # 32 celdas ≥ 31 franjas → imagen de 1024 × 512
ATLAS_W, ATLAS_H = COLS * CELL, ROWS * CELL

# Constantes de glTF 2.0
_FLOAT, _UINT32 = 5126, 5125
_ARRAY_BUFFER, _ELEMENT_ARRAY_BUFFER = 34962, 34963
_NEAREST, _LINEAR_MIPMAP_LINEAR, _CLAMP = 9728, 9987, 33071
_GLB_MAGIC, _GLB_JSON, _GLB_BIN = b"glTF", 0x4E4F534A, 0x004E4942


@dataclass
class VoxelGlb:
    data: bytes            # el archivo .glb entero
    voxels: int            # vóxeles ocupados que representa
    cube_faces: int        # caras de cubo visibles (2 triángulos cada una)
    vertices: int
    triangles: int
    resolution: float      # lado del cubo (m)


def _png(rgb: np.ndarray) -> bytes:
    """PNG RGB de 8 bits sin dependencias (zlib)."""
    h, w, _ = rgb.shape
    rows = np.concatenate((np.zeros((h, 1), np.uint8), rgb.reshape(h, w * 3)), axis=1)   # filtro 0

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(rows.tobytes(), 9))
            + chunk(b"IEND", b""))


def atlas_rgb() -> np.ndarray:
    """Textura (ATLAS_H, ATLAS_W, 3): por franja, una celda de su color con la cara en el centro
    (TILE × TILE) enmarcada por la arista gris."""
    img = np.empty((ATLAS_H, ATLAS_W, 3), np.uint8)
    img[:] = EDGE_RGB
    for b in range(COLS * ROWS):
        color = PALETTE[min(b, N_BANDS - 1)]
        r, c = divmod(b, COLS)
        y, x = r * CELL, c * CELL
        img[y:y + CELL, x:x + CELL] = color
        t0, t1 = PAD, PAD + TILE
        img[y + t0:y + t1, x + t0:x + t1] = EDGE_RGB
        img[y + t0 + BORDER:y + t1 - BORDER, x + t0 + BORDER:x + t1 - BORDER] = color
    return img


def atlas_png() -> bytes:
    return _png(atlas_rgb())


def robot_to_gltf(xyz: np.ndarray) -> np.ndarray:
    """(x, y, z) del robot (Z arriba) → (x, z, −y) de glTF (Y arriba). Giro, sin espejo."""
    xyz = np.asarray(xyz)
    return np.column_stack((xyz[:, 0], xyz[:, 2], -xyz[:, 1]))


def build_voxel_glb(voxels: np.ndarray, resolution: float, *, name: str = "terrainx_mapa_slam",
                    extras: dict[str, Any] | None = None) -> VoxelGlb:
    """voxels: (N, 3) índices enteros del mundo; resolution en m. ValueError si no hay vóxeles."""
    res = float(resolution)
    if not np.isfinite(res) or res <= 0:
        raise ValueError(f"resolución no válida: {resolution!r}")
    corners, bands, n_voxels = visible_faces(voxels)
    n_faces = int(corners.shape[0])
    if n_faces == 0:
        raise ValueError("no hay vóxeles: no se genera un GLB vacío")
    if n_faces * 4 >= 2 ** 32:
        raise ValueError("demasiadas caras para índices de 32 bits")

    # Posiciones: esquina c → (c − ½)·res en el marco del robot, luego a ejes de glTF
    pos = robot_to_gltf((corners.reshape(-1, 3).astype(np.float64) - 0.5) * res).astype(np.float32)
    # Textura: las 4 esquinas de la cara (en su orden) → las 4 esquinas de la casilla de su franja
    r, c = np.divmod(bands, COLS)
    x0 = (c * CELL + PAD).astype(np.float64)
    y0 = (r * CELL + PAD).astype(np.float64)
    quad = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], np.float64) * TILE
    u = (x0[:, None] + quad[None, :, 0]) / ATLAS_W
    v = (y0[:, None] + quad[None, :, 1]) / ATLAS_H
    uv = np.stack((u, v), axis=-1).reshape(-1, 2).astype(np.float32)
    # Dos triángulos por cara, antihorarios vistos desde fuera (el giro de ejes no los invierte)
    base = (np.arange(n_faces, dtype=np.uint32) * 4)[:, None]
    tri = (base + np.array([0, 1, 2, 0, 2, 3], np.uint32)[None, :]).reshape(-1)
    png = atlas_png()

    # Un único búfer binario, cada vista alineada a 4 bytes
    blobs = [pos.tobytes(), uv.tobytes(), tri.tobytes(), png]
    views, body, offset = [], bytearray(), 0
    for i, blob in enumerate(blobs):
        view = {"buffer": 0, "byteOffset": offset, "byteLength": len(blob)}
        if i < 2:
            view["target"] = _ARRAY_BUFFER
        elif i == 2:
            view["target"] = _ELEMENT_ARRAY_BUFFER
        views.append(view)
        body += blob
        body += b"\0" * (-len(blob) % 4)
        offset = len(body)

    meta = {"voxels": n_voxels, "cube_faces": n_faces, "cube_size_m": res,
            "axes": "glTF Y arriba: (x, y, z) del marco del robot → (x, z, −y)",
            "unit": "m (asumido, sin verificar)",
            "colors": "paleta de altura de la app de Unitree (franja = kz + 9); aristas grises como el visor"}
    meta.update(extras or {})
    gltf = {
        "asset": {"version": "2.0", "generator": "terrainx_robot.lidar.voxel_glb", "extras": meta},
        "extensionsUsed": ["KHR_materials_unlit"],
        "scene": 0,
        "scenes": [{"name": name, "nodes": [0]}],
        "nodes": [{"name": name, "mesh": 0}],
        "meshes": [{"name": "voxeles", "primitives": [{
            "attributes": {"POSITION": 0, "TEXCOORD_0": 1}, "indices": 2, "material": 0, "mode": 4}]}],
        "materials": [{
            "name": "paleta_app_unitree_sin_luz",
            "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0.0,
                                     "roughnessFactor": 1.0},
            "doubleSided": True,
            "extensions": {"KHR_materials_unlit": {}},
        }],
        "textures": [{"sampler": 0, "source": 0}],
        "samplers": [{"magFilter": _NEAREST, "minFilter": _LINEAR_MIPMAP_LINEAR,
                      "wrapS": _CLAMP, "wrapT": _CLAMP}],
        "images": [{"name": "paleta", "bufferView": 3, "mimeType": "image/png"}],
        "buffers": [{"byteLength": len(body)}],
        "bufferViews": views,
        "accessors": [
            {"bufferView": 0, "componentType": _FLOAT, "count": int(pos.shape[0]), "type": "VEC3",
             "min": pos.min(axis=0).tolist(), "max": pos.max(axis=0).tolist()},
            {"bufferView": 1, "componentType": _FLOAT, "count": int(uv.shape[0]), "type": "VEC2"},
            {"bufferView": 2, "componentType": _UINT32, "count": int(tri.shape[0]), "type": "SCALAR"},
        ],
    }
    js = json.dumps(gltf, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    js += b" " * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(body)
    data = (_GLB_MAGIC + struct.pack("<II", 2, total)
            + struct.pack("<II", len(js), _GLB_JSON) + js
            + struct.pack("<II", len(body), _GLB_BIN) + bytes(body))
    return VoxelGlb(data, n_voxels, n_faces, int(pos.shape[0]), int(tri.shape[0] // 3), res)
