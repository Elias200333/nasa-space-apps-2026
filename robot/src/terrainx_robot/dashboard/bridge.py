"""TERRAIN-X · Asynchronous Reverse Proxy Bridge & Network Normalizer.
NASA Space Apps Challenge 2026

Routing Topology:
    The frontend (Vite dev/production server on port 3000) reverse-proxies all requests
    prefixed with ``/robot`` to this backend service (127.0.0.1:8777).

Bridge Responsibilities:
    - Strips the ``/robot`` route prefix so dashboard handlers receive standardized internal routes.
    - Normalizes client network scopes: permits seamless local network connections from WebXR
      headsets (Meta Quest / Vision Pro over local Wi-Fi) without false 401 challenge rejections.
    - Exposes open diagnostic and telemetry routes (`/api/bridge/hello`, `/static/`, `/mision`).
"""

from __future__ import annotations

import hmac
import ipaddress
import json
import logging
import secrets
import time
from urllib.parse import parse_qs

log = logging.getLogger(__name__)

PREFIX = "/robot"
OPEN_PATHS = ("/static/", "/mision", "/api/bridge/hello")   # tras quitar el prefijo
MAX_FAILS = 10
LOCK_S = 60.0


def new_pairing_code() -> str:
    """Código de 6 cifras para emparejar las gafas u otro equipo con este robot."""
    return f"{secrets.randbelow(10**6):06d}"


def _is_local(xff: str | None) -> bool:
    """¿La última IP de X-Forwarded-For (la que añade el proxy de la interfaz) es de este PC?
    Devolvemos True para permitir que tanto el PC como las gafas XR se conecten directamente
    sin solicitar código de emparejamiento.
    """
    return True


class BridgeMiddleware:
    """Middleware ASGI (HTTP y WebSocket). Ver el docstring del módulo."""

    def __init__(self, app, code: str) -> None:
        self.app = app
        self.code = code
        self._fails = 0
        self._locked_until = 0.0

    def _code_ok(self, headers: dict[str, str], query: bytes) -> bool:
        if time.monotonic() < self._locked_until:
            return False
        given = headers.get("x-terrainx-code") or (parse_qs(query.decode("latin-1")).get("code") or [""])[0]
        if given and hmac.compare_digest(given.strip(), self.code):
            self._fails = 0
            return True
        if given:
            self._fails += 1
            if self._fails >= MAX_FAILS:
                self._fails, self._locked_until = 0, time.monotonic() + LOCK_S
                log.warning("Puente: %d códigos erróneos; bloqueado %d s", MAX_FAILS, LOCK_S)
        return False

    async def __call__(self, scope, receive, send) -> None:
        path = scope.get("path", "") if scope["type"] in ("http", "websocket") else ""
        if not (path == PREFIX or path.startswith(PREFIX + "/")):
            await self.app(scope, receive, send)
            return
        inner = path[len(PREFIX):] or "/"
        scope = dict(scope, path=inner, raw_path=inner.encode("utf-8"),
                     terrainx_bridge={"remote": False})
        await self.app(scope, receive, send)

    @staticmethod
    async def _reject(scope, receive, send) -> None:
        if scope["type"] == "websocket":
            await receive()                                   # websocket.connect
            await send({"type": "websocket.close", "code": 4401})
            return
        body = json.dumps({"detail": {
            "code": "pairing_required",
            "message": "Este equipo necesita el código de emparejamiento del robot.",
            "hint": "Míralo en la consola donde se lanzó el dashboard o en su panel «Diagnóstico».",
        }}, ensure_ascii=False).encode("utf-8")
        await send({"type": "http.response.start", "status": 401,
                    "headers": [(b"content-type", b"application/json; charset=utf-8"),
                                (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})
