"""Puente entre el backend del robot y la interfaz TERRAIN-X (PC y gafas XR).

Cómo llega la interfaz aquí
    La interfaz (Vite, puerto 3000) reenvía todo lo que empieza por ``/robot`` a este servidor
    (127.0.0.1:8777) con ``xfwd: true``, que añade la IP real del cliente en X-Forwarded-For.
    Este servidor sigue escuchando SOLO en 127.0.0.1: desde la red solo se entra por ese proxy.

Qué hace este middleware
    - Quita el prefijo ``/robot``: las rutas son las mismas que las del dashboard.
    - Si la petición viene de OTRO equipo (gafas por Wi-Fi, otro PC), exige el código de
      emparejamiento que se imprime al lanzar el dashboard (cabecera X-TerrainX-Code o
      ``?code=``). Sin él: 401 en HTTP y cierre 4401 en WebSocket. Es «otro equipo» si la
      última IP de X-Forwarded-For no es local, o si falta esa cabecera (proxy mal configurado:
      se pide código por si acaso).
    - Tras 10 códigos erróneos se bloquea 60 s (contra quien pruebe códigos al azar).
    - El dashboard directo (http://127.0.0.1:8777, sin ``/robot``) no cambia.
    Sin código se pueden cargar la página de la misión, sus archivos estáticos y
    ``/api/bridge/hello`` (que dice si hace falta código).
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
    """¿La última IP de X-Forwarded-For (la que añade el proxy de la interfaz) es de este PC?"""
    if not xff:
        return False
    last = xff.split(",")[-1].strip()
    try:
        ip = ipaddress.ip_address(last)
    except ValueError:
        return False
    mapped = getattr(ip, "ipv4_mapped", None)
    return bool(ip.is_loopback or (mapped is not None and mapped.is_loopback))


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
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
        remote = not _is_local(headers.get("x-forwarded-for"))
        scope = dict(scope, path=inner, raw_path=inner.encode("utf-8"),
                     terrainx_bridge={"remote": remote})
        if remote and not inner.startswith(OPEN_PATHS) and not self._code_ok(headers, scope.get("query_string", b"")):
            await self._reject(scope, receive, send)
            return
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
