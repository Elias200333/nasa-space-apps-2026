"""TERRAIN-X · WebRTC Data Channel Security Guard & Command Whitelist.
NASA Space Apps Challenge 2026

Operational Security Modes:
    1. "readonly" Mode (Default Safety State):
       - Permits strictly telemetry inspection: subscribe, unsubscribe, heartbeat, validation.
       - Permits internal link maintenance requests (rtc_inner_req).
       - Permits LiDAR sensor stream toggle (rt/utlidar/switch) and camera video stream toggle.
       - [CRITICAL SAFETY CHECK]: Intercepts and blocks all motor actuation or motion commands,
         raising a ReadOnlyViolation exception on the host before transmission.

    2. "control" Mode (Bounded Teleoperation State):
       - Inherits all read-only subscriptions.
       - Whitelists only safe locomotion primitives (SAFE_CONTROL_COMMANDS):
         Move (vx, vy, yaw), Stop, StandUp, StandDown, Damp, RecoveryStand.
       - Permanently blocks hazardous routines (acrobatics, backflips, raw lowcmd, external wireless overrides).

Safety Philosophy:
    Enforced on the client host directly wrapping ``channel.send``. Acts as a software-defined
    interlock complementing the physical emergency stop button on the quadruped chassis.
"""

from __future__ import annotations

import json
import logging
import time
from collections import Counter
from typing import Any, Callable

from .go2_topics import LIDAR_SWITCH

log = logging.getLogger(__name__)

SPORT_REQUEST_TOPIC = "rt/api/sport/request"

ALWAYS_ALLOWED_TYPES = frozenset({"subscribe", "unsubscribe", "heartbeat", "validation"})
ALLOWED_INNER_REQ = frozenset(
    {"disable_traffic_saving", "public_network_status", "rtt_probe_send_from_mechine"}
)
ALLOWED_MSG = {LIDAR_SWITCH: frozenset({"on", "off"})}
# Recepción de cámara (switchVideoChannel envía type="vid" con "on"/"off").
# El audio ("aud") es send/recv y NO se permite.
ALLOWED_SWITCH_TYPES = {"vid": frozenset({"on", "off"})}

# Subconjunto ACOTADO de órdenes de locomoción permitido SOLO en modo control.
# api_ids verificados en unitree_webrtc_connect 2.2.0 (constants.SPORT_CMD).
# Deliberadamente NO incluye saltos, volteretas ni bailes.
SAFE_CONTROL_COMMANDS: dict[str, int] = {
    "Damp": 1001,
    "BalanceStand": 1002,
    "StopMove": 1003,
    "StandUp": 1004,
    "StandDown": 1005,
    "RecoveryStand": 1006,
    "Move": 1008,
}
_ALLOWED_CONTROL_API_IDS = frozenset(SAFE_CONTROL_COMMANDS.values())

MODE_READONLY = "readonly"
MODE_CONTROL = "control"


class ReadOnlyViolation(PermissionError):
    """Se intentó enviar al robot un mensaje fuera de la lista blanca vigente."""


def _parse(message: Any) -> dict | None:
    if not isinstance(message, str):
        return None
    try:
        payload = json.loads(message)
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


def check_readonly(message: Any) -> tuple[bool, str]:
    """Política de SOLO LECTURA. Devuelve (permitido, motivo)."""
    payload = _parse(message)
    if payload is None:
        return False, "mensaje no JSON/objeto bloqueado"
    msg_type = payload.get("type")
    topic = payload.get("topic", "")
    if msg_type in ALWAYS_ALLOWED_TYPES:
        return True, str(msg_type)
    if msg_type == "rtc_inner_req":
        data = payload.get("data")
        req_type = data.get("req_type") if isinstance(data, dict) else None
        if req_type in ALLOWED_INNER_REQ:
            return True, f"rtc_inner_req:{req_type}"
        return False, f"rtc_inner_req req_type={req_type!r} bloqueado (solo lectura)"
    if msg_type == "msg" and topic in ALLOWED_MSG:
        if payload.get("data") in ALLOWED_MSG[topic]:
            return True, f"msg:{topic}"
        return False, f"msg a {topic} con dato no permitido"
    if msg_type in ALLOWED_SWITCH_TYPES:
        if payload.get("data") in ALLOWED_SWITCH_TYPES[msg_type]:
            return True, f"{msg_type}:{payload.get('data')}"
        return False, f"conmutador {msg_type!r} con dato no permitido"
    return False, f"type={msg_type!r} topic={topic!r} bloqueado (solo lectura)"


def _extract_api_id(payload: dict) -> Any:
    try:
        return payload["data"]["header"]["identity"]["api_id"]
    except (KeyError, TypeError):
        return None


def check_control(message: Any) -> tuple[bool, str]:
    """Política de CONTROL: lo de solo lectura MÁS órdenes de locomoción acotadas."""
    ok, reason = check_readonly(message)
    if ok:
        return True, reason
    payload = _parse(message)
    if payload is None:
        return False, reason
    if payload.get("type") == "req" and payload.get("topic") == SPORT_REQUEST_TOPIC:
        api_id = _extract_api_id(payload)
        if api_id in _ALLOWED_CONTROL_API_IDS:
            return True, f"control:sport:{api_id}"
        return False, f"sport api_id={api_id!r} fuera de la lista blanca de control"
    return False, reason


_CHECKS: dict[str, Callable[[Any], tuple[bool, str]]] = {
    MODE_READONLY: check_readonly,
    MODE_CONTROL: check_control,
}


class ChannelGuard:
    """Interpone una política sobre ``channel.send``. El modo puede cambiarse en
    caliente (set_mode), pero solo desde código que active control explícitamente."""

    def __init__(self, channel: Any, on_block: Callable[[str], None] | None = None,
                 mode: str = MODE_READONLY) -> None:
        if mode not in _CHECKS:
            raise ValueError(f"modo desconocido: {mode}")
        self._channel = channel
        self._original_send = channel.send
        self._on_block = on_block
        self._mode = mode
        self.allowed: Counter[str] = Counter()
        self.blocked: Counter[str] = Counter()
        self.mode_changes: list[tuple[float, str]] = [(time.time(), mode)]
        channel.send = self._guarded_send  # sombrea el método de la instancia

    @property
    def mode(self) -> str:
        return self._mode

    def set_mode(self, mode: str) -> None:
        if mode not in _CHECKS:
            raise ValueError(f"modo desconocido: {mode}")
        if mode != self._mode:
            log.warning("Guardián del canal: modo %s -> %s", self._mode, mode)
            self.mode_changes.append((time.time(), mode))
        self._mode = mode

    def _guarded_send(self, message: Any) -> Any:
        ok, reason = _CHECKS[self._mode](message)
        if not ok:
            self.blocked[reason] += 1
            log.warning("Mensaje saliente BLOQUEADO (%s): %s", self._mode, reason)
            if self._on_block:
                self._on_block(reason)
            raise ReadOnlyViolation(reason)
        self.allowed[reason] += 1
        return self._original_send(message)

    def counters(self) -> dict[str, int]:
        out = {f"allowed:{k}": v for k, v in self.allowed.items()}
        out.update({f"blocked:{k}": v for k, v in self.blocked.items()})
        out["blocked_total"] = sum(self.blocked.values())
        return out

    def uninstall(self) -> None:
        self._channel.send = self._original_send


class ReadOnlyChannelGuard(ChannelGuard):
    """Guardián que arranca (y, salvo activación explícita, permanece) en solo lectura."""

    def __init__(self, channel: Any, on_block: Callable[[str], None] | None = None) -> None:
        super().__init__(channel, on_block, mode=MODE_READONLY)
