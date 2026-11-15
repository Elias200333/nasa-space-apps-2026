"""Servidor FastAPI del dashboard del Go2 AIR. Se sirve SOLO en 127.0.0.1.

Endpoints
    GET  /                     interfaz
    GET  /api/status           estado general (sin secretos)
    POST /api/connect          abre la conexión compartida al robot
    POST /api/disconnect       la cierra
    GET  /video/stream         cámara en directo (MJPEG)
    GET  /api/lidar            última nube de puntos (submuestreada)
    POST /api/slam/save        descarga del visor: guarda el mapa acumulado (PLY malla + GLB
                               igual que el visor + coordenadas JSON + metadatos + SHA-256) y
                               devuelve sus metadatos + «reused» (mapa sin cambios: el mismo escaneo)
    GET  /api/scans            lista de escaneos
    GET  /api/scans/{id}/download?format=ply|glb|coords   descarga un archivo del escaneo
    POST /api/auth/devices     lista robots de la cuenta (pide credenciales; NO devuelve clave)
    POST /api/auth/fetch-key   recupera y guarda la clave (NO la devuelve)
    WS   /ws/control           teleoperación WASD con hombre muerto (activa por defecto)
    WS   /ws/lidar             visor LiDAR 3D: mapa en vivo / acumulado + pose (solo lectura);
                               borrar y congelar el acumulado

Puente con la interfaz TERRAIN-X (PC y gafas XR; ver bridge.py)
    /robot/...                 las mismas rutas, a través del proxy de la interfaz (Vite)
    GET  /mision               página de la misión: cámara, LiDAR acumulado y conducción
    GET  /api/bridge/hello     ¿hace falta el código de emparejamiento?
    GET  /api/mission          estado de la misión
    POST /api/mission/start    «Mapear zona subterránea»: mapa nuevo + pose de partida
    POST /api/mission/finish   «Terminar recorrido»: guarda el mapa (+ <id>.mission.json)
    GET  /api/caves            cuevas integradas en el mapa 3D (posición declarada por el operador)
    POST /api/caves            «Integrar en el mapa 3D»: guarda dónde se colocó la cueva
    DELETE /api/caves/{id}     quita una cueva del mapa (el escaneo no se borra)

Seguridad
    - host fijo 127.0.0.1 (no accesible desde la red). Desde otro equipo (gafas) solo se entra
      por el proxy de la interfaz y con el código de emparejamiento (bridge.py).
    - la clave AES y los tokens nunca se devuelven en las respuestas.
    - WASD activo por defecto con el robot conectado (sin «Habilitar»): la primera orden pasa
      el guardián a modo control ACOTADO; al cerrar el canal, StopMove y solo lectura.
    - hombre muerto: si el robot iba en marcha y dejan de llegar órdenes en DEADMAN_S, se
      detiene. Sin teclas pulsadas no se envía nada al robot.
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
from ..lidar.live_stream import live_frame
from ..storage.scan_store import ScanStoreError
from .bridge import BridgeMiddleware, new_pairing_code
from .caves import CaveError, CaveStore
from .service import DashboardService

log = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).resolve().parent / "static"
DEADMAN_S = 0.4          # sin órdenes en este tiempo -> parada
VIDEO_TARGET_FPS = 15
POSTURE_COMMANDS = {"BalanceStand", "StandUp", "StandDown", "RecoveryStand", "Damp"}
LIDAR_TICK_S = 0.1       # visor 3D: como mucho 10 mapas/s (el navegador dibuja 1 cada 150 ms)
SLAM_INFO_S = 1.0        # visor 3D: estado del mapa acumulado cada segundo
LIDAR_MODES = {"live", "slam", "off"}


def _safe_stop(service: DashboardService, why: str) -> None:
    """StopMove sin dejar que un fallo de envío (conexión caída) corte lo que va detrás."""
    try:
        service.stop_move()
    except Exception:
        log.exception("No se pudo enviar StopMove (%s)", why)


def create_app(settings: Settings, service: DashboardService | None = None,
               pairing_code: str | None = None) -> FastAPI:
    app = FastAPI(title="TERRAIN-X · Go2 AIR", docs_url=None, redoc_url=None, openapi_url=None)
    service = service or DashboardService(settings)
    app.state.service = service
    app.state.pairing_code = pairing_code or new_pairing_code()
    app.add_middleware(BridgeMiddleware, code=app.state.pairing_code)
    caves = CaveStore(settings.data_dir, service.store)

    def _bridged(request: Request) -> bool:
        return request.scope.get("terrainx_bridge") is not None

    def _svc(request: Request | None = None) -> DashboardService:
        return service

    # ------------------------------------------------------------ interfaz
    @app.get("/")
    async def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    @app.get("/mision")
    async def mission_page() -> FileResponse:
        return FileResponse(STATIC_DIR / "mision.html")

    # -------------------------------------------------------------- estado
    @app.get("/api/status")
    async def api_status(request: Request) -> dict[str, Any]:
        st = service.status()
        if not _bridged(request):      # solo el dashboard de este PC ve el código de emparejamiento
            st["pairing_code"] = app.state.pairing_code
        return st

    # ------------------------------------------------- puente con la interfaz
    @app.get("/api/bridge/hello")
    async def bridge_hello(request: Request) -> dict[str, Any]:
        bridge = request.scope.get("terrainx_bridge") or {}
        return {"service": "terrainx-robot", "unit": "Unitree Go2", "model_variant": settings.model_variant,
                "pairing_required": bool(bridge.get("remote")), "connected": service.connected}

    @app.get("/api/mission")
    async def api_mission() -> dict[str, Any]:
        return service.mission_status()

    @app.post("/api/mission/start")
    async def api_mission_start(body: dict[str, Any] | None = None) -> dict[str, Any]:
        try:
            return service.start_mission((body or {}).get("site"))
        except ConnectionFailed as exc:
            raise HTTPException(status_code=409, detail={"code": exc.code, "message": str(exc), "hint": exc.hint})
        except CaptureError as exc:
            raise HTTPException(status_code=409, detail={"code": "pose_not_ready", "message": str(exc)})

    @app.get("/api/caves")
    async def api_caves() -> list[dict[str, Any]]:
        return await run_in_threadpool(caves.list)

    @app.post("/api/caves")
    async def api_caves_create(body: dict[str, Any]) -> dict[str, Any]:
        try:
            return await run_in_threadpool(caves.create, body)
        except CaveError as exc:
            raise HTTPException(status_code=400, detail={"code": "invalid_cave", "message": str(exc)})

    @app.delete("/api/caves/{cave_id}")
    async def api_caves_delete(cave_id: str) -> dict[str, Any]:
        try:
            await run_in_threadpool(caves.delete, cave_id)
        except CaveError as exc:
            raise HTTPException(status_code=404, detail={"code": "no_cave", "message": str(exc)})
        return {"deleted": cave_id}

    @app.post("/api/mission/finish")
    async def api_mission_finish() -> dict[str, Any]:
        try:
            return await service.finish_mission()
        except (CaptureError, ScanStoreError) as exc:
            raise HTTPException(status_code=409, detail={"code": "mission_not_saved", "message": str(exc)})

    @app.post("/api/connect")
    async def api_connect() -> dict[str, Any]:
        try:
            return await service.connect()
        except ConnectionFailed as exc:
            raise HTTPException(status_code=502, detail={"code": exc.code, "message": str(exc), "hint": exc.hint})

    # --------------------------------------------------- mapa SLAM acumulado
    @app.post("/api/slam/save")
    async def api_slam_save() -> dict[str, Any]:
        try:
            return await service.save_slam_map()
        except (CaptureError, ScanStoreError) as exc:
            raise HTTPException(status_code=409, detail=str(exc))

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

    # ------------------------------------------------------------- escaneos
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
    async def api_scan_download(scan_id: str, format: str = "ply") -> FileResponse:
        try:
            meta = service.store.load_metadata(scan_id)
        except ScanStoreError as exc:
            raise HTTPException(status_code=404, detail=str(exc))
        ref = meta.files.get(format)
        if ref is None:
            raise HTTPException(status_code=404, detail=f"el escaneo {scan_id} no tiene archivo {format!r}")
        path = service.store.scans_dir / scan_id / ref.path
        media = {"glb": "model/gltf-binary", "coords": "application/json",
                 "mission": "application/json"}.get(format, "application/octet-stream")
        return FileResponse(path, media_type=media, filename=path.name)

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
    @app.websocket("/ws/control")
    async def ws_control(ws: WebSocket) -> None:
        """WASD, activo por defecto (sin «Habilitar»). El navegador manda «drive» cada 100 ms
        SOLO mientras hay una tecla pulsada, y «stop» al soltar la última."""
        await ws.accept()
        moving = False   # la última orden fue de marcha (velocidad distinta de 0)
        try:
            while True:
                try:
                    msg = await asyncio.wait_for(ws.receive_json(), timeout=DEADMAN_S)
                except asyncio.TimeoutError:
                    if moving:   # hombre muerto: iba en marcha y dejaron de llegar órdenes -> parar
                        moving = False
                        _safe_stop(service, "hombre muerto")
                    continue
                if not isinstance(msg, dict):
                    continue
                kind = msg.get("type")
                try:
                    if kind == "drive":
                        vx, vy, yaw = (float(msg.get(k, 0)) for k in ("vx", "vy", "yaw"))
                        service.drive(vx, vy, yaw)
                        moving = any(v != 0 for v in (vx, vy, yaw))
                    elif kind == "stop":
                        moving = False
                        service.stop_move()
                    elif kind == "posture" and msg.get("command") in POSTURE_COMMANDS:
                        service.posture(msg["command"])
                    elif kind == "ping":
                        pass
                    await ws.send_json({"ok": True, "control_enabled": service.adapter is not None
                                        and service.adapter.control_enabled})
                except (ConnectionFailed, CaptureError, ValueError, TypeError) as exc:
                    await ws.send_json({"ok": False, "error": str(exc)})
                except Exception as exc:   # p. ej. el canal de datos del robot se cerró
                    log.exception("Control: orden %r no enviada", kind)
                    await ws.send_json({"ok": False, "error": f"{type(exc).__name__}: {exc}"})
        except WebSocketDisconnect:
            pass
        finally:
            # Cerrar el canal detiene y sale de control: no se queda conduciendo solo.
            _safe_stop(service, "cierre del canal de control")
            service.release_control()

    # ------------------------------------------------------------ LiDAR 3D
    @app.websocket("/ws/lidar")
    async def ws_lidar(ws: WebSocket) -> None:
        """Visor LiDAR 3D. El navegador pide {"mode": "live" | "slam" | "off"},
        {"type": "SLAM_RESET"} (borrar el acumulado), {"type": "SLAM_SYNC"} (reenviarlo
        entero) o {"type": "SLAM_PAUSE", "paused": bool} (congelar: no se suman mapas; si el
        visor que lo congeló se cierra, se reanuda). Recibe mensajes binarios LVX1
        (LIDAR_VOXELS en vivo, SLAM_CHUNK del acumulado) y JSON (POSE, SLAM_INFO). Nada de esto
        envía órdenes al robot."""
        await ws.accept()
        want = {"mode": "off", "sync": False, "paused_here": False}

        async def receiver() -> None:
            while True:
                try:
                    msg = await ws.receive_json()
                except WebSocketDisconnect:
                    return
                except (ValueError, KeyError):            # mensaje que no es JSON: se ignora
                    continue
                if not isinstance(msg, dict):
                    continue
                mode = msg.get("mode")
                if mode in LIDAR_MODES:
                    if mode == "slam" and want["mode"] != "slam":
                        want["sync"] = True          # al pasar a «Acumulado» va el mapa entero
                    want["mode"] = mode
                kind = msg.get("type")
                if kind == "SLAM_RESET":
                    service.slam_reset()
                elif kind == "SLAM_SYNC":
                    want["sync"] = True
                elif kind == "SLAM_PAUSE" and isinstance(msg.get("paused"), bool):
                    service.set_slam_paused(msg["paused"])
                    want["paused_here"] = msg["paused"]

        recv = asyncio.create_task(receiver())
        last_raw = last_pose = -1
        slam_seq, slam_epoch, last_info = 0, None, 0.0
        try:
            while not recv.done():
                adapter = service.adapter
                if adapter is not None:
                    if adapter.pose_seq != last_pose and adapter.last_pose is not None:
                        last_pose = adapter.pose_seq
                        await ws.send_json(dict(adapter.last_pose, type="POSE"))
                    frame = adapter.last_lidar_raw
                    if want["mode"] == "live" and adapter.lidar_raw_seq != last_raw and frame is not None:
                        last_raw = adapter.lidar_raw_seq
                        blob = live_frame(*frame)
                        if blob is not None:
                            await ws.send_bytes(blob)
                if want["mode"] == "slam":
                    info = service.slam.meta()
                    now = asyncio.get_running_loop().time()
                    if info["epoch"] != slam_epoch or want["sync"]:
                        slam_epoch, slam_seq, want["sync"] = info["epoch"], 0, False
                        last_info = 0.0                   # el visor tira lo viejo antes de los trozos
                    if now - last_info >= SLAM_INFO_S:
                        last_info = now
                        await ws.send_json(dict(info, type="SLAM_INFO", evidence_class="derived",
                                                paused=service.slam_paused))
                    blobs, slam_seq = service.slam.frames_since(slam_seq)
                    for blob in blobs:
                        await ws.send_bytes(blob)
                await asyncio.sleep(LIDAR_TICK_S)
        except (WebSocketDisconnect, RuntimeError):
            pass                                          # el visor se cerró
        finally:
            recv.cancel()
            try:
                await recv
            except (asyncio.CancelledError, Exception):  # cancelada o cerrada: nada que hacer
                pass
            if want["paused_here"]:          # el visor que congeló el mapa se cerró: se reanuda
                service.set_slam_paused(False)

    return app


def run(settings: Settings, host: str = "127.0.0.1", port: int = 8777) -> None:
    import uvicorn

    if host not in ("127.0.0.1", "localhost", "::1"):
        raise ValueError("El dashboard solo debe servirse en 127.0.0.1 por seguridad.")
    code = new_pairing_code()
    log.info("Dashboard en http://%s:%d", host, port)
    print(f"  Código de emparejamiento para las gafas XR u otro equipo: {code}")
    uvicorn.run(create_app(settings, pairing_code=code), host=host, port=port, log_level="warning")
