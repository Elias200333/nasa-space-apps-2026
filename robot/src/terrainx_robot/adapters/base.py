"""Interfaz común RobotAdapter y piezas compartidas por todos los adaptadores.

Qué hace
    RobotAdapter define el contrato del dossier (§9): connect, disconnect,
    get_status, start_capture, stop_capture, list_scans, export_scan; y añade
    observe() (escuchar sin capturar, para el sondeo de capacidades) y capture()
    (atajo: start + ventana + stop).
    La lógica de captura, grabación de sesión, monitor de topics y telemetría
    vive aquí, de modo que el robot real y el replay producen EXACTAMENTE el
    mismo tipo de salida. Cada adaptador solo implementa _open, _close y
    _run_window, y entrega datos con _ingest_lidar_message / _ingest_json.

    Fase 1 = SOLO LECTURA: esta interfaz no tiene ningún método de movimiento.
    El control de movimiento será una interfaz separada y opcional (Fase 4).

Estados (dossier §6.4), separados en dos máquinas:
    conexión: disconnected -> connecting -> ready_readonly | degraded | failed
    captura : idle -> capturing -> processing -> complete | failed
"""

from __future__ import annotations

import asyncio
import logging
import time
from abc import ABC, abstractmethod
from collections.abc import Mapping, Sequence
from datetime import datetime
from pathlib import Path
from typing import Any

from ..lidar.accumulator import CaptureAccumulator, CaptureMode
from ..lidar.frames import LidarFrame, frame_from_message
from ..lidar.live_stream import pose_from_robot_pose
from ..lidar.validation import DEFAULT_MAX_POINTS
from ..models import (
    CaptureState,
    ConnectionState,
    EvidenceClass,
    RobotDescriptor,
    RobotStatus,
    ScanContext,
    ScanMetadata,
    SessionInfo,
    TelemetrySnapshot,
    TopicObservation,
)
from ..storage.scan_store import ScanStore
from ..storage.session_log import SessionRecorder
from ..util import new_id, software_versions, utc_now

log = logging.getLogger(__name__)


class RobotAdapterError(RuntimeError):
    pass


class ConnectionFailed(RobotAdapterError):
    """Fallo de conexión con causa identificada (code) y sugerencia (hint)."""

    def __init__(self, code: str, message: str, hint: str | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.hint = hint

    def as_dict(self) -> dict[str, str | None]:
        return {"error_code": self.code, "error_message": str(self), "hint": self.hint}


class CaptureError(RobotAdapterError):
    pass


# ----------------------------------------------------------------- monitor


def describe_structure(obj: Any, *, max_depth: int = 3, limit: int = 80) -> dict[str, str]:
    """Estructura de un payload: {"bms_state.soc": "int", "imu_state.rpy": "list[3]"}.

    Solo nombres y tipos, sin valores: sirve para descubrir qué publica el robot.
    """
    out: dict[str, str] = {}

    def walk(value: Any, prefix: str, depth: int) -> None:
        if len(out) >= limit:
            return
        if isinstance(value, Mapping) and depth < max_depth:
            for key, sub in value.items():
                walk(sub, f"{prefix}.{key}" if prefix else str(key), depth + 1)
        elif isinstance(value, (bytes, bytearray, memoryview)):
            out[prefix or "<root>"] = f"bytes[{len(value)}]"
        elif isinstance(value, Sequence) and not isinstance(value, str):
            out[prefix or "<root>"] = f"list[{len(value)}]"
        else:
            out[prefix or "<root>"] = type(value).__name__

    walk(obj, "", 0)
    return out


class TopicMonitor:
    def __init__(self) -> None:
        self._stats: dict[str, dict[str, Any]] = {}

    def observe(self, topic: str, host_utc: datetime, payload: Any) -> None:
        stat = self._stats.get(topic)
        if stat is None:
            self._stats[topic] = {
                "messages": 1,
                "first": host_utc,
                "last": host_utc,
                "structure": describe_structure(payload),
            }
        else:
            stat["messages"] += 1
            stat["last"] = host_utc

    def count(self, topic: str) -> int:
        return self._stats.get(topic, {}).get("messages", 0)

    def snapshot(self) -> list[TopicObservation]:
        out = []
        for topic, s in sorted(self._stats.items()):
            span = (s["last"] - s["first"]).total_seconds()
            rate = (s["messages"] - 1) / span if s["messages"] > 1 and span > 0 else None
            out.append(
                TopicObservation(
                    topic=topic,
                    messages=s["messages"],
                    first_seen_utc=s["first"],
                    last_seen_utc=s["last"],
                    rate_hz=round(rate, 3) if rate is not None else None,
                    payload_structure=s["structure"],
                )
            )
        return out


def _num(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def _num_list(value: Any) -> list[float] | None:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        return None
    nums = [_num(v) for v in value]
    return None if not nums or any(n is None for n in nums) else nums  # type: ignore[return-value]


class TelemetryTracker:
    """Extrae los campos de telemetría que leen los ejemplos oficiales de la librería."""

    def __init__(self) -> None:
        self._snap = TelemetrySnapshot()

    def update(self, topic: str, data: Any, host_utc: datetime) -> None:
        if not isinstance(data, Mapping):
            return
        s = self._snap
        touched = False
        if topic.endswith("lowstate"):
            bms = data.get("bms_state")
            if isinstance(bms, Mapping) and _num(bms.get("soc")) is not None:
                s.battery_soc_pct = _num(bms.get("soc"))
                touched = True
            if _num(data.get("power_v")) is not None:
                s.power_v = _num(data.get("power_v"))
                touched = True
            imu = data.get("imu_state")
            if isinstance(imu, Mapping) and _num_list(imu.get("rpy")) is not None:
                s.imu_rpy_raw = _num_list(imu.get("rpy"))
                touched = True
        elif topic.endswith("sportmodestate"):
            for field, attr in (("position", "position_raw"), ("velocity", "velocity_raw")):
                if _num_list(data.get(field)) is not None:
                    setattr(s, attr, _num_list(data.get(field)))
                    touched = True
            if _num(data.get("body_height")) is not None:
                s.body_height_m = _num(data.get("body_height"))
                touched = True
            imu = data.get("imu_state")
            if isinstance(imu, Mapping) and _num_list(imu.get("quaternion")) is not None:
                s.imu_quaternion_raw = _num_list(imu.get("quaternion"))
                touched = True
        if touched:
            if topic not in s.source_topics:
                s.source_topics.append(topic)
            s.updated_utc = host_utc

    def snapshot(self) -> TelemetrySnapshot:
        return self._snap.model_copy(deep=True)


# ----------------------------------------------------------------- adaptador


class RobotAdapter(ABC):
    adapter_name = "abstract"

    def __init__(
        self,
        *,
        descriptor: RobotDescriptor,
        store: ScanStore,
        evidence_class: EvidenceClass,
        scan_context: ScanContext,
        max_points: int = DEFAULT_MAX_POINTS,
    ) -> None:
        self.descriptor = descriptor
        self.store = store
        self.evidence_class = evidence_class
        self.scan_context = scan_context
        self.max_points = max_points
        self.sessions_dir: Path = store.data_dir / "sessions"
        self._connection_state = ConnectionState.DISCONNECTED
        self._capture_state = CaptureState.IDLE
        self._last_error: str | None = None
        self.monitor = TopicMonitor()
        self.telemetry = TelemetryTracker()
        self._accumulator: CaptureAccumulator | None = None
        self._recorder: SessionRecorder | None = None
        self._capture_start: datetime | None = None
        self._seq = 0
        self._lidar_frames = 0
        self._last_lidar_utc: datetime | None = None
        self.lidar_decode_errors = 0
        self.last_lidar_frame_info = None  # LidarFrameInfo del último frame recibido
        self.last_decode_error: str | None = None
        self.last_points = None  # np.ndarray (N,3) del último frame válido (vista en vivo)
        # Visor 3D en vivo: bytes ORIGINALES del último mapa (metadatos, lz4) y su contador
        self.last_lidar_raw: tuple[dict, bytes] | None = None
        self.lidar_raw_seq = 0
        # Pose del LiDAR (rt/utlidar/robot_pose): {x, y, z, yaw, frame_id} y su contador
        self.last_pose: dict | None = None
        self.pose_seq = 0
        # Panel «Estado del robot»: último mensaje JSON de cada topic y cuándo llegó AQUÍ
        # (reloj monotónico del PC: en replay, host_utc es la hora original de la grabación)
        self.latest_json: dict[str, Any] = {}
        self.topic_last_mono: dict[str, float] = {}

    # ------------------------------------------------------------ propiedades
    @property
    def connection_state(self) -> ConnectionState:
        return self._connection_state

    @property
    def capture_state(self) -> CaptureState:
        return self._capture_state

    @property
    def last_error(self) -> str | None:
        return self._last_error

    def _set_connection_state(self, state: ConnectionState, error: str | None = None) -> None:
        if state != self._connection_state:
            log.info("Conexión %s -> %s", self._connection_state.value, state.value)
        self._connection_state = state
        if error:
            self._last_error = error

    def _require_connected(self) -> None:
        if self._connection_state not in (ConnectionState.READY_READONLY, ConnectionState.DEGRADED):
            raise CaptureError(f"el adaptador no está conectado (estado: {self._connection_state.value})")

    # --------------------------------------------------------------- ciclo de vida
    async def connect(self) -> None:
        if self._connection_state in (ConnectionState.READY_READONLY, ConnectionState.DEGRADED):
            return
        self._set_connection_state(ConnectionState.CONNECTING)
        try:
            await self._open()
        except BaseException as exc:
            self._set_connection_state(ConnectionState.FAILED, str(exc) or type(exc).__name__)
            raise
        self._set_connection_state(ConnectionState.READY_READONLY)

    async def disconnect(self) -> None:
        if self._capture_state is CaptureState.CAPTURING:
            await self.abort_capture()
        self._stop_recorder()
        try:
            await self._close()
        finally:
            self._set_connection_state(ConnectionState.DISCONNECTED)

    # --------------------------------------------------------- grabación de sesión
    def _start_recorder(self, notes: str | None) -> None:
        if self._recorder is not None:
            raise CaptureError("ya hay una sesión grabándose")
        info = SessionInfo(
            session_id=new_id("session"),
            created_utc=utc_now(),
            robot=self.descriptor,
            evidence_class=self.evidence_class,
            scan_context=self.scan_context,
            demo=self.evidence_class is EvidenceClass.SYNTHETIC_TEST,
            generator=f"terrainx_robot.adapters.{self.adapter_name}",
            software=software_versions(),
            notes=notes,
        )
        self._recorder = SessionRecorder(self.sessions_dir, info)

    def _stop_recorder(self) -> SessionInfo | None:
        if self._recorder is None:
            return None
        info = self._recorder.close()
        self._recorder = None
        log.info("Sesión grabada: %s (%d mensajes)", info.session_id, info.record_count)
        return info

    @property
    def recording_info(self) -> SessionInfo | None:
        """La sesión que se está grabando ahora (None si no se graba ninguna)."""
        recorder = self._recorder
        return recorder.info if recorder is not None else None

    def start_recording(self, notes: str | None = None) -> str:
        """Graba la sesión cruda (para el replay) SIN captura de nube. Devuelve su id.
        Lo usa «● Grabar sesión» del dashboard: el mapa lo junta el SLAM, aquí solo se graba."""
        self._require_connected()
        self._start_recorder(notes)
        return self._recorder.info.session_id

    async def stop_recording(self) -> SessionInfo | None:
        """Cierra la sesión que se esté grabando (None si no hay ninguna). El cierre calcula
        el SHA-256 del archivo: va en otro hilo para no parar el bucle de la conexión."""
        recorder, self._recorder = self._recorder, None    # desde aquí no se escribe más
        if recorder is None:
            return None
        info = await asyncio.to_thread(recorder.close)
        log.info("Sesión grabada: %s (%d mensajes)", info.session_id, info.record_count)
        return info

    # ------------------------------------------------------------------- captura
    async def observe(
        self, duration_s: float | None, *, record_session: bool = False, notes: str | None = None
    ) -> SessionInfo | None:
        """Deja fluir datos durante la ventana sin generar escaneo (sondeo, grabación)."""
        self._require_connected()
        if record_session:
            self._start_recorder(notes)
        try:
            await self._run_window(duration_s)
        finally:
            info = self._stop_recorder() if record_session else None
        return info

    async def start_capture(
        self,
        *,
        mode: CaptureMode = "accumulate",
        record_session: bool = False,
        notes: str | None = None,
    ) -> None:
        self._require_connected()
        if self._capture_state in (CaptureState.CAPTURING, CaptureState.PROCESSING):
            raise CaptureError("ya hay una captura en curso")
        self._accumulator = CaptureAccumulator(mode, max_points=self.max_points)
        if record_session:
            self._start_recorder(notes)
        self._capture_start = utc_now()
        self._capture_state = CaptureState.CAPTURING

    async def abort_capture(self) -> None:
        self._accumulator = None
        self._stop_recorder()
        self._capture_state = CaptureState.IDLE

    async def stop_capture(self, *, binary_ply: bool = True) -> ScanMetadata:
        if self._capture_state is not CaptureState.CAPTURING or self._accumulator is None:
            raise CaptureError("no hay ninguna captura en curso")
        self._capture_state = CaptureState.PROCESSING   # desde aquí no entran más frames
        end = utc_now()
        # Se sueltan aquí, en el bucle: a partir de ahora ningún mensaje toca ni la nube
        # ni el archivo de sesión, y el hilo de abajo puede trabajar con ellos a solas.
        accumulator, self._accumulator = self._accumulator, None
        recorder, self._recorder = self._recorder, None
        save_kwargs = dict(
            robot=self.descriptor,
            evidence_class=self.evidence_class,
            delivery_mode=self.descriptor.delivery_mode,
            scan_context=self.scan_context,
            capture_start=self._capture_start or end,
            capture_end=end,
            pose_source=self._pose_source(),
            binary=binary_ply,
            extra_caveats=tuple(self._extra_caveats()),
            extra_provenance=self._extra_provenance(),
        )
        source_session = self._source_session_id()
        t0 = time.monotonic()
        try:
            # Cerrar la sesión (SHA-256), juntar la nube y escribir el PLY va en OTRO hilo:
            # en este bucle vive la conexión WebRTC. Con Pluffy, bloquearlo 8–14 s al guardar
            # hizo que el perro dejara de recibir respuestas y cortara (cámara y datos fuera).
            meta = await asyncio.to_thread(
                self._finish_capture, accumulator, recorder, source_session, save_kwargs)
        except BaseException as exc:
            self._capture_state = CaptureState.FAILED
            self._last_error = str(exc)
            raise
        log.info("Captura guardada: %s (%d puntos, %.2f s fuera del bucle de la conexión)",
                 meta.id, meta.point_count, time.monotonic() - t0)
        self._capture_state = CaptureState.COMPLETE
        return meta

    def _finish_capture(
        self,
        accumulator: CaptureAccumulator,
        recorder: SessionRecorder | None,
        source_session: str | None,
        save_kwargs: dict[str, Any],
    ) -> ScanMetadata:
        """Parte pesada de stop_capture. Corre en un hilo: no toca el estado del adaptador."""
        recorded = None
        if recorder is not None:
            recorded = recorder.close()
            log.info("Sesión grabada: %s (%d mensajes)", recorded.session_id, recorded.record_count)
        cloud = accumulator.result()
        if cloud.points.shape[0] == 0:
            raise CaptureError(
                "no se recibió ningún punto LiDAR válido durante la captura "
                f"(frames recibidos: {cloud.frames_received}, rechazos: {cloud.rejection_reasons or 'ninguno'})"
            )
        return self.store.save(
            cloud, session_id=recorded.session_id if recorded else source_session, **save_kwargs)

    async def capture(
        self,
        duration_s: float | None,
        *,
        mode: CaptureMode = "accumulate",
        record_session: bool = False,
        binary_ply: bool = True,
        notes: str | None = None,
    ) -> ScanMetadata:
        await self.start_capture(mode=mode, record_session=record_session, notes=notes)
        try:
            await self._run_window(duration_s)
        except BaseException:
            await self.abort_capture()
            raise
        return await self.stop_capture(binary_ply=binary_ply)

    # ---------------------------------------------------------------- consultas
    def get_status(self) -> RobotStatus:
        return RobotStatus(
            robot=self.descriptor,
            connection_state=self._connection_state,
            capture_state=self._capture_state,
            read_only=True,
            evidence_class=self.evidence_class,
            last_error=self._last_error,
            lidar_frames_received=self._lidar_frames,
            last_lidar_utc=self._last_lidar_utc,
            telemetry=self.telemetry.snapshot(),
            topics=self.monitor.snapshot(),
            readonly_guard=self._guard_counters(),
            updated_utc=utc_now(),
        )

    def list_scans(self) -> list[ScanMetadata]:
        return self.store.list()

    def export_scan(self, scan_id: str, dest_dir: Path) -> Path:
        return self.store.export(scan_id, dest_dir)

    # ------------------------------------------------- entrada de datos (subclases)
    def _ingest_frame(self, frame: LidarFrame) -> None:
        self._lidar_frames += 1
        self._last_lidar_utc = frame.info.host_received_utc
        self.last_lidar_frame_info = frame.info
        if frame.info.decode_error:
            self.lidar_decode_errors += 1
            self.last_decode_error = frame.info.decode_error
        elif frame.points.shape[0] > 0:
            # Último frame válido, para la vista LiDAR en vivo del dashboard
            # (independiente de si hay captura en curso).
            self.last_points = frame.points
        if self._capture_state is CaptureState.CAPTURING and self._accumulator is not None:
            self._accumulator.add(frame)

    def _ingest_lidar_message(
        self, *, topic: str, meta: dict, raw: bytes | None, host_utc: datetime
    ) -> LidarFrame:
        self._seq += 1
        self.monitor.observe(topic, host_utc, meta)
        self.topic_last_mono[topic] = time.monotonic()
        if raw is not None:
            self.last_lidar_raw = (meta, raw)   # una tupla nueva: la lectura desde otro hilo es atómica
            self.lidar_raw_seq += 1
        if self._recorder is not None and raw is not None:
            self._recorder.record_lidar(topic=topic, host_utc=host_utc, meta=meta, raw=raw)
        frame = frame_from_message(
            seq=self._seq, topic=topic, meta=meta, compressed=raw, host_received_utc=host_utc
        )
        if frame.info.decode_error:
            log.warning("Frame LiDAR %d no decodificable: %s", frame.info.seq, frame.info.decode_error)
        self._ingest_frame(frame)
        return frame

    def _ingest_json(self, *, topic: str, data: Any, host_utc: datetime) -> None:
        self.monitor.observe(topic, host_utc, data)
        self.telemetry.update(topic, data, host_utc)
        self.latest_json[topic] = data
        self.topic_last_mono[topic] = time.monotonic()
        if topic.endswith("robot_pose"):
            pose = pose_from_robot_pose(data)
            if pose is not None:
                self.last_pose = pose
                self.pose_seq += 1
        if self._recorder is not None:
            self._recorder.record_json(topic=topic, host_utc=host_utc, data=data)

    # ------------------------------------------------------- ganchos opcionales
    def _guard_counters(self) -> dict[str, int]:
        return {}

    def _pose_source(self) -> str | None:
        return None

    def _source_session_id(self) -> str | None:
        return None

    def _extra_caveats(self) -> list[str]:
        return []

    def _extra_provenance(self) -> dict:
        return {}

    # ---------------------------------------------------- métodos obligatorios
    @abstractmethod
    async def _open(self) -> None: ...

    @abstractmethod
    async def _close(self) -> None: ...

    @abstractmethod
    async def _run_window(self, duration_s: float | None) -> None:
        """Deja llegar datos durante duration_s segundos (None: hasta agotar la fuente)."""
