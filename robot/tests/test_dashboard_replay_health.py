"""Panel «Estado del robot», guardar el mapa acumulado (descarga del visor), RecoveryStand y modo replay.

Todo con el robot FALSO y sesiones SINTÉTICAS (no hay robot aquí).
"""

import json
import time

import numpy as np
from fastapi.testclient import TestClient

from conftest import make_fake_go2_lib
from terrainx_robot.adapters.go2_webrtc import Go2WebRTCAdapter
from terrainx_robot.config import Go2Settings, Settings
from terrainx_robot.dashboard import robot_details as rd
from terrainx_robot.dashboard.server import create_app
from terrainx_robot.dashboard.service import DashboardService
from terrainx_robot.fixtures.synthetic import generate_frames, write_synthetic_session
from terrainx_robot.lidar.voxel_codec import decode_voxel_map
from terrainx_robot.storage.scan_store import ScanStore

LOWSTATE = {"bms_state": {"soc": 18, "current": -2310, "cycle": 41, "bq_ntc": [27, 26], "mcu_ntc": [31, 30]},
            "power_v": 28.29}
LIDAR_STATE = {"dirty_percentage": 3, "cloud_packet_loss_rate": 0, "imu_packet_loss_rate": 1, "error_state": 0,
               "firmware_version": "1.2.3", "software_version": "x", "sdk_version": "y", "cloud_frequency": 7.7,
               "sys_rotation_speed": 600.0}
MULTIPLE = {"brightness": 0, "obstaclesAvoidSwitch": True, "volume": 5}


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
    return create_app(settings, service=service), service, lib, settings


def inject(lib, topic, data):
    lib.instances[0].datachannel.pub_sub.subscriptions[topic]({"type": "msg", "topic": topic, "data": data})


def wait_for(cond, timeout=6.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if cond():
            return True
        time.sleep(0.05)
    return False


# ------------------------------------------------------------- robot_details
def test_bateria_umbrales_y_campos_que_faltan():
    assert rd.battery({"rt/lf/lowstate": LOWSTATE})["level"] == "low"
    assert rd.battery({"rt/lf/lowstate": {"bms_state": {"soc": 9}}})["level"] == "critical"
    assert rd.battery({"rt/lf/lowstate": {"bms_state": {"soc": 80}}})["level"] == "ok"
    vacio = rd.battery({})
    assert vacio["level"] == "unknown" and vacio["soc_pct"] is None and vacio["power_v"] is None
    b = rd.battery({"rt/lf/lowstate": LOWSTATE})
    assert (b["soc_pct"], b["power_v"], b["current_raw"], b["cycles"]) == (18.0, 28.29, -2310.0, 41.0)
    assert b["bms_temp_raw"] == [27.0, 26.0] and b["mcu_temp_raw"] == [31.0, 30.0]


def test_lidar_ajustes_y_salud_de_flujos():
    l = rd.lidar_state({"rt/utlidar/lidar_state": LIDAR_STATE})
    assert l["dirty_pct"] == 3.0 and l["imu_packet_loss_pct"] == 1.0 and l["firmware_version"] == "1.2.3"
    assert rd.lidar_state({})["available"] is False
    assert rd.robot_settings({"rt/multiplestate": MULTIPLE})["obstacle_avoidance"] is True
    assert rd.robot_settings({"rt/multiplestate": {"obstaclesAvoidSwitch": "sí"}})["obstacle_avoidance"] is None
    obs = [type("O", (), {"topic": "a", "rate_hz": 20.0, "messages": 100})(),
           type("O", (), {"topic": "b", "rate_hz": 0.4, "messages": 3})()]
    h = {t["topic"]: t for t in rd.topic_health(obs, {"a": 99.9, "b": 95.0}, ["a", "b", "c"], now=100.0)}
    assert h["a"]["state"] == "ok"                 # hace 0,1 s
    assert h["b"]["state"] == "ok"                 # 5 s, pero a 0,4 Hz el límite es 7,5 s
    assert h["c"]["state"] == "no_data"
    h2 = {t["topic"]: t for t in rd.topic_health(obs, {"a": 90.0}, ["a"], now=100.0)}
    assert h2["a"]["state"] == "stale"


# ----------------------------------------------------- estado en el dashboard
def test_estado_del_robot_en_status_y_recuperarse(tmp_path):
    app, service, lib, _ = build(tmp_path)
    client = TestClient(app)
    client.post("/api/connect")
    inject(lib, "rt/lf/lowstate", LOWSTATE)
    inject(lib, "rt/utlidar/lidar_state", LIDAR_STATE)
    inject(lib, "rt/multiplestate", json.dumps(MULTIPLE))      # llega como texto JSON, como en el robot
    s = client.get("/api/status").json()
    d = s["robot_details"]
    assert s["source"] == {"kind": "live"}
    assert d["battery"]["level"] == "low" and d["battery"]["soc_pct"] == 18.0
    assert d["lidar"]["dirty_pct"] == 3.0 and d["settings"]["obstacle_avoidance"] is True
    states = {t["topic"]: t["state"] for t in d["topics"]}
    assert states["rt/lf/lowstate"] == "ok" and states["rt/utlidar/voxel_map_compressed"] == "no_data"

    with client.websocket_connect("/ws/control") as wsc:      # WASD activo por defecto
        wsc.send_json({"type": "posture", "command": "RecoveryStand"})
        assert wsc.receive_json()["ok"] is True
    sent = [json.loads(m) for m in lib.instances[0].datachannel.channel.sent]
    assert 1006 in [m["data"]["header"]["identity"]["api_id"] for m in sent if m.get("type") == "req"]
    client.post("/api/disconnect")


def test_conexion_perdida_no_deja_conducir(tmp_path):
    """Visto con Pluffy (batería 11 %): WebRTC «closed» y el dashboard seguía ofreciendo el control."""
    from terrainx_robot.models import ConnectionState
    app, service, lib, _ = build(tmp_path)
    client = TestClient(app)
    client.post("/api/connect")
    assert client.get("/api/status").json()["control_available"] is True
    service.adapter._set_connection_state(ConnectionState.DISCONNECTED, "conexión WebRTC perdida (estado: closed)")
    s = client.get("/api/status").json()
    assert s["control_available"] is False and s["control_enabled"] is False and s["connected"] is False
    with client.websocket_connect("/ws/control") as wsc:
        wsc.send_json({"type": "drive", "vx": 0.3, "vy": 0.0, "yaw": 0.0})
        assert wsc.receive_json()["ok"] is False
    sent = [json.loads(m) for m in lib.instances[0].datachannel.channel.sent]
    assert 1008 not in [m["data"]["header"]["identity"]["api_id"] for m in sent if m.get("type") == "req"]


# ----------------------------------------------------- guardar el acumulado
def test_guardar_el_mapa_acumulado_como_malla_derivada(tmp_path):
    app, service, lib, _ = build(tmp_path)
    client = TestClient(app)
    assert client.post("/api/slam/save").status_code == 409            # sin robot: no hay mapa
    client.post("/api/connect")
    f = generate_frames(1, seed=9)[0]
    # Origen como lo manda el Go2 real: (k − ½)·res (medido con Pluffy: [-3.325, -3.025, -0.575])
    f.meta["origin"] = [-64.5 * 0.05, -64.5 * 0.05, -12.5 * 0.05]
    for _ in range(3):
        service.slam_step(f.meta, f.payload)
    r = client.post("/api/slam/save")
    assert r.status_code == 200, r.text
    m = r.json()
    assert m["evidence_class"] == "derived" and m["demo"] is False and m["delivery_mode"] == "live"
    assert m["geometry"]["point_type"] == "voxel_mesh" and set(m["files"]) == {"ply", "glb", "coords"}
    assert m["frame_id"] == f.meta["frame_id"] and m["point_count"] == m["provenance"]["mesh"]["vertices"] > 0
    assert any("ACUMULADO" in c for c in m["caveats"]) and any("MALLA" in c for c in m["caveats"])
    assert m["provenance"]["slam"]["frames"] == 3
    assert m["id"] in [x["id"] for x in client.get("/api/scans").json()]
    # la malla tiene un cubo por vóxel del mapa, y esos vóxeles son los del mapa del robot
    assert m["provenance"]["mesh"]["voxels"] == service.slam.export_points().shape[0]
    live = {tuple(p) for p in np.round(decode_voxel_map(f.payload, f.meta["src_size"], f.meta["origin"],
                                                          f.meta["resolution"]).points, 4).tolist()}
    exported = {tuple(p) for p in np.round(service.slam.export_points(), 4).tolist()}
    assert exported and exported <= live and len(exported) >= 0.95 * len(live)
    client.post("/api/disconnect")


def test_origen_fuera_de_la_rejilla_se_ajusta_como_mucho_medio_voxel():
    """El acumulado (portado del Bridge) supone origen = (k − ½)·res, como manda el robot real.
    Con otro origen (p. ej. el de los datos sintéticos, −3,2 m) ajusta a la rejilla: ≤ ½ vóxel."""
    from terrainx_robot.lidar.slam_map import SlamMap
    f = generate_frames(1, seed=9)[0]                    # origen sintético (−3.2, −3.2, −0.6)
    slam = SlamMap()
    for _ in range(3):
        slam.update_raw(f.payload, f.meta["src_size"], f.meta["origin"], f.meta["resolution"])
    live = decode_voxel_map(f.payload, f.meta["src_size"], f.meta["origin"], f.meta["resolution"]).points
    exported = slam.export_points()
    shift = exported.min(axis=0) - live.min(axis=0)
    assert np.all(np.abs(shift) <= 0.025 + 1e-9)


# ------------------------------------------------------------------ replay
def test_replay_de_sesion_sintetica_sin_control(tmp_path):
    app, service, lib, settings = build(tmp_path)
    info = write_synthetic_session(settings.data_dir / "sessions", n_frames=6, seed=11)
    with TestClient(app) as client:                     # un único bucle: el replay corre entre peticiones
        sessions = client.get("/api/sessions").json()
        assert [x["session_id"] for x in sessions] == [info.session_id]
        assert sessions[0]["demo"] is True and sessions[0]["evidence_class"] == "synthetic_test"

        assert client.post("/api/replay/start", json={"session_id": "../../etc"}).status_code == 409
        r = client.post("/api/replay/start", json={"session_id": info.session_id, "loop": True})
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["source"]["kind"] == "replay" and s["source"]["demo"] is True
        assert s["connected"] is True and s["control_enabled"] is False

        assert wait_for(lambda: client.get("/api/status").json().get("lidar_frames", 0) > 0)
        assert wait_for(lambda: client.get("/api/status").json()["slam"]["frames"] >= 2)
        s = client.get("/api/status").json()
        assert s["robot_details"]["battery"]["soc_pct"] is not None     # lowstate sintético
        assert s["slam"]["evidence_class"] == "synthetic_test"

        assert s["control_available"] is False                              # en replay no se conduce
        with client.websocket_connect("/ws/control") as wsc:
            wsc.send_json({"type": "drive", "vx": 0.3, "vy": 0.0, "yaw": 0.0})
            assert wsc.receive_json()["ok"] is False
        assert client.post("/api/connect").status_code == 409               # ni se conecta el robot
        assert client.post("/api/record/start").status_code == 409          # ni se graba una sesión de otra
        assert client.get("/api/status").json()["recording"] == {"active": False}
        assert wait_for(lambda: client.get("/api/status").json()["slam"]["frames"] >= 2)
        m = client.post("/api/slam/save").json()
        assert m["evidence_class"] == "synthetic_test" and m["demo"] is True and m["delivery_mode"] == "replay"
        assert m["geometry"]["point_type"] == "voxel_mesh" and m["capture"]["session_id"] == info.session_id
        glb = client.get(f"/api/scans/{m['id']}/download", params={"format": "glb"}).content
        from terrainx_robot.lidar.voxel_glb import read_glb
        extras = read_glb(glb)[0]["asset"]["extras"]
        assert extras["evidence_class"] == "synthetic_test" and extras["demo"] is True   # el GLB también lo dice
        coords = client.get(f"/api/scans/{m['id']}/download", params={"format": "coords"}).json()
        assert coords["evidence_class"] == "synthetic_test" and coords["demo"] is True   # y las coordenadas
        assert coords["delivery_mode"] == "replay" and coords["scan_id"] == m["id"]

        s = client.post("/api/replay/stop").json()
        assert s["source"]["kind"] == "none" and s["connected"] is False
    assert lib.instances == []                          # nunca se abrió una conexión al robot


def test_replay_no_arranca_con_el_robot_conectado(tmp_path):
    app, service, lib, settings = build(tmp_path)
    info = write_synthetic_session(settings.data_dir / "sessions", n_frames=2, seed=1)
    client = TestClient(app)
    client.post("/api/connect")
    r = client.post("/api/replay/start", json={"session_id": info.session_id})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "robot_connected"
    client.post("/api/disconnect")


def test_sesion_alterada_no_se_reproduce(tmp_path):
    app, service, lib, settings = build(tmp_path)
    info = write_synthetic_session(settings.data_dir / "sessions", n_frames=2, seed=1)
    msgs = settings.data_dir / "sessions" / info.session_id / "messages.jsonl"
    msgs.write_text(msgs.read_text(encoding="utf-8") + "\n", encoding="utf-8")   # cambia el SHA-256
    with TestClient(app) as client:
        r = client.post("/api/replay/start", json={"session_id": info.session_id})
        assert r.status_code == 409 and r.json()["detail"]["code"] == "session_integrity"
