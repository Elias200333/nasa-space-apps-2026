"""Fixtures comunes. Ningún test necesita robot ni Internet."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from terrainx_robot.fixtures.synthetic import write_synthetic_session
from terrainx_robot.storage.scan_store import ScanStore


def run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    """Aísla los tests de cualquier configuración TERRAINX_* del entorno del usuario."""
    import os

    for key in list(os.environ):
        if key.startswith("TERRAINX_"):
            monkeypatch.delenv(key, raising=False)


@pytest.fixture
def data_dir(tmp_path: Path) -> Path:
    return tmp_path / "data"


@pytest.fixture
def store(data_dir: Path) -> ScanStore:
    return ScanStore(data_dir)


@pytest.fixture
def synthetic_session(data_dir: Path) -> Path:
    info = write_synthetic_session(data_dir / "sessions", n_frames=6, seed=11)
    return data_dir / "sessions" / info.session_id


# --- Librería Go2 FALSA compartida (sin robot ni red) -----------------------
def make_fake_go2_lib():
    """Imita unitree_webrtc_connect lo justo para probar el adaptador/dashboard.

    Registra en channel.sent todos los mensajes que PASAN el guardián, de modo
    que un test puede comprobar qué se envió (vídeo, Move, etc.).
    """
    import json
    from types import SimpleNamespace

    class FakeChannel:
        readyState = "open"

        def __init__(self):
            self.sent = []

        def send(self, message):
            self.sent.append(message)

    class FakePubSub:
        def __init__(self, channel):
            self.channel = channel
            self.subscriptions = {}

        def subscribe(self, topic, callback=None):
            self.subscriptions[topic] = callback
            self.channel.send(json.dumps({"type": "subscribe", "topic": topic}))

        def publish_without_callback(self, topic, data=None, msg_type=None):
            self.channel.send(json.dumps({"type": msg_type or "msg", "topic": topic, "data": data}))

    class FakeDataChannel:
        def __init__(self):
            self.channel = FakeChannel()
            self.pub_sub = FakePubSub(self.channel)
            self.decoder = "librería"

        async def disableTrafficSaving(self, switch):
            return True

        def switchVideoChannel(self, switch):
            self.pub_sub.publish_without_callback("", "on" if switch else "off", "vid")

    class FakeVideo:
        def __init__(self):
            self.callbacks = []

        def add_track_callback(self, cb):
            self.callbacks.append(cb)

    class FakePC:
        def __init__(self):
            self.connectionState = "connected"
            self.handlers = {}

        def on(self, event):
            def deco(fn):
                self.handlers.setdefault(event, []).append(fn)
                return fn
            return deco

    instances = []

    class FakeConn:
        def __init__(self, method, **kwargs):
            self.method, self.kwargs = method, kwargs
            self.datachannel = FakeDataChannel()
            self.video = FakeVideo()
            self.pc = FakePC()
            self.disconnected = False
            instances.append(self)

        async def connect(self):
            return None

        async def disconnect(self):
            self.disconnected = True

    class _Err(RuntimeError):
        pass

    lib = SimpleNamespace(
        WebRTCConnectionMethod=SimpleNamespace(LocalAP="AP", LocalSTA="STA"),
        UnitreeWebRTCConnection=FakeConn,
        AesKeyRequiredError=_Err, AesKeyRejectedError=_Err, RobotBusyError=_Err,
        LocalSignalingPortError=_Err, NoSdpAnswerError=_Err, DataChannelTimeoutError=_Err,
    )
    lib.instances = instances
    return lib
