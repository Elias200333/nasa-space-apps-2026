"""Dashboard: guardar el mapa SLAM desde el visor (PLY malla + GLB como el visor + coordenadas
JSON), congelarlo, y WASD activo por defecto.

Robot FALSO y mapas SINTÉTICOS (aquí no hay robot).
"""

import hashlib
import json
import time

from fastapi.testclient import TestClient

from terrainx_robot.adapters.go2_topics import LIDAR_VOXEL_COMPRESSED
from terrainx_robot.adapters.go2_webrtc import PassthroughLidarDecoder
from terrainx_robot.fixtures.synthetic import generate_frames
from terrainx_robot.lidar.voxel_glb import read_glb
import numpy as np

from terrainx_robot.storage.ply import read_ply
from test_dashboard_estado import build, wait_for


def _frame():
    f = generate_frames(1, seed=9)[0]
    f.meta["origin"] = [-64.5 * 0.05, -64.5 * 0.05, -12.5 * 0.05]     # como el Go2 real: (k − ½)·res
    return f


def _push(lib, sf):
    """Un mapa LiDAR con la misma forma que lo entrega la librería (llega al adaptador)."""
    lidar = lib.instances[0].datachannel.pub_sub.subscriptions[LIDAR_VOXEL_COMPRESSED]
    lidar({"type": "msg", "topic": LIDAR_VOXEL_COMPRESSED,
           "data": {**sf.meta, "data": PassthroughLidarDecoder().decode(sf.payload, sf.meta)}})


def _api_ids(lib):
    sent = [json.loads(m) for m in lib.instances[0].datachannel.channel.sent]
    return [m["data"]["header"]["identity"]["api_id"] for m in sent if m.get("type") == "req"]


# ----------------------------------------------------- guardar desde el visor
def test_descarga_del_visor_guarda_ply_glb_y_metadatos(tmp_path):
    """Lo que hace el operador: Conectar → el perro ve el entorno → botón de descarga del visor."""
    app, service, lib, settings = build(tmp_path)
    f = _frame()
    with TestClient(app) as client:
        assert client.post("/api/slam/save").status_code == 409          # sin robot: no hay mapa
        assert client.post("/api/connect").status_code == 200
        assert client.post("/api/slam/save").status_code == 409          # mapa vacío
        for _ in range(3):
            service.slam_step(f.meta, f.payload)
        r = client.post("/api/slam/save")
        assert r.status_code == 200, r.text
        m = r.json()
        assert m["reused"] is False
        assert m["geometry"]["point_type"] == "voxel_mesh" and m["evidence_class"] == "derived"
        assert m["delivery_mode"] == "live" and m["demo"] is False and m["capture"]["session_id"] is None
        assert m["capture"]["start_utc"] <= m["capture"]["end_utc"]
        mesh, glb = m["provenance"]["mesh"], m["provenance"]["glb"]
        assert set(m["files"]) == {"ply", "glb", "coords"} and m["files"]["glb"]["path"] == f"{m['id']}.glb"
        assert m["files"]["coords"]["path"] == f"{m['id']}.coords.json"
        assert mesh["voxels"] > 0 and m["point_count"] == mesh["vertices"]
        assert glb["cube_faces"] == mesh["cube_faces"] and glb["triangles"] == mesh["triangles"]
        assert m["provenance"]["coords"]["points"] == mesh["voxels"]
        assert any(".glb" in c and ".coords.json" in c for c in m["caveats"])
        assert service.store.verify(m["id"])["ok"]
        sums = (settings.data_dir / "scans" / m["id"] / "SHA256SUMS").read_text().splitlines()
        assert len(sums) == 4                                            # PLY, GLB, coordenadas y metadatos

        r = client.get(f"/api/scans/{m['id']}/download", params={"format": "glb"})   # lo que baja el navegador
        assert r.status_code == 200 and r.headers["content-type"] == "model/gltf-binary"
        assert hashlib.sha256(r.content).hexdigest() == m["files"]["glb"]["sha256"]
        gltf, _ = read_glb(r.content)
        extras = gltf["asset"]["extras"]
        assert extras["voxels"] == mesh["voxels"] and extras["evidence_class"] == "derived"
        assert extras["frame_id"] == m["frame_id"] and gltf["accessors"][0]["count"] == 4 * mesh["cube_faces"]
        assert extras["scan_id"] == m["id"]

        # Coordenadas: lo otro que ofrece el menú de descarga del visor
        r = client.get(f"/api/scans/{m['id']}/download", params={"format": "coords"})
        assert r.status_code == 200 and r.headers["content-type"].startswith("application/json")
        assert hashlib.sha256(r.content).hexdigest() == m["files"]["coords"]["sha256"]
        c = r.json()
        assert c["scan_id"] == m["id"] and c["evidence_class"] == "derived" and c["demo"] is False
        assert c["frame_id"] == m["frame_id"] and c["unit"] == "m" and c["cube_size_m"] == 0.05
        assert c["count"] == len(c["points"]) == mesh["voxels"]
        # un punto por vóxel del mapa: el centro del cubo que pinta el visor (k · res)
        idx, res = service.slam.export_voxels()
        assert np.allclose(np.array(sorted(map(tuple, c["points"]))), np.array(sorted(map(tuple, idx * res))))
        # y la caja de los cubos es la de la malla: centro ± res/2
        pts = np.array(c["points"])
        assert np.allclose(pts.min(axis=0) - res / 2, m["geometry"]["bounds_min"], atol=1e-6)
        assert np.allclose(pts.max(axis=0) + res / 2, m["geometry"]["bounds_max"], atol=1e-6)

        # Mapa sin cambios (p. ej. en pausa): bajar el otro formato NO crea otro escaneo
        again = client.post("/api/slam/save").json()
        assert again["reused"] is True and again["id"] == m["id"]
        assert len(client.get("/api/scans").json()) == 1
        service.slam_step(f.meta, f.payload)                             # entra un mapa nuevo: otro escaneo
        third = client.post("/api/slam/save").json()
        assert third["reused"] is False and third["id"] != m["id"]
        (settings.data_dir / "scans" / third["id"] / f"{third['id']}.coords.json").write_text("{}")
        fourth = client.post("/api/slam/save").json()                    # alterado: no se reutiliza
        assert fourth["reused"] is False and fourth["id"] != third["id"]

        r = client.get(f"/api/scans/{m['id']}/download")                 # el PLY sigue siendo el de siempre
        assert r.content.startswith(b"ply\nformat binary_little_endian 1.0\n")
        assert f"element face {mesh['triangles']}".encode() in r.content
        ply = tmp_path / "descargado.ply"
        ply.write_bytes(r.content)
        assert read_ply(ply).points.shape == (m["point_count"], 3)
        assert client.get(f"/api/scans/{m['id']}/download", params={"format": "obj"}).status_code == 404

        service._saving = True                                           # dos guardados a la vez: no
        assert client.post("/api/slam/save").status_code == 409
        service._saving = False
        # lo que ya no existe (el panel «Capturas y datos» / escaneo con inicio y fin)
        assert client.post("/api/scan/start").status_code in (404, 405)
        assert client.get("/api/slam/mesh.ply").status_code in (404, 405)
        client.post("/api/disconnect")


def test_el_mapa_se_puede_guardar_aunque_se_desconecte(tmp_path):
    """Si el perro corta (o se pulsa Desconectar), lo acumulado no se pierde."""
    app, service, lib, _ = build(tmp_path)
    client = TestClient(app)
    client.post("/api/connect")
    f = _frame()
    for _ in range(3):
        service.slam_step(f.meta, f.payload)
    client.post("/api/disconnect")
    assert client.get("/api/status").json()["connected"] is False
    r = client.post("/api/slam/save")
    assert r.status_code == 200, r.text
    assert r.json()["geometry"]["point_type"] == "voxel_mesh"


def test_pausa_congela_el_acumulado_y_se_reanuda_al_cerrar_el_visor(tmp_path):
    app, service, lib, _ = build(tmp_path)
    frames = generate_frames(4, seed=5)
    with TestClient(app) as client:
        client.post("/api/connect")
        with client.websocket_connect("/ws/lidar") as wl:
            wl.send_json({"type": "SLAM_PAUSE", "paused": True})
            assert wait_for(lambda: service.slam_paused)
            _push(lib, frames[0])
            time.sleep(1.2)                                            # > 2 vueltas del hilo del SLAM
            s = client.get("/api/status").json()["slam"]
            assert s["paused"] is True and s["frames"] == 0              # congelado: no se suma nada
            wl.send_json({"type": "SLAM_PAUSE", "paused": "sí"})         # basura: se ignora
            time.sleep(0.2)
            assert service.slam_paused is True
        assert wait_for(lambda: not service.slam_paused)                 # el visor que lo congeló se cerró
        _push(lib, frames[1])
        assert wait_for(lambda: service.slam.frames >= 1)
        client.post("/api/disconnect")
    assert not any(i in _api_ids(lib) for i in (1008, 1003))             # al robot no se le mandó nada


# ------------------------------------------------- grabar la sesión cruda
def test_wasd_activo_por_defecto_y_hombre_muerto_solo_en_marcha(tmp_path):
    app, service, lib, _ = build(tmp_path)
    client = TestClient(app)
    assert client.post("/api/connect").json()["control_available"] is True
    with client.websocket_connect("/ws/control") as wsc:
        time.sleep(0.9)                                    # sin teclas pulsadas: nada al robot
        ids = _api_ids(lib)
        assert 1008 not in ids and 1003 not in ids and service.adapter.control_enabled is False
        wsc.send_json({"type": "drive", "vx": 0.3, "vy": 0.0, "yaw": 0.0})
        r = wsc.receive_json()
        assert r["ok"] is True and r["control_enabled"] is True     # sin «Habilitar»
        assert 1008 in _api_ids(lib)
        # dejan de llegar órdenes con el robot en marcha -> StopMove (hombre muerto, 0,4 s)
        assert wait_for(lambda: 1003 in _api_ids(lib), timeout=2.0)
        stops = _api_ids(lib).count(1003)
        time.sleep(0.9)                                    # ya parado: no se repite
        assert _api_ids(lib).count(1003) == stops
    assert service.adapter.control_enabled is False         # al cerrar el canal: solo lectura
    client.post("/api/disconnect")


def test_desconectar_para_y_vuelve_a_solo_lectura(tmp_path):
    app, service, lib, _ = build(tmp_path)
    client = TestClient(app)
    client.post("/api/connect")
    with client.websocket_connect("/ws/control") as wsc:
        wsc.send_json({"type": "drive", "vx": 0.3, "vy": 0.0, "yaw": 0.0})
        wsc.receive_json()
        adapter = service.adapter
        client.post("/api/disconnect")
        assert adapter.control_enabled is False
        assert 1003 in _api_ids(lib)
