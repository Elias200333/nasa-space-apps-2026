"""El guardián en modo control permite SOLO locomoción acotada; nada más."""

import json

import pytest

from terrainx_robot.adapters.readonly_guard import (
    MODE_CONTROL,
    MODE_READONLY,
    SAFE_CONTROL_COMMANDS,
    SPORT_REQUEST_TOPIC,
    ChannelGuard,
    ReadOnlyViolation,
    check_control,
    check_readonly,
)


class FakeChannel:
    readyState = "open"

    def __init__(self):
        self.sent = []

    def send(self, message):
        self.sent.append(message)


def sport(api_id):
    return json.dumps({"type": "req", "topic": SPORT_REQUEST_TOPIC,
                       "data": {"header": {"identity": {"id": 1, "api_id": api_id}}, "parameter": "{}"}})


SAFE_IDS = sorted(SAFE_CONTROL_COMMANDS.values())
UNSAFE_IDS = [1044, 1030, 1022, 1031, 1301, 1305]  # BackFlip, FrontFlip, Dance1, FrontJump, Handstand, MoonWalk


@pytest.mark.parametrize("api_id", SAFE_IDS)
def test_control_permite_locomocion_segura(api_id):
    ok, _ = check_control(sport(api_id))
    assert ok
    # en solo lectura, esas mismas órdenes se bloquean
    assert not check_readonly(sport(api_id))[0]


@pytest.mark.parametrize("api_id", UNSAFE_IDS)
def test_control_bloquea_acrobacias(api_id):
    assert not check_control(sport(api_id))[0]


def test_control_tambien_permite_lectura():
    for msg in [
        json.dumps({"type": "subscribe", "topic": "rt/lf/lowstate"}),
        json.dumps({"type": "msg", "topic": "rt/utlidar/switch", "data": "on"}),
        json.dumps({"type": "vid", "topic": "", "data": "on"}),
    ]:
        assert check_control(msg)[0]


def test_control_bloquea_otros_topics_de_mando():
    assert not check_control(json.dumps({"type": "msg", "topic": "rt/lowcmd", "data": {}}))[0]
    assert not check_control(json.dumps({"type": "msg", "topic": "rt/wirelesscontroller", "data": {}}))[0]
    # un req a un topic que no es sport tampoco
    assert not check_control(json.dumps({"type": "req", "topic": "rt/api/vui/request",
                                         "data": {"header": {"identity": {"api_id": 1008}}}}))[0]


def test_cambio_de_modo_en_el_guardian():
    ch = FakeChannel()
    guard = ChannelGuard(ch)
    assert guard.mode == MODE_READONLY
    with pytest.raises(ReadOnlyViolation):      # Move bloqueado en solo lectura
        ch.send(sport(SAFE_CONTROL_COMMANDS["Move"]))
    guard.set_mode(MODE_CONTROL)
    ch.send(sport(SAFE_CONTROL_COMMANDS["Move"]))   # ahora pasa
    with pytest.raises(ReadOnlyViolation):      # pero un salto sigue bloqueado
        ch.send(sport(1044))
    guard.set_mode(MODE_READONLY)
    with pytest.raises(ReadOnlyViolation):
        ch.send(sport(SAFE_CONTROL_COMMANDS["Move"]))
    assert len(ch.sent) == 1                    # solo pasó el Move en modo control
    assert len(guard.mode_changes) == 3         # readonly -> control -> readonly
