"""Panel «Estado del robot» del dashboard: secciones extraídas de los mensajes que YA llegan.

Qué hace
    Lee el último mensaje de cada topic (``adapter.latest_json``) y devuelve
    batería, estado del LiDAR, ajustes del robot (``rt/multiplestate``) y la salud de
    cada flujo de datos. No envía nada al robot.

Honestidad de los datos
    - Los nombres de campo son los que llegan del Go2 AIR de verdad (vistos en
      ``/api/status`` → topics → payload_structure el 2026-11-14).
    - Solo se ponen unidades cuando son evidentes (``soc`` en %, ``power_v`` en V,
      ``*_percentage`` / ``*_rate`` en %). El resto va como ``*_raw``: Unitree no las
      documenta y no están verificadas físicamente.
    - Los umbrales de batería son una decisión NUESTRA de operación (no de Unitree).
    - Un campo que no llega se devuelve como None («no disponible»): nunca se inventa.
"""
from __future__ import annotations

import math
import time
from collections.abc import Iterable, Mapping
from typing import Any

BATTERY_WARN_PCT = 25.0       # aviso: terminar la prueba en curso y cargar
BATTERY_CRITICAL_PCT = 15.0   # crítico: no empezar pruebas de movimiento

# Un flujo se considera «parado» si no llega nada en este tiempo o en 3 periodos
STALE_MIN_S = 2.0


def _num(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    v = float(value)
    return v if math.isfinite(v) else None


def _nums(value: Any) -> list[float] | None:
    if not isinstance(value, (list, tuple)) or not value:
        return None
    out = [_num(v) for v in value]
    return None if any(v is None for v in out) else out  # type: ignore[return-value]


def _latest(latest: Mapping[str, Any], suffix: str) -> Mapping[str, Any] | None:
    for topic, data in latest.items():
        if topic.endswith(suffix) and isinstance(data, Mapping):
            return data
    return None


def battery(latest: Mapping[str, Any]) -> dict[str, Any]:
    low = _latest(latest, "lowstate")
    bms = low.get("bms_state") if low else None
    bms = bms if isinstance(bms, Mapping) else {}
    soc = _num(bms.get("soc"))
    if soc is None:
        level = "unknown"
    elif soc < BATTERY_CRITICAL_PCT:
        level = "critical"
    elif soc < BATTERY_WARN_PCT:
        level = "low"
    else:
        level = "ok"
    return {
        "soc_pct": soc,
        "power_v": _num(low.get("power_v")) if low else None,
        "current_raw": _num(bms.get("current")),
        "cycles": _num(bms.get("cycle")),
        "bms_temp_raw": _nums(bms.get("bq_ntc")),
        "mcu_temp_raw": _nums(bms.get("mcu_ntc")),
        "level": level,
        "warn_pct": BATTERY_WARN_PCT,
        "critical_pct": BATTERY_CRITICAL_PCT,
        "source_topic": "rt/lf/lowstate" if low else None,
    }


def lidar_state(latest: Mapping[str, Any]) -> dict[str, Any]:
    st = _latest(latest, "lidar_state") or {}
    text = lambda k: st.get(k) if isinstance(st.get(k), str) else None  # noqa: E731
    return {
        "available": bool(st),
        "dirty_pct": _num(st.get("dirty_percentage")),
        "cloud_packet_loss_pct": _num(st.get("cloud_packet_loss_rate")),
        "imu_packet_loss_pct": _num(st.get("imu_packet_loss_rate")),
        "error_state_raw": _num(st.get("error_state")),
        "cloud_frequency_raw": _num(st.get("cloud_frequency")),
        "rotation_speed_raw": _num(st.get("sys_rotation_speed")),
        "firmware_version": text("firmware_version"),
        "software_version": text("software_version"),
        "sdk_version": text("sdk_version"),
    }


def robot_settings(latest: Mapping[str, Any]) -> dict[str, Any]:
    ms = _latest(latest, "multiplestate") or {}
    avoid = ms.get("obstaclesAvoidSwitch")
    return {
        "available": bool(ms),
        "obstacle_avoidance": avoid if isinstance(avoid, bool) else None,
        "brightness_raw": _num(ms.get("brightness")),
        "volume_raw": _num(ms.get("volume")),
    }


def topic_health(monitor_snapshot: Iterable[Any], last_mono: Mapping[str, float],
                 expected: Iterable[str], now: float | None = None) -> list[dict[str, Any]]:
    """Cada flujo: frecuencia, segundos desde el último mensaje y estado ok / parado / sin datos."""
    now = time.monotonic() if now is None else now
    rates = {o.topic: o for o in monitor_snapshot}
    out = []
    for topic in dict.fromkeys(list(expected) + list(rates)):     # orden estable, sin repetir
        obs = rates.get(topic)
        rate = obs.rate_hz if obs is not None else None
        seen = last_mono.get(topic)
        age = round(now - seen, 2) if seen is not None else None
        if age is None:
            state = "no_data"
        else:
            limit = max(STALE_MIN_S, 3.0 / rate) if rate else STALE_MIN_S
            state = "ok" if age <= limit else "stale"
        out.append({"topic": topic, "rate_hz": rate, "messages": obs.messages if obs else 0,
                    "age_s": age, "state": state})
    return out


def details(adapter: Any, expected_topics: Iterable[str]) -> dict[str, Any]:
    latest = getattr(adapter, "latest_json", {}) or {}
    return {
        "battery": battery(latest),
        "lidar": lidar_state(latest),
        "settings": robot_settings(latest),
        "topics": topic_health(adapter.monitor.snapshot(), getattr(adapter, "topic_last_mono", {}),
                               expected_topics),
    }
