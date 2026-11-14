"""Servicio del dashboard: UNA sola conexión compartida al Go2.

Qué hace
    Mantiene como mucho una conexión WebRTC (vía Go2WebRTCAdapter) y la comparte
    entre todos los paneles (cámara, LiDAR, telemetría, replay, diagnóstico).
    Expone operaciones de alto nivel para la capa FastAPI. Es asíncrono y vive en
    el mismo bucle de eventos que el servidor.

Seguridad
    - El guardián arranca en SOLO LECTURA. El control WASD está activo por defecto con el
      robot conectado (decisión del operador, 2026-11-14): la primera orden de conducción o
      de postura pasa el guardián a modo control (subconjunto ACOTADO: sin saltos ni
      volteretas, velocidades recortadas). Al cerrar el canal de control o desconectar se
      envía StopMove y se vuelve a solo lectura. El hombre muerto vive en server.py.
    - La clave AES nunca se expone: el estado solo dice si está configurada.
    - Un único punto de conexión: no se abren conexiones paralelas al robot.
    - El mapa SLAM acumulado solo LEE los mapas que ya llegan: no envía nada al robot.
      Desde el visor: papelera = mapa nuevo, pausa = deja de sumar mapas (lo que se ve es lo
      que se guarda), descarga = se guarda (PLY malla + GLB igual que el visor + coordenadas
      JSON + metadatos + SHA-256, clase DERIVED) y se baja el GLB o las coordenadas. Si el mapa
      no ha cambiado desde el último guardado, se reutiliza ese escaneo (sin duplicados).
    - «● Grabar sesión» (panel Replay) graba la sesión cruda del robot para el replay.
    - Modo REPLAY (demo sin robot): reproduce una sesión grabada por el mismo camino
      que el robot real. Es excluyente con la conexión en vivo y NO admite control.
      La clase de evidencia la fija la sesión (una sesión sintética sigue siendo
      synthetic_test); todo lo que sale lleva delivery_mode = replay.
"""

from __future__ import annotations

import asyncio
import logging
import re
import threading
import time
from typing import Any

import numpy as np

from ..adapters.base import CaptureError, ConnectionFailed
from ..adapters.go2_topics import DEFAULT_READONLY_TOPICS
from ..adapters.go2_webrtc import MAX_VX_MS, MAX_VY_MS, MAX_YAW_RPS, Go2WebRTCAdapter
from ..adapters.replay import ReplayAdapter
from ..auth.aes_key_manager import DEFAULT_STORE, AesKeyManager
from ..config import Settings
from ..lidar.accumulator import AccumulatedCloud
from ..lidar.live_stream import raw_frame_fields
from ..lidar.slam_map import KEEP_RATIO, MIN_HITS, SlamMap
from ..lidar.voxel_coords import COORDS_FORMAT, build_coords_json
from ..lidar.voxel_glb import build_voxel_glb
from ..lidar.voxel_mesh import build_voxel_mesh
from ..models import (
    CaptureState,
    ConnectionState,
    DeliveryMode,
    EvidenceClass,
    PointType,
    ScanContext,
    ScanMetadata,
    SessionInfo,
)
from ..storage.scan_store import ScanStore, ScanStoreError
from ..util import new_id, utc_now
from . import robot_details

log = logging.getLogger(__name__)

LIVE_LIDAR_MAX_POINTS = 25_000  # tope para el visor en vivo (submuestreo)
SLAM_INTERVAL_S = 0.5           # como mucho 2 mapas/s se suman al mapa acumulado
SLAM_PACK_INTERVAL_S = 1.0      # como mucho 1 vez/s se reempaquetan los trozos cambiados
REPLAY_SPEED = 1.0              # replay a tiempo real (como se grabó)
_SESSION_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.\-]{0,127}$")   # sin rutas: solo un nombre
GLB_FORMAT = ("glTF 2.0 binario (GLB) · malla de cubos como el visor: paleta de la app, aristas grises, "
              "sin luz (KHR_materials_unlit), Y arriba = Z del robot")


class DashboardService:
    def __init__(self, settings: Settings, *, adapter_factory=None) -> None:
        self.settings = settings
        self.store = ScanStore(settings.data_dir)
        self.key_manager = AesKeyManager(
            settings.go2.aes_key_file or str(DEFAULT_STORE),
            region=settings.go2.region,
            device_type="Go2",
        )
        # adapter_factory() -> Go2WebRTCAdapter: punto de inyección para pruebas.
        self._adapter_factory = adapter_factory or (
            lambda: Go2WebRTCAdapter(self.settings, self.store, enable_video=True)
        )
        self._adapter: Go2WebRTCAdapter | ReplayAdapter | None = None
        self.last_error: str | None = None
        # Mapa SLAM acumulado (DERIVADO). Sobrevive a reconexiones con el MISMO origen (el
        # marco odom del perro sigue siendo el mismo mientras no se reinicie); al cambiar de
        # origen (robot ↔ sesión grabada) se empieza otro: sus marcos no tienen nada que ver.
        self.slam = SlamMap()
        self.slam_errors = 0
        self.slam_paused = False          # «Congelar» del visor: no se suman mapas nuevos
        self._slam_thread: threading.Thread | None = None
        self._slam_stop = threading.Event()
        self._slam_last_pack = 0.0
        self._slam_source: str | None = None
        self._slam_evidence = EvidenceClass.DERIVED
        self._slam_adapter: Go2WebRTCAdapter | ReplayAdapter | None = None   # de dónde sale el mapa
        self._saving = False
        self._last_save: tuple | None = None   # (origen, epoch, versión del mapa, scan_id) del último guardado
        # Modo replay
        self._replay_task: asyncio.Task | None = None
        self.replay_info: dict[str, Any] | None = None

    # --------------------------------------------------------------- conexión
    @property
    def adapter(self) -> Go2WebRTCAdapter | ReplayAdapter | None:
        return self._adapter

    @property
    def replaying(self) -> bool:
        return isinstance(self._adapter, ReplayAdapter)

    @property
    def connected(self) -> bool:
        return (
            self._adapter is not None
            and self._adapter.connection_state
            in (ConnectionState.READY_READONLY, ConnectionState.DEGRADED)
        )

    def _live_adapter(self) -> Go2WebRTCAdapter | None:
        """El adaptador del robot físico, o None (desconectado o en replay)."""
        return self._adapter if isinstance(self._adapter, Go2WebRTCAdapter) else None

    async def connect(self) -> dict[str, Any]:
        if self.replaying:
            raise ConnectionFailed("replay_active", "Hay un replay en marcha.",
                                   "Pulsa «Parar replay» antes de conectar el robot.")
        if self.connected:
            return self.status()
        self.last_error = None
        adapter = self._adapter_factory()
        try:
            await adapter.connect()
        except ConnectionFailed as exc:
            self.last_error = f"[{exc.code}] {exc}"
            self._adapter = None
            raise
        self._adapter = adapter
        self._use_slam_source(f"live:{self.settings.go2.ip or self.settings.go2.serial}",
                              EvidenceClass.DERIVED, adapter)
        self._start_slam()
        return self.status()

    async def disconnect(self) -> dict[str, Any]:
        # Parar y volver a solo lectura ANTES de cerrar. El mapa acumulado no se pierde: sigue
        # en memoria y se puede guardar (descarga del visor) aún sin conexión. Una sesión que
        # se estuviera grabando la cierra el adaptador al desconectar.
        self.release_control()
        self._stop_slam()
        task, self._replay_task = self._replay_task, None
        if task is not None:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        self.replay_info = None
        if self._adapter is not None:
            try:
                await self._adapter.disconnect()
            finally:
                self._adapter = None
        return self.status()

    def _use_slam_source(self, key: str, evidence: EvidenceClass, adapter) -> None:
        if key != self._slam_source:
            self.slam.reset()
            self.slam_errors = 0
            self.slam_paused = False
        self._slam_source = key
        self._slam_evidence = evidence
        self._slam_adapter = adapter

    # ----------------------------------------------------------------- replay
    def list_sessions(self) -> list[dict[str, Any]]:
        """Sesiones grabadas en <data_dir>/sessions (las más nuevas primero)."""
        root = self.store.data_dir / "sessions"
        out = []
        if not root.is_dir():
            return out
        for folder in root.iterdir():
            meta = folder / "session.json"
            if not meta.is_file():
                continue
            try:
                info = SessionInfo.model_validate_json(meta.read_text(encoding="utf-8"))
            except Exception:
                continue                       # sesión a medias o corrupta: no se ofrece
            if info.messages_sha256 is None:
                continue                       # sin cerrar (sin hash): no se puede verificar
            msgs = folder / info.messages_file
            duration = (info.closed_utc - info.created_utc).total_seconds() if info.closed_utc else None
            out.append({
                "session_id": info.session_id,
                "created_utc": info.created_utc.isoformat(),
                "duration_s": round(duration, 1) if duration is not None else None,
                "evidence_class": info.evidence_class.value,
                "demo": info.demo,
                "scan_context": info.scan_context.value,
                "robot_id": info.robot.robot_id,
                "model_variant": info.robot.model_variant,
                "records": info.record_count,
                "lidar_records": info.lidar_records,
                "size_mb": round(msgs.stat().st_size / 1e6, 1) if msgs.is_file() else None,
                "notes": info.notes,
            })
        return sorted(out, key=lambda s: s["created_utc"], reverse=True)

    async def start_replay(self, session_id: str, *, loop: bool = True) -> dict[str, Any]:
        if self._live_adapter() is not None:
            raise ConnectionFailed("robot_connected", "El robot está conectado.",
                                   "Desconecta el robot antes de reproducir una sesión grabada.")
        if not isinstance(session_id, str) or not _SESSION_ID.match(session_id):
            raise ConnectionFailed("invalid_session", f"identificador de sesión no válido: {session_id!r}")
        folder = self.store.data_dir / "sessions" / session_id
        if not (folder / "session.json").is_file():
            raise ConnectionFailed("invalid_session", f"no existe la sesión {session_id}")
        if self.replaying:
            await self.disconnect()
        adapter = ReplayAdapter(folder, self.store, speed=REPLAY_SPEED)
        await adapter.connect()             # verifica el SHA-256 de la sesión antes de reproducir
        info = adapter._reader.info if adapter._reader else None
        adapter.connection_info = {"method": "replay", "address": f"sesión {session_id}",
                                   "session_id": session_id, "library_version": None}
        self._adapter = adapter
        self.last_error = None
        self.replay_info = {
            "session_id": session_id,
            "evidence_class": adapter.evidence_class.value,
            "demo": bool(info.demo) if info else None,
            "loop": loop,
            "passes": 0,
        }
        derived = (EvidenceClass.SYNTHETIC_TEST if adapter.evidence_class is EvidenceClass.SYNTHETIC_TEST
                   else EvidenceClass.DERIVED)
        self._use_slam_source(f"replay:{session_id}", derived, adapter)
        self._replay_task = asyncio.create_task(self._replay_loop(adapter))
        self._start_slam()
        return self.status()

    async def _replay_loop(self, adapter: ReplayAdapter) -> None:
        """Reproduce la sesión a tiempo real; con «loop», vuelve a empezar al acabar."""
        try:
            while self._adapter is adapter:
                await adapter._run_window(None)          # una pasada completa
                if self.replay_info is None:
                    return
                self.replay_info["passes"] += 1
                if not self.replay_info.get("loop"):
                    return
                await asyncio.sleep(0.5)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # sesión que falla a mitad: se informa, no se cae el servidor
            self.last_error = f"[replay] {type(exc).__name__}: {exc}"
            log.exception("Replay detenido por un error")

    # ----------------------------------------------------------------- estado
    def status(self) -> dict[str, Any]:
        key = self.key_manager.status()
        base: dict[str, Any] = {
            "connected": self.connected,
            "connection_state": ConnectionState.DISCONNECTED.value,
            "capture_state": CaptureState.IDLE.value,
            # WASD activo por defecto: se puede conducir con el robot real conectado
            "control_available": self.connected and self._live_adapter() is not None,
            "control_enabled": False,
            "recording": self.recording_status(),
            "last_error": self.last_error,
            "model_variant": self.settings.model_variant,
            "firmware_version": self.settings.firmware_version,
            "method": self.settings.go2.method,
            "ip": self.settings.go2.ip,
            "region": self.settings.go2.region,
            "aes_key_configured": bool(key.get("configured")),
            "aes_key_fingerprint": key.get("fingerprint"),
            "library_version": None,
            "video": {"has_frame": False, "fps": None, "frames": 0},
            "scan_count": len(self.store.list()),
            "speed_limits": {"vx_ms": MAX_VX_MS, "vy_ms": MAX_VY_MS, "yaw_rps": MAX_YAW_RPS},
        }
        adapter = self._adapter
        if adapter is not None:
            st = adapter.get_status()
            info = getattr(adapter, "connection_info", {}) or {}
            video = getattr(adapter, "video_stats", None)
            base.update(
                connection_state=st.connection_state.value,
                capture_state=st.capture_state.value,
                last_error=st.last_error or self.last_error,
                control_enabled=bool(getattr(adapter, "control_enabled", False)) and self.connected,
                library_version=info.get("library_version"),
                video=video() if video else base["video"],
                lidar_frames=st.lidar_frames_received,
                lidar_decode_errors=adapter.lidar_decode_errors,
                readonly_guard=st.readonly_guard,
                telemetry=st.telemetry.model_dump(mode="json"),
                topics=[t.model_dump(mode="json") for t in st.topics],
                connection_info=info,
                robot_details=robot_details.details(
                    adapter, () if self.replaying else DEFAULT_READONLY_TOPICS),
            )
        base["source"] = (
            dict(self.replay_info, kind="replay") if self.replaying and self.replay_info
            else {"kind": "live" if self._live_adapter() is not None else "none"}
        )
        base["slam"] = dict(self.slam.meta(), errors=self.slam_errors, paused=self.slam_paused,
                            saving=self._saving, evidence_class=self._slam_evidence.value)
        return base

    # ------------------------------------------------------------------- vídeo
    def latest_jpeg(self) -> bytes | None:
        video = getattr(self._adapter, "video", None)
        return video.latest() if video is not None else None

    # ------------------------------------------------------------------ lidar
    def live_lidar(self) -> dict[str, Any]:
        if self._adapter is None or self._adapter.last_points is None:
            return {"available": False, "point_count": 0, "points": []}
        pts = np.asarray(self._adapter.last_points, dtype=np.float32)
        total = int(pts.shape[0])
        if total > LIVE_LIDAR_MAX_POINTS:
            idx = np.linspace(0, total - 1, LIVE_LIDAR_MAX_POINTS).astype(np.int64)
            pts = pts[idx]
        info = self._adapter.last_lidar_frame_info
        return {
            "available": True,
            "point_count": total,
            "shown": int(pts.shape[0]),
            "point_type": info.point_type.value if info else "unknown",
            "frame_id": info.frame_id if info else None,
            "resolution": info.resolution if info else None,
            "units": "ASUMIDO metros (sin verificar)",
            "evidence_class": "robot_measured",
            "points": pts.reshape(-1).tolist(),  # x0,y0,z0,x1,y1,z1,...
        }

    # ------------------------------------------------------- mapa SLAM acumulado
    def slam_step(self, meta: dict, raw: bytes, *, pack: bool = True) -> bool:
        """Suma un mapa del perro al acumulado (y, si ``pack``, reempaqueta lo cambiado)."""
        fields = raw_frame_fields(meta)
        if fields is None:
            self.slam_errors += 1
            return False
        origin, resolution, src_size = fields
        try:
            self.slam.update_raw(raw, src_size, origin, resolution)
            if isinstance(meta.get("frame_id"), str):
                self.slam.frame_id = meta["frame_id"]
            if pack:
                self.slam.changed_frames()
        except Exception as exc:  # un mapa raro no debe parar la acumulación
            self.slam_errors += 1
            log.warning("Mapa SLAM: mapa del robot descartado (%s)", exc)
            return False
        return True

    def slam_reset(self) -> None:
        self.slam.reset()

    def set_slam_paused(self, paused: bool) -> None:
        """«Congelar el mapa» del visor: mientras está en pausa no se suma ningún mapa nuevo, así
        lo que se guarda es lo que se ve. Al robot no se le envía nada."""
        paused = bool(paused)
        if paused != self.slam_paused:
            log.info("Mapa SLAM %s", "en pausa" if paused else "reanudado")
        self.slam_paused = paused

    async def save_slam_map(self) -> dict[str, Any]:
        """Botón de descarga del visor: guarda el mapa acumulado tal como se ve (PLY malla + GLB
        igual que el visor + coordenadas JSON + metadatos + SHA-256) y devuelve sus metadatos
        más ``reused``; el navegador baja luego el GLB o las coordenadas. Si el mapa no ha
        cambiado desde el último guardado (p. ej. en pausa) y ese escaneo sigue íntegro, se
        devuelve ese (reused = True): bajar los dos archivos no crea dos escaneos. Funciona
        también desconectado (el mapa sigue en memoria). Lo pesado va en otro hilo: en este bucle
        vive la conexión WebRTC (con Pluffy, bloquearlo 8–14 s hizo que el perro cortara; ver
        base.stop_capture)."""
        if self._saving:
            raise CaptureError("ya se está guardando el mapa: espera a que termine")
        adapter, evidence, source = self._slam_adapter, self._slam_evidence, self._slam_source
        if adapter is None:
            raise ScanStoreError("el mapa acumulado está vacío: conecta el robot y deja que vea algo")
        self._saving = True
        try:
            t0 = time.monotonic()
            same = await asyncio.to_thread(self._unchanged_since_last_save, source)
            if same is not None:
                log.info("Mapa SLAM sin cambios desde %s: se reutiliza ese escaneo", same.id)
                return dict(same.model_dump(mode="json"), reused=True)
            snap = await asyncio.to_thread(self.slam.snapshot)
            if not len(snap["voxels"]) or snap["res"] is None:
                raise ScanStoreError("el mapa acumulado está vacío: deja que el perro vea algo antes de guardar")
            meta, faces = await asyncio.to_thread(
                self._save_slam_map, snap, adapter=adapter, evidence=evidence, source=source)
            self._last_save = (source, snap["meta"]["epoch"], snap["meta"]["version"], meta.id)
        finally:
            self._saving = False
        log.info("Mapa SLAM guardado: %s (%d vóxeles, %d caras; PLY + GLB + coordenadas en %.2f s fuera "
                 "del bucle de la conexión)", meta.id, len(snap["voxels"]), faces, time.monotonic() - t0)
        return dict(meta.model_dump(mode="json"), reused=False)

    def _unchanged_since_last_save(self, source: str | None) -> ScanMetadata | None:
        """Hilo aparte. El último escaneo guardado, si desde entonces no se ha sumado ni borrado
        nada (misma fuente, mismo epoch y misma versión del mapa) y sus archivos siguen íntegros
        (SHA-256); si no, None y se guarda otro."""
        last = self._last_save
        if last is None:
            return None
        now = self.slam.meta()
        if last[:3] != (source, now["epoch"], now["version"]):
            return None
        try:
            if self.store.verify(last[3])["ok"]:
                return self.store.load_metadata(last[3])
        except ScanStoreError:
            pass
        return None

    def _save_slam_map(self, snap: dict, *, adapter, evidence: EvidenceClass,
                       source: str | None) -> tuple[ScanMetadata, int]:
        """Hilo aparte. Clase de evidencia: DERIVED si sale de datos del robot; SYNTHETIC_TEST
        si sale de una sesión sintética (un cálculo sobre datos de prueba sigue siendo de prueba)."""
        idx, res, slam_meta = snap["voxels"], snap["res"], snap["meta"]
        mesh = build_voxel_mesh(idx, res)
        delivery = adapter.descriptor.delivery_mode
        now = utc_now()
        capture_start = snap["first_utc"] or now
        scan_id = new_id("scan", capture_start)           # va también dentro del GLB y del JSON
        common = {"evidence_class": evidence.value, "delivery_mode": delivery.value,
                  "demo": evidence is EvidenceClass.SYNTHETIC_TEST,
                  "frame_id": snap["frame_id"] or "unknown_robot_frame"}
        glb = build_voxel_glb(idx, res, extras={
            "scan_id": scan_id, **common, "source": source,
            "nota": "mapa SLAM acumulado (DERIVADO); metadatos completos en el .metadata.json"})
        coords = build_coords_json(idx, res, info={
            "scan_id": scan_id,
            "content": "mapa SLAM acumulado del dashboard (DERIVADO): un punto por cubo del visor",
            **common, "metadata": f"{scan_id}.metadata.json"})
        cloud = AccumulatedCloud(
            points=mesh.vertices, mode="accumulate", topic="rt/utlidar/voxel_map_compressed",
            frame_id=snap["frame_id"], resolution=mesh.resolution, point_type=PointType.VOXEL_MESH,
            decoder="terrainx_robot.lidar.slam_map (portado del Bridge) + lidar.voxel_mesh / voxel_glb",
            frames_received=slam_meta["frames"], frames_used=slam_meta["frames"], frames_rejected=self.slam_errors,
            rejection_reasons={"descartados": self.slam_errors} if self.slam_errors else {},
            first_info=None, last_info=None,
            validation={"rule": f"vóxel pintado si sale en ≥ {MIN_HITS} mapas y en ≥ {KEEP_RATIO:.0%} "
                                "de los mapas que cubrían su sitio; fuera los vóxeles sin vecinos"},
            deduplication={"rule": "rejilla de vóxeles del mundo: un cubo por vóxel; vértices "
                                   "compartidos entre caras del mismo color"},
            faces=mesh.triangles, colors=mesh.colors,
        )
        caveats = (
            "Mapa ACUMULADO (DERIVADO): unión filtrada de los mapas de vóxeles del robot hecha "
            "por el dashboard, no una medida directa.",
            "Sin cierre de bucles: si la odometría del perro derivó, al volver a un sitio las "
            "paredes pueden salir desplazadas o dobles.",
            "Colores = paleta de altura de la app de Unitree (como el visor); no son colores reales.",
            "El .glb es el mismo mapa con el aspecto del visor (aristas grises, sin luz) y los ejes de "
            "glTF: (x, y, z) del robot → (x, z, −y). El .ply y el .coords.json (centro de cada cubo, "
            "uno por vóxel) guardan las coordenadas del robot.",
            "Tiempos = primer y último mapa del robot sumados al acumulado (en replay, la hora de la "
            "reproducción, no la original).",
        )
        meta = self.store.save(
            cloud, robot=adapter.descriptor, evidence_class=evidence,
            delivery_mode=delivery, scan_context=adapter.scan_context,
            capture_start=capture_start, capture_end=snap["last_utc"] or now,
            session_id=adapter._source_session_id(), pose_source=None, binary=True, extra_caveats=caveats,
            extra_files={"glb": (".glb", glb.data, GLB_FORMAT),
                         "coords": (".coords.json", coords, COORDS_FORMAT)},
            scan_id=scan_id,
            extra_provenance={
                "slam": dict(slam_meta, source=source, min_hits=MIN_HITS, keep_ratio=KEEP_RATIO,
                             paused_when_saved=self.slam_paused),
                "mesh": {"voxels": mesh.voxels, "cube_faces": mesh.cube_faces,
                         "vertices": int(mesh.vertices.shape[0]),
                         "triangles": int(mesh.triangles.shape[0]),
                         "cube_size_m": mesh.resolution,
                         "colors": "paleta de altura de la app de Unitree (franja = kz + 9)"},
                "glb": {"vertices": glb.vertices, "triangles": glb.triangles, "cube_faces": glb.cube_faces,
                        "axes": "glTF Y arriba: (x, y, z) del robot → (x, z, −y)",
                        "material": "KHR_materials_unlit + textura con la paleta y aristas grises (1/32 de cara)"},
                "coords": {"points": mesh.voxels, "point": "centro de cada cubo (k · cube_size_m), uno por vóxel",
                           "order": "por x, luego y, luego z", "axes": "los del robot, como el .ply"},
            },
        )
        return meta, mesh.cube_faces

    def _start_slam(self) -> None:
        if self._slam_thread is not None and self._slam_thread.is_alive():
            return
        self._slam_stop = threading.Event()
        self._slam_thread = threading.Thread(
            target=self._slam_worker, args=(self._slam_stop,), name="terrainx-slam", daemon=True)
        self._slam_thread.start()

    def _stop_slam(self) -> None:
        self._slam_stop.set()
        thread, self._slam_thread = self._slam_thread, None
        if thread is not None and thread is not threading.current_thread():
            thread.join(timeout=2)

    def _slam_worker(self, stop: threading.Event) -> None:
        """Hilo aparte: lee el último mapa que llegó (sin colas) y lo suma."""
        last_seq = 0
        while not stop.wait(SLAM_INTERVAL_S):
            adapter = self._adapter
            now = time.monotonic()
            pack = now - self._slam_last_pack >= SLAM_PACK_INTERVAL_S
            if pack:
                self._slam_last_pack = now
            seq, frame = (adapter.lidar_raw_seq, adapter.last_lidar_raw) if adapter else (last_seq, None)
            if self.slam_paused:              # congelado: lo que llegue mientras tanto no se suma
                last_seq = seq
                frame = None
            if frame is None or seq == last_seq:
                if pack:  # lo que quedara sin empaquetar del último mapa
                    try:
                        self.slam.changed_frames()
                    except Exception as exc:
                        log.warning("Mapa SLAM: no se pudo empaquetar (%s)", exc)
                continue
            last_seq = seq
            self.slam_step(frame[0], frame[1], pack=pack)

    # ------------------------------------------------------- grabar sesión cruda
    def recording_status(self) -> dict[str, Any]:
        live = self._live_adapter()
        info = live.recording_info if live is not None else None
        if info is None:
            return {"active": False}
        return {"active": True, "session_id": info.session_id, "start_utc": info.created_utc.isoformat(),
                "elapsed_s": round((utc_now() - info.created_utc).total_seconds(), 1)}

    async def start_recording(self) -> dict[str, Any]:
        """«● Grabar sesión» (panel Replay): graba lo que manda el robot (mapas, pose, telemetría)
        para reproducirlo luego sin robot. No envía nada al robot ni toca el mapa acumulado."""
        if self.replaying:
            raise CaptureError("en replay no se graba: esa sesión ya está grabada")
        live = self._live_adapter()
        if live is None or not self.connected:
            raise ConnectionFailed("not_connected", "No hay conexión con el robot.")
        session_id = live.start_recording(notes="grabada desde el dashboard")   # CaptureError si ya graba
        log.info("Grabando la sesión cruda %s", session_id)
        return self.recording_status()

    async def stop_recording(self) -> dict[str, Any]:
        """Cierra la sesión que se está grabando (su SHA-256 se calcula en otro hilo)."""
        live = self._live_adapter()
        if live is None or live.recording_info is None:
            raise CaptureError("no se está grabando ninguna sesión")
        info = await live.stop_recording()
        return {"session_id": info.session_id, "records": info.record_count,
                "lidar_records": info.lidar_records}

    # ----------------------------------------------------------------- control
    # WASD activo por defecto: sin botón «Habilitar». Con el robot real conectado, la primera
    # orden pasa el guardián a modo control (acotado). En replay no hay robot que conducir.
    def _control_adapter(self) -> Go2WebRTCAdapter:
        if self.replaying:
            raise ConnectionFailed("replay_no_control", "En replay no hay robot que conducir.")
        live = self._live_adapter()
        if live is None or not self.connected:
            raise ConnectionFailed("not_connected", "No hay conexión con el robot.")
        if not live.control_enabled:
            live.enable_control()
        return live

    def release_control(self) -> None:
        """Detiene el robot y vuelve a solo lectura (al cerrar el canal de control o al
        desconectar). Seguro de llamar siempre."""
        live = self._live_adapter()
        if live is not None:
            live.disable_control()

    def drive(self, vx: float, vy: float, yaw: float) -> None:
        self._control_adapter().drive(vx, vy, yaw)

    def stop_move(self) -> None:
        live = self._live_adapter()
        if live is not None and live.control_enabled:
            live.stop_move()

    def posture(self, command: str) -> None:
        self._control_adapter().posture(command)
