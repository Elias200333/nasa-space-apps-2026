"""Mapa SLAM 3D ACUMULADO (dashboard → LiDAR 3D → «Acumulado»).

Origen
    Portado de ``slam_service.py`` del visor LiDAR «Bridge» aportado al equipo
    (2026-11-14). La lógica de acumulación es la misma; los cambios son:
    nombre de la clase, validación del tamaño de la rejilla y ``frames_since``
    (para servir a varios visores sin colas).

Qué hace
    El Go2 manda su mapa de vóxeles de los ~6 m que le rodean (128 × 128 × ~35 capas
    de 5 cm, en el marco ``odom`` de la odometría del LiDAR: el mismo que la pose
    del robot) y OLVIDA lo que deja atrás. Aquí se junta en un mapa del mundo por
    TROZOS de 128 × 128 vóxeles (6,4 m) y 64 capas (3,2 m). Cada vóxel cuenta en
    cuántos mapas del perro ha salido y cada columna, cuántos mapas la cubrían.
    Se pinta lo que ha salido en al menos MIN_HITS mapas y en al menos KEEP_RATIO
    de los que lo cubrían: una persona que pasa (o un vóxel de ruido) sale en pocos
    de los mapas que cubren su sitio y desaparece; las paredes salen en casi todos.

    A los visores va cada trozo con el formato de la rejilla de bits del propio
    perro (lz4): el navegador lo dibuja con el mismo código que el mapa en vivo.

Clase de evidencia
    DERIVADO de datos medidos por el robot (no es una medida directa).

Límites (honestos)
    No cierra bucles (no es un SLAM con optimización del grafo): si la odometría
    deriva, al volver a un sitio las paredes pueden salir desplazadas. Si el perro
    se reinicia, su marco vuelve a empezar y el mapa viejo ya no cuadra: «Borrar»
    empieza otro. Vive en memoria: no se guarda al cerrar el dashboard.
    Unidades: metros ASUMIDOS (ver voxel_codec), pendiente de verificación física.
"""
from __future__ import annotations

import json
import struct
import threading
import uuid

import lz4.block
import numpy as np

CHUNK = 128          # vóxeles por lado (x, y) de un trozo: como la ventana del perro
LAYERS = 64          # capas por trozo (3,2 m)
Z_BASE = 16          # el trozo cz = 0 empieza 16 capas (0,8 m) por debajo de z = 0
MIN_HITS = 2         # mapas en los que tiene que salir un vóxel para pintarlo…
KEEP_RATIO = 0.12    # …y parte de los mapas que cubrían su sitio
HALVE_AT = 250       # las cuentas son de 0 a 255: al llegar, mitad (pesa más lo reciente)
MAGIC = b"LVX1"      # el mismo marco que el mapa en vivo (live_stream.pack_raw_frame)
LAYER_BYTES = CHUNK * CHUNK // 8   # 2048 bytes por capa de la rejilla de bits


def _drop_alone(vis: np.ndarray) -> np.ndarray:
    """Fuera los vóxeles sin ningún vecino (ruido del sensor). En el borde del trozo los
    vecinos pueden estar en el de al lado: ahí no se quita nada."""
    nb = np.zeros_like(vis)
    nb[1:] |= vis[:-1]
    nb[:-1] |= vis[1:]
    nb[:, 1:] |= vis[:, :-1]
    nb[:, :-1] |= vis[:, 1:]
    nb[:, :, 1:] |= vis[:, :, :-1]
    nb[:, :, :-1] |= vis[:, :, 1:]
    nb[[0, -1]] = True
    nb[:, [0, -1]] = True
    nb[:, :, [0, -1]] = True
    return vis & nb


class SlamMap:
    def __init__(self):
        self._lock = threading.Lock()
        self.reset()

    def reset(self):
        with self._lock:
            self._hits: dict[tuple, np.ndarray] = {}    # (cx, cy, cz) → uint8 [capa, y, x]
            self._seen: dict[tuple, np.ndarray] = {}    # (cx, cy) → uint8 [y, x]
            self._zkeys: dict[tuple, set] = {}          # (cx, cy) → sus cz
            self._dirty: set = set()                    # trozos que hay que volver a mandar
            # trozo → (bytes enviados, vóxeles, columnas, nº de envío)
            self._sent: dict[tuple, tuple] = {}
            self._send_seq = 0
            self.res: float | None = None
            self.epoch = uuid.uuid4().hex[:8]           # cambia al borrar: los visores tiran lo viejo
            self.version = 0
            self.frames = 0

    # ── Entrada: un mapa de vóxeles del perro ──
    def update_raw(self, raw: bytes, src_size: int, origin, resolution: float):
        """Desde un hilo de trabajo (descomprimir y sumar cuesta unos ms)."""
        size = int(src_size)
        if size <= 0 or size % LAYER_BYTES:
            raise ValueError(f"src_size {size} no es un múltiplo de {LAYER_BYTES} (rejilla 128 × 128)")
        buf = np.frombuffer(lz4.block.decompress(raw, uncompressed_size=size), np.uint8)
        occ = np.unpackbits(buf).reshape(-1, CHUNK, CHUNK)       # [z, y, x]: mismo orden de bits
        self.update(occ, origin, resolution)

    def update(self, occ: np.ndarray, origin, resolution: float):
        """occ: uint8 0/1 [capa, y, x] de la ventana del perro; origin = su esquina (m)."""
        res = float(resolution)
        if self.res is not None and abs(res - self.res) > 1e-6:
            return                                           # otro tamaño de vóxel: no se mezcla
        # Índice del mundo del vóxel (0, 0, 0) de la ventana: el origen es la esquina y los
        # centros caen en múltiplos de res (aritmética entera)
        gx0, gy0, gz0 = (int(v) for v in np.round(np.asarray(origin, float)[:3] / res + 0.5))
        L, H, W = occ.shape
        with self._lock:
            self.res = res
            # (// redondea hacia abajo también con negativos: trozo −1 = índices −128…−1)
            for cy in range(gy0 // CHUNK, (gy0 + H - 1) // CHUNK + 1):
                y0, y1 = max(gy0, cy * CHUNK), min(gy0 + H, (cy + 1) * CHUNK)
                wy, ky = slice(y0 - gy0, y1 - gy0), slice(y0 - cy * CHUNK, y1 - cy * CHUNK)
                for cx in range(gx0 // CHUNK, (gx0 + W - 1) // CHUNK + 1):
                    x0, x1 = max(gx0, cx * CHUNK), min(gx0 + W, (cx + 1) * CHUNK)
                    wx, kx = slice(x0 - gx0, x1 - gx0), slice(x0 - cx * CHUNK, x1 - cx * CHUNK)
                    col = (cx, cy)
                    seen = self._seen.setdefault(col, np.zeros((CHUNK, CHUNK), np.uint8))
                    seen[ky, kx] += 1
                    zs = self._zkeys.setdefault(col, set())
                    for cz in range((gz0 + Z_BASE) // LAYERS, (gz0 + L - 1 + Z_BASE) // LAYERS + 1):
                        base = cz * LAYERS - Z_BASE                   # capa del mundo de su capa 0
                        z0, z1 = max(gz0, base), min(gz0 + L, base + LAYERS)
                        part = occ[z0 - gz0:z1 - gz0, wy, wx]
                        if cz not in zs:
                            if not part.any():
                                continue
                            zs.add(cz)
                            self._hits[(cx, cy, cz)] = np.zeros((LAYERS, CHUNK, CHUNK), np.uint8)
                        self._hits[(cx, cy, cz)][z0 - base:z1 - base, ky, kx] += part
                    full = seen >= HALVE_AT
                    if full.any():
                        seen[full] //= 2
                        for cz in zs:
                            h = self._hits[(cx, cy, cz)]
                            h[:, full] //= 2
                    self._dirty.update((cx, cy, cz) for cz in zs)   # cambian las cuentas de la columna
            self.version += 1
            self.frames += 1

    # ── Salida: los trozos para los visores ──
    def changed_frames(self) -> list[bytes]:
        """Reempaqueta los trozos que han cambiado desde la última vez y devuelve los que
        son distintos de lo ya enviado (también los que se han quedado vacíos)."""
        with self._lock:
            keys, self._dirty = self._dirty, set()
            out = []
            for key in keys:
                blob, n, cols = self._pack(key)
                if key in self._sent and self._sent[key][0] == blob:
                    continue
                self._send_seq += 1
                self._sent[key] = (blob, n, cols, self._send_seq)
                out.append(blob)
            return out

    def all_frames(self) -> list[bytes]:
        """Todo el mapa tal como se empaquetó la última vez (para un visor que lo acaba de
        abrir); lo que haya cambiado desde entonces le llega con los demás."""
        with self._lock:
            return [blob for blob, n, _, _ in self._sent.values() if n]

    def frames_since(self, seq: int) -> tuple[list[bytes], int]:
        """Trozos empaquetados después del envío nº ``seq`` y el nº del último.
        ``seq = 0``: el mapa entero (sin los trozos vacíos). Cada visor guarda su ``seq``:
        así varios visores se sirven del mismo mapa sin colas."""
        with self._lock:
            if seq <= 0:
                blobs = [blob for blob, n, _, _ in self._sent.values() if n]
            else:
                blobs = [blob for blob, _, _, s in self._sent.values() if s > seq]
            return blobs, self._send_seq

    def _pack(self, key):
        cx, cy, cz = key
        hits, seen = self._hits[key], self._seen[(cx, cy)]
        vis = (hits >= MIN_HITS) & (hits >= KEEP_RATIO * seen[None])
        vis = _drop_alone(vis)
        n = int(vis.sum())
        cols = int(vis.any(axis=0).sum())
        raw = np.packbits(vis, axis=2).tobytes() if n else b""     # byte = 8 vóxeles en x, MSB primero
        res = self.res
        head = json.dumps({
            "type": "SLAM_CHUNK", "epoch": self.epoch, "key": f"{cx},{cy},{cz}",
            # esquina del trozo: el vóxel del mundo k va de (k − ½)·res a (k + ½)·res
            "origin": [round((cx * CHUNK - 0.5) * res, 4), round((cy * CHUNK - 0.5) * res, 4),
                       round((cz * LAYERS - Z_BASE - 0.5) * res, 4)],
            "resolution": res, "src_size": len(raw), "voxels": n,
        }, separators=(",", ":")).encode()
        body = lz4.block.compress(raw, store_size=False) if n else b""
        return MAGIC + struct.pack("<I", len(head)) + head + body, n, cols

    def meta(self) -> dict:
        with self._lock:
            voxels = sum(n for _, n, _, _ in self._sent.values())
            cols = sum(c for _, _, c, _ in self._sent.values())
            res = self.res or 0.05
            return {"epoch": self.epoch, "version": self.version, "frames": self.frames,
                    "voxels": voxels, "chunks": sum(1 for _, n, _, _ in self._sent.values() if n),
                    "area": round(cols * res * res, 1)}
