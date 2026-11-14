"""Mapa SLAM acumulado (slam_map), flujo LVX1 en vivo (live_stream) y /ws/lidar.

Todo con datos SINTÉTICOS (encode_voxel_map / fixtures): no hay robot aquí.
"""

import json
import math
import struct

import lz4.block
import numpy as np
import pytest

from terrainx_robot.adapters.go2_topics import LIDAR_VOXEL_COMPRESSED, ROBOT_POSE
from terrainx_robot.adapters.go2_webrtc import PassthroughLidarDecoder
from terrainx_robot.fixtures.synthetic import generate_frames
from terrainx_robot.lidar.live_stream import live_frame, pose_from_robot_pose, raw_frame_fields
from terrainx_robot.lidar.slam_map import CHUNK, LAYERS, Z_BASE, SlamMap
from terrainx_robot.lidar.voxel_codec import encode_voxel_map

RES = 0.05
# Esquina de la ventana en (k − ½)·res: el vóxel (0, 0, 0) de la ventana es el del mundo −64, −64, −10
ORIGIN = [-64.5 * RES, -64.5 * RES, -10.5 * RES]
Z_SLICES = 38


def parse_lvx(blob: bytes) -> tuple[dict, bytes]:
    assert blob[:4] == b"LVX1"
    (hlen,) = struct.unpack("<I", blob[4:8])
    return json.loads(blob[8:8 + hlen]), blob[8 + hlen:]


def window(indices) -> tuple[bytes, int]:
    return encode_voxel_map(np.asarray(indices, dtype=np.int64).reshape(-1, 3), Z_SLICES)


def chunk_grid(blob: bytes) -> tuple[dict, np.ndarray]:
    head, body = parse_lvx(blob)
    if not head["src_size"]:
        return head, np.zeros((LAYERS, CHUNK, CHUNK), dtype=bool)
    raw = lz4.block.decompress(body, uncompressed_size=head["src_size"])
    return head, np.unpackbits(np.frombuffer(raw, np.uint8)).reshape(LAYERS, CHUNK, CHUNK).astype(bool)


def world_visible(blobs, wx, wy, wz) -> bool:
    """¿Está pintado el vóxel del mundo (wx, wy, wz) en alguno de los trozos?"""
    for blob in blobs:
        head, grid = chunk_grid(blob)
        cx, cy, cz = (int(v) for v in head["key"].split(","))
        lx, ly, lz = wx - cx * CHUNK, wy - cy * CHUNK, wz - (cz * LAYERS - Z_BASE)
        if 0 <= lx < CHUNK and 0 <= ly < CHUNK and 0 <= lz < LAYERS and grid[lz, ly, lx]:
            return True
    return False


WALL = [(100, y, z) for y in range(10, 50) for z in range(5, 20)]          # pared fija
GHOST = [(30 + i, 30 + j, 8 + k) for i in range(3) for j in range(3) for k in range(3)]  # «persona» que pasa


# ------------------------------------------------------------------ live_stream
def test_live_frame_lleva_los_bytes_originales():
    f = generate_frames(1, seed=3)[0]
    head, body = parse_lvx(live_frame(f.meta, f.payload))
    assert head["type"] == "LIDAR_VOXELS" and body == f.payload
    assert head["origin"] == pytest.approx(f.meta["origin"]) and head["src_size"] == f.meta["src_size"]
    assert head["resolution"] == pytest.approx(0.05) and head["frame_id"] == f.meta["frame_id"]


@pytest.mark.parametrize("meta", [
    {"origin": [0, 0], "resolution": 0.05, "src_size": 2048},
    {"origin": [0, 0, 0], "resolution": 0, "src_size": 2048},
    {"origin": [0, 0, float("nan")], "resolution": 0.05, "src_size": 2048},
    {"origin": [0, 0, 0], "resolution": 0.05, "src_size": -1},
    {"resolution": 0.05, "src_size": 2048},
])
def test_live_frame_descarta_metadatos_invalidos(meta):
    assert raw_frame_fields(meta) is None and live_frame(meta, b"x") is None


def test_pose_del_lidar_con_rumbo():
    yaw = math.radians(90)
    data = {"header": {"frame_id": "odom"},
            "pose": {"position": {"x": 1.0, "y": -2.0, "z": 0.3},
                     "orientation": {"x": 0.0, "y": 0.0, "z": math.sin(yaw / 2), "w": math.cos(yaw / 2)}}}
    p = pose_from_robot_pose(data)
    assert (p["x"], p["y"], p["z"], p["frame_id"]) == (1.0, -2.0, 0.3, "odom")
    assert p["yaw"] == pytest.approx(yaw)
    assert pose_from_robot_pose({"pose": {"position": {"x": 1}}}) is None
    assert pose_from_robot_pose("no") is None


# --------------------------------------------------------------------- slam_map
def test_acumulado_conserva_lo_fijo_y_quita_lo_que_pasa():
    slam = SlamMap()
    for i in range(10):
        raw, size = window(WALL + (GHOST if i == 0 else []))
        slam.update_raw(raw, size, ORIGIN, RES)
    blobs = slam.changed_frames()
    assert blobs and slam.meta()["voxels"] > 0
    # vóxel de ventana (x, y, z) → mundo (x − 64, y − 64, z − 10)
    assert world_visible(blobs, 100 - 64, 20 - 64, 10 - 10)
    assert not world_visible(blobs, 31 - 64, 31 - 64, 9 - 10)            # salió en 1 de 10 mapas
    head, _ = parse_lvx(blobs[0])
    assert head["type"] == "SLAM_CHUNK" and head["epoch"] == slam.epoch


def test_acumulado_junta_lo_que_el_perro_ya_no_ve():
    slam = SlamMap()
    raw, size = window(WALL)
    for _ in range(3):
        slam.update_raw(raw, size, ORIGIN, RES)
    moved = [ORIGIN[0] + 3.0, ORIGIN[1], ORIGIN[2]]                       # 3 m más allá en x
    for _ in range(3):
        slam.update_raw(*window([(10, 10, 5), (10, 11, 5), (11, 10, 5), (11, 11, 5)]), moved, RES)
    slam.changed_frames()
    blobs, _ = slam.frames_since(0)
    assert world_visible(blobs, 100 - 64, 20 - 64, 0)                     # la pared sigue ahí
    assert world_visible(blobs, 10 - 64 + 60, 10 - 64, 5 - 10)            # y lo nuevo también


def test_frames_since_sirve_a_varios_visores_sin_colas():
    slam = SlamMap()
    raw, size = window(WALL)
    slam.update_raw(raw, size, ORIGIN, RES)
    slam.update_raw(raw, size, ORIGIN, RES)
    first = slam.changed_frames()
    full, seq = slam.frames_since(0)
    assert len(full) == len(first) and seq > 0
    assert slam.frames_since(seq) == ([], seq)                            # nada nuevo
    slam.update_raw(*window(WALL + [(101, 20, 10), (101, 21, 10)]), ORIGIN, RES)
    slam.update_raw(*window(WALL + [(101, 20, 10), (101, 21, 10)]), ORIGIN, RES)
    changed = slam.changed_frames()
    newer, seq2 = slam.frames_since(seq)
    assert changed and set(newer) == set(changed) and seq2 > seq


def test_borrar_empieza_otro_mapa_y_valida_la_rejilla():
    slam = SlamMap()
    epoch = slam.epoch
    slam.update_raw(*window(WALL), ORIGIN, RES)
    slam.reset()
    assert slam.epoch != epoch and slam.frames_since(0) == ([], 0) and slam.meta()["frames"] == 0
    with pytest.raises(ValueError):
        slam.update_raw(lz4.block.compress(b"\x00" * 100, store_size=False), 100, ORIGIN, RES)


def test_otra_resolucion_no_se_mezcla():
    slam = SlamMap()
    slam.update_raw(*window(WALL), ORIGIN, RES)
    slam.update_raw(*window(WALL), ORIGIN, 0.1)
    assert slam.meta()["frames"] == 1


# ---------------------------------------------------------------- /ws/lidar
def _inject_frame_and_pose(lib):
    subs = lib.instances[0].datachannel.pub_sub.subscriptions
    f = generate_frames(1, seed=5)[0]
    subs[LIDAR_VOXEL_COMPRESSED]({"type": "msg", "topic": LIDAR_VOXEL_COMPRESSED,
                                  "data": {**f.meta, "data": PassthroughLidarDecoder().decode(f.payload, f.meta)}})
    subs[ROBOT_POSE]({"type": "msg", "topic": ROBOT_POSE, "data": {
        "header": {"frame_id": "odom"},
        "pose": {"position": {"x": 0.5, "y": 0.0, "z": 0.3}, "orientation": {"x": 0, "y": 0, "z": 0, "w": 1}}}})
    return f


def _receive_until(wsc, want, limit=20):
    got = {}
    for _ in range(limit):
        msg = wsc.receive()
        if msg.get("bytes"):
            head, body = parse_lvx(msg["bytes"])
            got.setdefault(head["type"], (head, body))
        elif msg.get("text"):
            data = json.loads(msg["text"])
            got.setdefault(data["type"], data)
        if want <= set(got):
            return got
    raise AssertionError(f"no llegó {want - set(got)}; llegó {set(got)}")


def test_ws_lidar_en_vivo_pose_y_acumulado_sin_enviar_nada_al_robot(tmp_path):
    from test_dashboard_server import build

    client, service, lib = build(tmp_path)
    client.post("/api/connect")
    f = _inject_frame_and_pose(lib)
    channel = lib.instances[0].datachannel.channel
    sent_before = len(channel.sent)
    with client.websocket_connect("/ws/lidar") as wsc:
        wsc.send_json({"mode": "live"})
        got = _receive_until(wsc, {"LIDAR_VOXELS", "POSE"})
        head, body = got["LIDAR_VOXELS"]
        assert body == f.payload and head["origin"] == pytest.approx(f.meta["origin"])
        assert got["POSE"]["x"] == 0.5 and got["POSE"]["frame_id"] == "odom"

        for _ in range(2):                       # el hilo SLAM lo hace solo; aquí, directo
            service.slam_step(f.meta, f.payload)
        wsc.send_json({"mode": "slam"})
        got = _receive_until(wsc, {"SLAM_INFO", "SLAM_CHUNK"})
        assert got["SLAM_INFO"]["evidence_class"] == "derived"
        assert got["SLAM_CHUNK"][0]["epoch"] == got["SLAM_INFO"]["epoch"]

        epoch = service.slam.epoch
        wsc.send_json({"type": "SLAM_RESET"})
        for _ in range(20):
            msg = wsc.receive()
            if msg.get("text") and json.loads(msg["text"]).get("epoch") not in (None, epoch):
                break
        else:
            raise AssertionError("el visor no recibió el mapa nuevo tras borrar")
        wsc.send_json({"mode": "off"})
    assert len(channel.sent) == sent_before      # el visor no ha mandado nada al robot
    assert client.get("/api/status").json()["slam"]["evidence_class"] == "derived"
    client.post("/api/disconnect")
