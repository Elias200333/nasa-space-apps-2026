"""Vídeo y teleoperación acotada del Go2WebRTCAdapter, con librería FALSA."""

import json

import pytest

from conftest import make_fake_go2_lib, run
from terrainx_robot.adapters.base import CaptureError
from terrainx_robot.adapters.go2_webrtc import MAX_VX_MS, MAX_YAW_RPS, Go2WebRTCAdapter
from terrainx_robot.adapters.readonly_guard import MODE_CONTROL, MODE_READONLY, ReadOnlyViolation
from terrainx_robot.config import Go2Settings, Settings
from terrainx_robot.storage.scan_store import ScanStore


def _adapter(tmp_path, enable_video=True):
    lib = make_fake_go2_lib()
    settings = Settings(data_dir=tmp_path / "d", robot_id="go2", go2=Go2Settings(method="LocalSTA", ip="192.168.8.181"))
    adapter = Go2WebRTCAdapter(settings, ScanStore(tmp_path / "d"), enable_video=enable_video, library_loader=lambda: lib)
    return adapter, lib


def _sent(lib):
    return [json.loads(m) for m in lib.instances[0].datachannel.channel.sent]


def test_video_se_activa_al_conectar(tmp_path):
    adapter, lib = _adapter(tmp_path, enable_video=True)
    run(adapter.connect())
    assert lib.instances[0].video.callbacks  # se registró el receptor de vídeo
    assert {"type": "vid", "topic": "", "data": "on"} in _sent(lib)
    assert adapter.video_stats()["has_frame"] is False  # aún sin fotogramas
    run(adapter.disconnect())


def test_sin_video_no_se_activa(tmp_path):
    adapter, lib = _adapter(tmp_path, enable_video=False)
    run(adapter.connect())
    assert not lib.instances[0].video.callbacks
    assert {"type": "vid", "topic": "", "data": "on"} not in _sent(lib)


def test_conducir_requiere_modo_control(tmp_path):
    adapter, lib = _adapter(tmp_path)
    run(adapter.connect())
    # Sin habilitar control, el guardián bloquea el Move
    with pytest.raises(ReadOnlyViolation):
        adapter.drive(0.2, 0, 0)
    assert adapter.control_enabled is False


def test_conducir_en_modo_control_envia_move_acotado(tmp_path):
    adapter, lib = _adapter(tmp_path)
    run(adapter.connect())
    adapter.enable_control()
    assert adapter._guard.mode == MODE_CONTROL
    adapter.drive(10, 0, 10)  # muy por encima de los topes -> se recorta
    reqs = [m for m in _sent(lib) if m["type"] == "req"]
    assert reqs, "no se envió ninguna orden de locomoción"
    last = reqs[-1]
    assert last["data"]["header"]["identity"]["api_id"] == 1008  # Move
    params = json.loads(last["data"]["parameter"])
    assert params["x"] == MAX_VX_MS and params["z"] == MAX_YAW_RPS  # recortado a los topes


def test_posturas_permitidas_y_prohibidas(tmp_path):
    adapter, lib = _adapter(tmp_path)
    run(adapter.connect())
    adapter.enable_control()
    adapter.posture("StandUp")
    assert _sent(lib)[-1]["data"]["header"]["identity"]["api_id"] == 1004
    with pytest.raises(CaptureError):
        adapter.posture("BackFlip")   # no está en el conjunto seguro
    with pytest.raises(CaptureError):
        adapter.posture("Move")       # Move va por drive(), no por posture()


def test_deshabilitar_control_para_y_vuelve_a_solo_lectura(tmp_path):
    adapter, lib = _adapter(tmp_path)
    run(adapter.connect())
    adapter.enable_control()
    adapter.disable_control()
    assert adapter._guard.mode == MODE_READONLY
    stops = [m for m in _sent(lib) if m["type"] == "req" and m["data"]["header"]["identity"]["api_id"] == 1003]
    assert stops, "al salir de control debe enviarse StopMove (1003)"
    # y después un Move vuelve a estar bloqueado
    with pytest.raises(ReadOnlyViolation):
        adapter.drive(0.2, 0, 0)


def test_desconectar_sale_de_control(tmp_path):
    adapter, lib = _adapter(tmp_path)
    run(adapter.connect())
    adapter.enable_control()
    run(adapter.disconnect())
    assert lib.instances[0].disconnected
