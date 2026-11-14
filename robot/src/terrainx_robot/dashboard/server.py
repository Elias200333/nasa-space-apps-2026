"""Servidor FastAPI del dashboard del Go2 AIR. Se sirve SOLO en 127.0.0.1.

Endpoints
    GET  /                     interfaz
    GET  /api/status           estado general (sin secretos)
    POST /api/connect          abre la conexión compartida al robot
    POST /api/disconnect       la cierra
    GET  /video/stream         cámara en directo (MJPEG)
    GET  /api/lidar            última nube de puntos (submuestreada)
    POST /api/capture/start|stop
    GET  /api/scans            lista de escaneos
    GET  /api/scans/{id}/download   descarga el PLY
    POST /api/auth/devices     lista robots de la cuenta (pide credenciales; NO devuelve clave)
    POST /api/auth/fetch-key   recupera y guarda la clave (NO la devuelve)
    POST /api/control/arm|disarm
    WS   /ws/control           teleoperación WASD con hombre muerto

Seguridad
    - host fijo 127.0.0.1 (no accesible desde la red).
    - la clave AES y los tokens nunca se devuelven en las respuestas.
    - el control arranca deshabilitado; WASD solo tras /api/control/arm.
    - hombre muerto: si no llegan órdenes en DEADMAN_S, el robot se detiene.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from ..adapters.base import CaptureError, ConnectionFailed
from ..auth.aes_key_manager import AuthError
from ..config import Settings
from ..storage.scan_store import ScanStoreError
from .service import DashboardService

log = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).resolve().parent / "static"
DEADMAN_S = 0.4          # sin órdenes en este tiempo -> parada
VIDEO_TARGET_FPS = 15
POSTURE_COMMANDS = {"BalanceStand", "StandUp", "StandDown", "RecoveryStand", "Damp"}


def create_app(settings: Settings, service: DashboardService | None = None) -> FastAPI:
    app = FastAPI(title="TERRAIN-X · Go2 AIR", docs_url=None, redoc_url=None, openapi_url=None)
    service = service or DashboardService(settings)
    app.state.service = service

    def _svc(request: Request | None = None) -> DashboardService:
        return service

    # ------------------------------------------------------------ interfaz
    @app.get("/")
    async def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    # -------------------------------------------------------------- estado
    @app.get("/api/status")
    async def api_status() -> dict[str, Any]:
        return service.status()

    @app.post("/api/connect")
    async def api_connect() -> dict[str, Any]:
        try:
            return await service.connect()
        except ConnectionFailed as exc:
            raise HTTPException(status_code=502, detail={"code": exc.code, "message": str(exc), "hint": exc.hint})

    @app.post("/api/disconnect")
    async def api_disconnect() -> dict[str, Any]:
        return await service.disconnect()

    # --------------------------------------------------------------- vídeo
    @app.get("/video/stream")
    async def video_stream() -> StreamingResponse:
        async def frames():
            interval = 1.0 / VIDEO_TARGET_FPS
            while True:
                jpeg = service.latest_jpeg()
                if jpeg:
                    yield (b"--frame\r\nContent-Type: image/jpeg\r\n"
                           b"Content-Length: " + str(len(jpeg)).encode() + b"\r\n\r\n" + jpeg + b"\r\n")
                await asyncio.sleep(interval)

        return StreamingResponse(frames(), media_type="multipart/x-mixed-replace; boundary=frame")

    # --------------------------------------------------------------- lidar
    @app.get("/api/lidar")
    async def api_lidar() -> dict[str, Any]:
        return service.live_lidar()

    # ------------------------------------------------------------- capturas
    @app.post("/api/capture/start")
    async def api_capture_start(body: dict[str, Any] | None = None) -> dict[str, Any]:
        mode = (body or {}).get("mode", "accumulate")
        record = bool((body or {}).get("record_session", False))
        try:
            return await service.start_capture(mode=mode, record_session=record)
        except (ConnectionFailed, CaptureError) as exc:
            raise HTTPException(status_code=409, detail=str(exc))

    @app.post("/api/capture/stop")
    async def api_capture_stop() -> dict[str, Any]:
        try:
            return await service.stop_capture()
        except (ConnectionFailed, CaptureError) as exc:
            raise HTTPException(status_code=409, detail=str(exc))

    @app.get("/api/scans")
    async def api_scans() -> list[dict[str, Any]]:
        return [m.model_dump(mode="json") for m in service.store.list()]

    @app.get("/api/scans/{scan_id}/metadata")
    async def api_scan_metadata(scan_id: str) -> dict[str, Any]:
        try:
            return service.store.load_metadata(scan_id).model_dump(mode="json")
        except ScanStoreError as exc:
            raise HTTPException(status_code=404, detail=str(exc))

    @app.get("/api/scans/{scan_id}/download")
    async def api_scan_download(scan_id: str) -> FileResponse:
        try:
            meta = service.store.load_metadata(scan_id)
        except ScanStoreError as exc:
            raise HTTPException(status_code=404, detail=str(exc))
        path = service.store.scans_dir / scan_id / meta.files["ply"].path
        return FileResponse(path, media_type="application/octet-stream", filename=path.name)

    # ----------------------------------------------------------- autenticación
    @app.post("/api/auth/devices")
    async def api_auth_devices(body: dict[str, Any]) -> dict[str, Any]:
        email = (body or {}).get("email", "")
        password = (body or {}).get("password", "")
        try:
            devices = await run_in_threadpool(service.key_manager.list_devices, email, password)
        except AuthError as exc:
            raise HTTPException(status_code=401, detail=str(exc))
        return {"devices": [d.as_dict() for d in devices]}  # sin clave

    @app.post("/api/auth/fetch-key")
    async def api_auth_fetch(body: dict[str, Any]) -> dict[str, Any]:
        email = (body or {}).get("email", "")
        password = (body or {}).get("password", "")
        sn = (body or {}).get("serial") or settings.go2.serial or ""
        try:
            result = await run_in_threadpool(service.key_manager.fetch_and_store, email, password, sn)
        except AuthError as exc:
            raise HTTPException(status_code=401, detail=str(exc))
        return {"stored": result.get("stored"), "sn": result.get("sn"),
                "fingerprint": result.get("fingerprint")}  # nunca la clave

    @app.get("/api/auth/status")
    async def api_auth_status() -> dict[str, Any]:
        st = service.key_manager.status()
        return {"configured": bool(st.get("configured")), "fingerprint": st.get("fingerprint")}

    # --------------------------------------------------------------- control
    @app.post("/api/control/arm")
    async def api_control_arm() -> dict[str, Any]:
        try:
            return service.arm_control()
        except ConnectionFailed as exc:
            raise HTTPException(status_code=409, detail=str(exc))

    @app.post("/api/control/disarm")
    async def api_control_disarm() -> dict[str, Any]:
        return service.disarm_control()

    @app.websocket("/ws/control")
    async def ws_control(ws: WebSocket) -> None:
        await ws.accept()
        try:
            while True:
                try:
                    msg = await asyncio.wait_for(ws.receive_json(), timeout=DEADMAN_S)
                except asyncio.TimeoutError:
                    service.stop_move()  # hombre muerto: sin órdenes -> parar
                    continue
                kind = msg.get("type")
                try:
                    if kind == "drive":
                        service.drive(float(msg.get("vx", 0)), float(msg.get("vy", 0)), float(msg.get("yaw", 0)))
                    elif kind == "stop":
                        service.stop_move()
                    elif kind == "posture" and msg.get("command") in POSTURE_COMMANDS:
                        service.posture(msg["command"])
                    elif kind == "ping":
                        pass
                    await ws.send_json({"ok": True, "control_enabled": service.adapter is not None
                                        and service.adapter.control_enabled})
                except (ConnectionFailed, CaptureError) as exc:
                    await ws.send_json({"ok": False, "error": str(exc)})
        except WebSocketDisconnect:
            pass
        finally:
            # Cerrar el canal detiene y sale de control: no se queda conduciendo solo.
            service.stop_move()
            service.disarm_control()

    return app


def run(settings: Settings, host: str = "127.0.0.1", port: int = 8777) -> None:
    import uvicorn

    if host not in ("127.0.0.1", "localhost", "::1"):
        raise ValueError("El dashboard solo debe servirse en 127.0.0.1 por seguridad.")
    log.info("Dashboard en http://%s:%d", host, port)
    uvicorn.run(create_app(settings), host=host, port=port, log_level="warning")
