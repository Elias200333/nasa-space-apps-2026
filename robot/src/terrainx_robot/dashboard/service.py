"""Servicio del dashboard: UNA sola conexión compartida al Go2.

Qué hace
    Mantiene como mucho una conexión WebRTC (vía Go2WebRTCAdapter) y la comparte
    entre todos los paneles (cámara, LiDAR, telemetría, capturas, diagnóstico).
    Expone operaciones de alto nivel para la capa FastAPI. Es asíncrono y vive en
    el mismo bucle de eventos que el servidor.

Seguridad
    - Arranca y permanece en SOLO LECTURA. El control (WASD) es un modo aparte
      que hay que habilitar explícitamente y que usa el guardián acotado.
    - La clave AES nunca se expone: el estado solo dice si está configurada.
    - Un único punto de conexión: no se abren conexiones paralelas al robot.
    - El mapa SLAM acumulado solo LEE los mapas que ya llegan: no envía nada al robot.
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

from ..adapters.base import ConnectionFailed
from ..adapters.go2_topics import DEFAULT_READONLY_TOPICS
from ..adapters.go2_webrtc import MAX_VX_MS, MAX_VY_MS, MAX_YAW_RPS, Go2WebRTCAdapter
from ..adapters.replay import ReplayAdapter
from ..auth.aes_key_manager import DEFAULT_STORE, AesKeyManager
from ..config import Settings
from ..lidar.accumulator import AccumulatedCloud
from ..lidar.live_stream import raw_frame_fields
from ..lidar.slam_map import KEEP_RATIO, MIN_HITS, SlamMap
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
from . import robot_details

log = logging.getLogger(__name__)

LIVE_LIDAR_MAX_POINTS = 25_000  # tope para el visor en vivo (submuestreo)
SLAM_INTERVAL_S = 0.5           # como mucho 2 mapas/s se suman al mapa acumulado
SLAM_PACK_INTERVAL_S = 1.0      # como mucho 1 vez/s se reempaquetan los trozos cambiados
REPLAY_SPEED = 1.0              # replay a tiempo real (como se grabó)
_SESSION_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.\-]{0,127}$")   # sin rutas: solo un nombre


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
        self.control_armed = False  # el operador confirmó el modo control
        self.last_error: str | None = None
        # Mapa SLAM acumulado (DERIVADO). Sobrevive a reconexiones con el MISMO origen (el
        # marco odom del perro sigue siendo el mismo mientras no se reinicie); al cambiar de
        # origen (robot ↔ sesión grabada) se empieza otro: sus marcos no tienen nada que ver.
        self.slam = SlamMap()
        self.slam_errors = 0
        self._slam_thread: threading.Thread | None = None
        self._slam_stop = threading.Event()
        self._slam_last_pack = 0.0
        self._slam_source: str | None = None
        self._slam_evidence = EvidenceClass.DERIVED
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
                              EvidenceClass.DERIVED)
        self._start_slam()
        return self.status()

    async def disconnect(self) -> dict[str, Any]:
        self.control_armed = False
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

    def _use_slam_source(self, key: str, evidence: EvidenceClass) -> None:
        if key != self._slam_source:
            self.slam.reset()
            self.slam_errors = 0
        self._slam_source = key
        self._slam_evidence = evidence

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
        self.control_armed = False
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
        self._use_slam_source(f"replay:{session_id}", derived)
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
        if self.control_armed and not self.connected:
            self.control_armed = False   # conexión perdida: el control no sigue «armado»
        key = self.key_manager.status()
        base: dict[str, Any] = {
            "connected": self.connected,
            "connection_state": ConnectionState.DISCONNECTED.value,
            "capture_state": CaptureState.IDLE.value,
            "control_armed": self.control_armed,
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
        base["slam"] = dict(self.slam.meta(), errors=self.slam_errors,
                            evidence_class=self._slam_evidence.value)
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

    def save_slam_scan(self) -> ScanMetadata:
        """Guarda el mapa acumulado como escaneo (PLY + metadatos + SHA-256).
        Clase de evidencia: DERIVED si sale de datos del robot; SYNTHETIC_TEST si sale de
        una sesión sintética (un cálculo sobre datos de prueba sigue siendo de prueba)."""
        adapter = self._adapter
        if adapter is None:
            raise ConnectionFailed("not_connected", "No hay robot ni replay activo: no hay de dónde guardar.")
        points = self.slam.export_points()
        meta = self.slam.meta()
        if points.shape[0] == 0:
            raise ScanStoreError("el mapa acumulado está vacío: deja que el perro vea algo antes de guardar")
        res = self.slam.res
        start = self.slam.first_utc
        end = self.slam.last_utc or start
        cloud = AccumulatedCloud(
            points=points, mode="accumulate", topic="rt/utlidar/voxel_map_compressed",
            frame_id=self.slam.frame_id, resolution=res, point_type=PointType.VOXEL_OCCUPANCY,
            decoder="terrainx_robot.lidar.slam_map (portado del Bridge)",
            frames_received=meta["frames"], frames_used=meta["frames"], frames_rejected=self.slam_errors,
            rejection_reasons={"descartados": self.slam_errors} if self.slam_errors else {},
            first_info=None, last_info=None,
            validation={"rule": f"vóxel pintado si sale en ≥ {MIN_HITS} mapas y en ≥ {KEEP_RATIO:.0%} "
                                "de los mapas que cubrían su sitio; fuera los vóxeles sin vecinos"},
            deduplication={"rule": "rejilla de vóxeles del mundo: un punto por vóxel"},
        )
        caveats = (
            "Mapa ACUMULADO (DERIVADO): unión filtrada de los mapas de vóxeles del robot hecha "
            "por el dashboard, no una medida directa.",
            "Sin cierre de bucles: si la odometría del perro derivó, al volver a un sitio las "
            "paredes pueden salir desplazadas o dobles.",
            "Tiempos = cuando el dashboard sumó los mapas (en replay, no la hora original).",
        )
        return self.store.save(
            cloud, robot=adapter.descriptor, evidence_class=self._slam_evidence,
            delivery_mode=adapter.descriptor.delivery_mode, scan_context=adapter.scan_context,
            capture_start=start, capture_end=end,
            session_id=self.replay_info["session_id"] if self.replaying and self.replay_info else None,
            pose_source=None, binary=True, extra_caveats=caveats,
            extra_provenance={"slam": dict(meta, source=self._slam_source, min_hits=MIN_HITS,
                                           keep_ratio=KEEP_RATIO)},
        )

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
            if frame is None or seq == last_seq:
                if pack:  # lo que quedara sin empaquetar del último mapa
                    try:
                        self.slam.changed_frames()
                    except Exception as exc:
                        log.warning("Mapa SLAM: no se pudo empaquetar (%s)", exc)
                continue
            last_seq = seq
            self.slam_step(frame[0], frame[1], pack=pack)

    # ----------------------------------------------------------------- captura
    async def start_capture(self, mode: str = "accumulate", record_session: bool = False) -> dict[str, Any]:
        if self._adapter is None:
            raise ConnectionFailed("not_connected", "No hay conexión con el robot.")
        if self.replaying:
            record_session = False   # no se graba una sesión a partir de otra sesión
        await self._adapter.start_capture(mode=mode, record_session=record_session,
                                          notes="captura desde dashboard")
        return {"capturing": True, "mode": mode, "record_session": record_session}

    async def stop_capture(self) -> dict[str, Any]:
        if self._adapter is None:
            raise ConnectionFailed("not_connected", "No hay conexión con el robot.")
        meta = await self._adapter.stop_capture()
        return meta.model_dump(mode="json")

    # ----------------------------------------------------------------- control
    def arm_control(self) -> dict[str, Any]:
        """Habilita el modo control (lo confirma el operador). Movimiento solo con WASD."""
        if self.replaying:
            raise ConnectionFailed("replay_no_control", "En replay no hay robot que conducir.")
        live = self._live_adapter()
        if live is None:
            raise ConnectionFailed("not_connected", "No hay conexión con el robot.")
        live.enable_control()
        self.control_armed = True
        return {"control_armed": True, "control_enabled": live.control_enabled}

    def disarm_control(self) -> dict[str, Any]:
        """Detiene el robot y vuelve a solo lectura. Seguro de llamar siempre."""
        self.control_armed = False
        live = self._live_adapter()
        if live is not None:
            live.disable_control()
        return {"control_armed": False}

    def drive(self, vx: float, vy: float, yaw: float) -> None:
        live = self._live_adapter()
        if live is None or not self.control_armed or not live.control_enabled:
            raise ConnectionFailed("control_not_armed", "El modo control no está habilitado.")
        live.drive(vx, vy, yaw)

    def stop_move(self) -> None:
        live = self._live_adapter()
        if live is not None and live.control_enabled:
            live.stop_move()

    def posture(self, command: str) -> None:
        live = self._live_adapter()
        if live is None or not self.control_armed or not live.control_enabled:
            raise ConnectionFailed("control_not_armed", "El modo control no está habilitado.")
        live.posture(command)
