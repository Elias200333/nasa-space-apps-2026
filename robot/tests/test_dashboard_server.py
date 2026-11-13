"""Servidor del dashboard con un robot FALSO: endpoints, control por WS, sin fugas."""

import json

import pytest
from fastapi.testclient import TestClient

from conftest import make_fake_go2_lib
from terrainx_robot.adapters.go2_webrtc import Go2WebRTCAdapter
from terrainx_robot.auth.aes_key_manager import DeviceSummary
from terrainx_robot.config import Go2Settings, Settings
from terrainx_robot.dashboard.server import create_app
from terrainx_robot.dashboard.service import DashboardService
from terrainx_robot.storage.scan_store import ScanStore

KEY = "0123456789abcdef0123456789abcdef"


def build(tmp_path):
    settings = Settings(
        data_dir=tmp_path / "d", robot_id="go2",
        go2=Go2Settings(method="LocalSTA", ip="192.168.8.181", aes_key_file=str(tmp_path / "k.aes")),
    )
    lib = make_fake_go2_lib()
    store = ScanStore(tmp_path / "d")
    service = DashboardService(
        settings,
        adapter_factory=lambda: Go2WebRTCAdapter(settings, store, enable_video=True, library_loader=lambda: lib),
    )
    return TestClient(create_app(settings, service=service)), service, lib


def test_pagina_y_estado_inicial(tmp_path):
    client, service, lib = build(tmp_path)
    assert "Go2" in client.get("/").text
    s = client.get("/api/status").json()
    assert s["connected"] is False
    assert s["aes_key_configured"] is False
    assert s["speed_limits"]["vx_ms"] > 0


def test_conectar_y_estado(tmp_path):
    client, service, lib = build(tmp_path)
    r = client.post("/api/connect")
    assert r.status_code == 200 and r.json()["connected"] is True
    s = client.get("/api/status").json()
    assert s["connected"] is True
    assert s["video"]["has_frame"] is False        # sin fotogramas reales
    assert s["control_enabled"] is False            # arranca en solo lectura


def test_control_requiere_conexion(tmp_path):
    client, service, lib = build(tmp_path)
    assert client.post("/api/control/arm").status_code == 409


def test_wasd_por_websocket_conduce_y_al_cerrar_desarma(tmp_path):
    client, service, lib = build(tmp_path)
    client.post("/api/connect")
    assert client.post("/api/control/arm").json()["control_enabled"] is True
    with client.websocket_connect("/ws/control") as wsc:
        wsc.send_json({"type": "drive", "vx": 0.3, "vy": 0.0, "yaw": 0.0})
        assert wsc.receive_json()["ok"] is True
        wsc.send_json({"type": "posture", "command": "StandUp"})
        wsc.receive_json()
    # al cerrar el WS: el robot queda detenido y fuera de modo control
    assert service.adapter is not None and service.adapter.control_enabled is False
    sent = [json.loads(m) for m in lib.instances[0].datachannel.channel.sent]
    ids = [m["data"]["header"]["identity"]["api_id"] for m in sent if m.get("type") == "req"]
    assert 1008 in ids   # Move (WASD)
    assert 1004 in ids   # StandUp
    assert 1003 in ids   # StopMove (al desarmar/cerrar)


def test_lidar_y_scans_sin_robot(tmp_path):
    client, service, lib = build(tmp_path)
    assert client.get("/api/lidar").json()["available"] is False
    assert client.get("/api/scans").json() == []


def test_auth_no_filtra_la_clave(tmp_path, monkeypatch):
    client, service, lib = build(tmp_path)
    monkeypatch.setattr(service.key_manager, "list_devices",
                        lambda e, p: [DeviceSummary("Perro", "SN-1", "Go2", True, True)])
    monkeypatch.setattr(service.key_manager, "fetch_and_store",
                        lambda e, p, sn: {"stored": True, "sn": sn, "fingerprint": "sha256:abcd1234",
                                          "configured": True})
    r = client.post("/api/auth/devices", json={"email": "a@b.com", "password": "secreta"})
    body = r.text
    assert r.status_code == 200 and KEY not in body and "secreta" not in body
    assert r.json()["devices"][0]["sn"] == "SN-1" and "key" not in r.json()["devices"][0]
    r2 = client.post("/api/auth/fetch-key", json={"email": "a@b.com", "password": "p", "serial": "SN-1"})
    assert r2.status_code == 200 and KEY not in r2.text
    assert r2.json()["fingerprint"].startswith("sha256:")


def test_auth_credenciales_malas(tmp_path):
    client, service, lib = build(tmp_path)
    r = client.post("/api/auth/devices", json={"email": "", "password": ""})
    assert r.status_code == 401
