"""Mapa SLAM como array de coordenadas (.coords.json): un punto por cubo del visor.

Vóxeles SINTÉTICOS (aquí no hay robot).
"""

import json
from datetime import datetime, timezone

import numpy as np
import pytest

from terrainx_robot.lidar.accumulator import AccumulatedCloud
from terrainx_robot.lidar.voxel_coords import build_coords_json, voxel_centers
from terrainx_robot.lidar.voxel_mesh import build_voxel_mesh
from terrainx_robot.models import DeliveryMode, EvidenceClass, PointType, RobotDescriptor, ScanContext
from terrainx_robot.storage.scan_store import ScanStore, ScanStoreError

RES = 0.05


def test_centro_de_cada_cubo_sin_repetidos_y_ordenado():
    vox = np.array([[2, 0, 1], [-3, 5, 0], [2, 0, 1], [0, 0, 0], [2, -1, 4]])
    pts = voxel_centers(vox, RES)
    assert pts.tolist() == [[-0.15, 0.25, 0.0], [0.0, 0.0, 0.0], [0.1, -0.05, 0.2], [0.1, 0.0, 0.05]]
    assert voxel_centers(np.empty((0, 3), int), RES).shape == (0, 3)


def test_los_cubos_de_las_coordenadas_son_los_de_la_malla():
    """Centro ± res/2 cubre exactamente la caja de la malla PLY/GLB, también con cubos interiores."""
    rng = np.random.default_rng(3)
    vox = np.unique(rng.integers(-20, 20, size=(800, 3)), axis=0)
    solid = np.array([[x, y, z] for x in range(3) for y in range(3) for z in range(3)])   # el (1,1,1) no se ve
    vox = np.unique(np.vstack([vox, solid + 50]), axis=0)
    data = json.loads(build_coords_json(vox, RES))
    pts = np.array(data["points"])
    mesh = build_voxel_mesh(vox, RES)
    assert data["count"] == len(pts) == len(vox) == mesh.voxels             # también los interiores
    assert np.allclose(pts.min(axis=0) - RES / 2, mesh.vertices.min(axis=0), atol=1e-6)
    assert np.allclose(pts.max(axis=0) + RES / 2, mesh.vertices.max(axis=0), atol=1e-6)
    assert [2.55, 2.55, 2.55] in data["points"]                              # el cubo interior está


def test_formato_del_json():
    raw = build_coords_json(np.array([[1, 2, 3], [0, 0, 0]]), RES,
                            info={"scan_id": "scan-x", "evidence_class": "derived", "demo": False})
    data = json.loads(raw)
    assert list(data)[:3] == ["scan_id", "evidence_class", "demo"]           # los datos del escaneo, delante
    assert data["unit"] == "m" and data["units_verification"] == "unverified" and data["cube_size_m"] == RES
    assert data["points"] == [[0.0, 0.0, 0.0], [0.05, 0.1, 0.15]]          # sin 0.15000000000000002
    text = raw.decode("utf-8")
    assert "\n    [0.0, 0.0, 0.0],\n    [0.05, 0.1, 0.15]\n  ]\n}" in text  # un punto por línea
    assert "−" in text                                                       # UTF-8, sin escapes \u


def test_errores():
    with pytest.raises(ValueError):
        build_coords_json(np.empty((0, 3), int), RES)
    with pytest.raises(ValueError):
        build_coords_json(np.array([[0, 0, 0]]), 0.0)
    with pytest.raises(ValueError):
        voxel_centers(np.array([[0, 0, 0]]), float("nan"))


def _cloud(vox):
    mesh = build_voxel_mesh(vox, RES)
    return AccumulatedCloud(points=mesh.vertices, mode="accumulate", topic="t", frame_id="odom", resolution=RES,
                            point_type=PointType.VOXEL_MESH, decoder="test", frames_received=1, frames_used=1,
                            frames_rejected=0, rejection_reasons={}, first_info=None, last_info=None,
                            faces=mesh.triangles, colors=mesh.colors)


def _save(store, cloud, extra, scan_id=None):
    now = datetime.now(timezone.utc)
    robot = RobotDescriptor(robot_id="test", platform="unitree_go2", body="earth", adapter="test",
                            delivery_mode=DeliveryMode.LIVE)
    return store.save(cloud, robot=robot, evidence_class=EvidenceClass.SYNTHETIC_TEST,
                      delivery_mode=DeliveryMode.LIVE, scan_context=ScanContext.CONTROLLED_TEST,
                      capture_start=now, capture_end=now, extra_files=extra, scan_id=scan_id)


def test_almacen_guarda_las_coordenadas_con_su_id_y_sha256(tmp_path):
    store = ScanStore(tmp_path)
    vox = np.array([[0, 0, 0], [1, 0, 0]])
    data = build_coords_json(vox, RES, info={"scan_id": "scan-elegido-1"})
    meta = _save(store, _cloud(vox), {"coords": (".coords.json", data, "JSON")}, scan_id="scan-elegido-1")
    folder = tmp_path / "scans" / "scan-elegido-1"
    assert meta.id == "scan-elegido-1" and meta.files["coords"].path == "scan-elegido-1.coords.json"
    assert (folder / "scan-elegido-1.coords.json").read_bytes() == data
    assert (folder / "scan-elegido-1.metadata.json").is_file()            # no lo pisa
    assert store.verify(meta.id)["ok"]
    with pytest.raises(ScanStoreError):                                    # nunca reutiliza una carpeta…
        _save(store, _cloud(vox), {}, scan_id="scan-elegido-1")
    assert store.verify(meta.id)["ok"]                                     # …ni toca la que había
    for bad_id in ("../fuera", "a/b", "", ".oculto"):
        with pytest.raises(ScanStoreError):
            _save(store, _cloud(vox), {}, scan_id=bad_id)
    for bad in ({"coords": (".metadata.json", data, "x")}, {"coords": (".json", data, "x")},
                {"coords": (".a.ply", data, "x")}, {"coords": (".a.b.c", data, "x")},
                {"coords": (".coords.JSON", data, "x")}):
        with pytest.raises(ScanStoreError):
            _save(store, _cloud(vox), bad)
