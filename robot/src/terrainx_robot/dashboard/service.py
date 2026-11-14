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
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

from ..adapters.base import ConnectionFailed
from ..adapters.go2_webrtc import MAX_VX_MS, MAX_VY_MS, MAX_YAW_RPS, Go2WebRTCAdapter
from ..auth.aes_key_manager import DEFAULT_STORE, AesKeyManager
from ..config import Settings
from ..models import CaptureState, ConnectionState, DeliveryMode, ScanContext
from ..storage.scan_store import ScanStore

log = logging.getLogger(__name__)

LIVE_LIDAR_MAX_POINTS = 25_000  # tope para el visor en vivo (submuestreo)


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
        self._adapter: Go2WebRTCAdapter | None = None
        self.control_armed = False  # el operador confirmó el modo control
        self.last_error: str | None = None

    # --------------------------------------------------------------- conexión
    @property
    def adapter(self) -> Go2WebRTCAdapter | None:
        return self._adapter

    @property
    def connected(self) -> bool:
        return (
            self._adapter is not None
            and self._adapter.connection_state
            in (ConnectionState.READY_READONLY, ConnectionState.DEGRADED)
        )

    async def connect(self) -> dict[str, Any]:
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
        return self.status()

    async def disconnect(self) -> dict[str, Any]:
        self.control_armed = False
        if self._adapter is not None:
            try:
                await self._adapter.disconnect()
            finally:
                self._adapter = None
        return self.status()

    # ----------------------------------------------------------------- estado
    def status(self) -> dict[str, Any]:
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
        if self._adapter is not None:
            st = self._adapter.get_status()
            base.update(
                connection_state=st.connection_state.value,
                capture_state=st.capture_state.value,
                last_error=st.last_error or self.last_error,
                control_enabled=self._adapter.control_enabled,
                library_version=self._adapter.connection_info.get("library_version"),
                video=self._adapter.video_stats(),
                lidar_frames=st.lidar_frames_received,
                lidar_decode_errors=self._adapter.lidar_decode_errors,
                readonly_guard=st.readonly_guard,
                telemetry=st.telemetry.model_dump(mode="json"),
                topics=[t.model_dump(mode="json") for t in st.topics],
                connection_info=self._adapter.connection_info,
            )
        return base

    # ------------------------------------------------------------------- vídeo
    def latest_jpeg(self) -> bytes | None:
        return self._adapter.video.latest() if self._adapter is not None else None

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

    # ----------------------------------------------------------------- captura
    async def start_capture(self, mode: str = "accumulate", record_session: bool = False) -> dict[str, Any]:
        if self._adapter is None:
            raise ConnectionFailed("not_connected", "No hay conexión con el robot.")
        await self._adapter.start_capture(mode=mode, record_session=record_session,
                                          notes="captura desde dashboard")
        return {"capturing": True, "mode": mode}

    async def stop_capture(self) -> dict[str, Any]:
        if self._adapter is None:
            raise ConnectionFailed("not_connected", "No hay conexión con el robot.")
        meta = await self._adapter.stop_capture()
        return meta.model_dump(mode="json")

    # ----------------------------------------------------------------- control
    def arm_control(self) -> dict[str, Any]:
        """Habilita el modo control (lo confirma el operador). Movimiento solo con WASD."""
        if self._adapter is None:
            raise ConnectionFailed("not_connected", "No hay conexión con el robot.")
        self._adapter.enable_control()
        self.control_armed = True
        return {"control_armed": True, "control_enabled": self._adapter.control_enabled}

    def disarm_control(self) -> dict[str, Any]:
        """Detiene el robot y vuelve a solo lectura. Seguro de llamar siempre."""
        self.control_armed = False
        if self._adapter is not None:
            self._adapter.disable_control()
        return {"control_armed": False}

    def drive(self, vx: float, vy: float, yaw: float) -> None:
        if self._adapter is None or not self.control_armed or not self._adapter.control_enabled:
            raise ConnectionFailed("control_not_armed", "El modo control no está habilitado.")
        self._adapter.drive(vx, vy, yaw)

    def stop_move(self) -> None:
        if self._adapter is not None and self._adapter.control_enabled:
            self._adapter.stop_move()

    def posture(self, command: str) -> None:
        if self._adapter is None or not self.control_armed or not self._adapter.control_enabled:
            raise ConnectionFailed("control_not_armed", "El modo control no está habilitado.")
        self._adapter.posture(command)
