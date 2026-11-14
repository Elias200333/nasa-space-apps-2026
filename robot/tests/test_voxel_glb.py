"""GLB del mapa de vóxeles (lidar/voxel_glb.py): se ve como el visor del dashboard.

Datos SINTÉTICOS (vóxeles inventados para la prueba); aquí no hay robot.
"""

import struct
import zlib
from datetime import datetime, timezone

import numpy as np
import pytest

from terrainx_robot.lidar.accumulator import AccumulatedCloud
from terrainx_robot.lidar.voxel_glb import (
    ATLAS_H,
    ATLAS_W,
    BORDER,
    CELL,
    EDGE_RGB,
    PAD,
    TILE,
    atlas_png,
    atlas_rgb,
    build_voxel_glb,
    read_glb,
    robot_to_gltf,
    tile_uv_box,
)
from terrainx_robot.lidar.voxel_mesh import PALETTE, band, build_voxel_mesh
from terrainx_robot.models import DeliveryMode, EvidenceClass, PointType, RobotDescriptor, ScanContext
from terrainx_robot.storage.scan_store import ScanStore, ScanStoreError

RES = 0.05


def _arrays(data):
    """(gltf, posiciones (V, 3), uv (V, 2), índices (T, 3)) de un GLB."""
    gltf, binary = read_glb(data)
    views, acc = gltf["bufferViews"], gltf["accessors"]

    def get(i, dtype, width):
        v = views[acc[i]["bufferView"]]
        a = np.frombuffer(binary, dtype=dtype, count=acc[i]["count"] * width, offset=v["byteOffset"])
        return a.reshape(-1, width) if width > 1 else a

    return gltf, get(0, "<f4", 3), get(1, "<f4", 2), get(2, "<u4", 1).reshape(-1, 3)


def test_un_cubo_glb_valido_sin_luz_y_con_textura():
    glb = build_voxel_glb(np.array([[0, 0, 0]]), RES)
    data = glb.data
    assert data[:4] == b"glTF" and struct.unpack_from("<II", data, 4) == (2, len(data))
    gltf, pos, uv, tri = _arrays(data)
    assert (glb.voxels, glb.cube_faces, glb.vertices, glb.triangles) == (1, 6, 24, 12)
    assert pos.shape == (24, 3) and uv.shape == (24, 2) and tri.shape == (12, 3)
    mat = gltf["materials"][0]
    assert "KHR_materials_unlit" in gltf["extensionsUsed"] and "KHR_materials_unlit" in mat["extensions"]
    assert mat["doubleSided"] is True                        # como el visor (DoubleSide)
    assert mat["pbrMetallicRoughness"]["baseColorTexture"] == {"index": 0}
    s = gltf["samplers"][0]
    assert s["magFilter"] == 9728 and s["minFilter"] == 9987   # de cerca, aristas nítidas
    img_view = gltf["bufferViews"][gltf["images"][0]["bufferView"]]
    png = read_glb(data)[1][img_view["byteOffset"]:img_view["byteOffset"] + img_view["byteLength"]]
    assert png[:8] == b"\x89PNG\r\n\x1a\n" and gltf["images"][0]["mimeType"] == "image/png"
    # el cubo k = 0 va de −½·res a +½·res en cada eje; min/max del accesor exactos
    assert np.allclose(pos.min(axis=0), -RES / 2) and np.allclose(pos.max(axis=0), RES / 2)
    assert gltf["accessors"][0]["min"] == pos.min(axis=0).tolist()
    assert gltf["accessors"][0]["max"] == pos.max(axis=0).tolist()
    for view in gltf["bufferViews"]:
        assert view["byteOffset"] % 4 == 0


def test_ejes_z_del_robot_es_y_de_gltf_sin_espejo():
    for k, expected in (((10, 0, 0), (0.5, 0, 0)), ((0, 10, 0), (0, 0, -0.5)), ((0, 0, 10), (0, 0.5, 0))):
        _, pos, _, _ = _arrays(build_voxel_glb(np.array([k]), RES).data)
        assert np.allclose(pos.mean(axis=0), expected, atol=1e-6), k
    m = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]])        # (x, y, z) → (x, z, −y)
    assert round(np.linalg.det(m)) == 1                     # giro, no espejo: las caras siguen hacia fuera
    assert np.allclose(robot_to_gltf(np.eye(3)), m.T)


def test_mismos_cubos_que_el_ply_y_normales_hacia_fuera():
    rng = np.random.default_rng(3)
    vox = np.unique(rng.integers(-12, 12, size=(900, 3)), axis=0)
    mesh = build_voxel_mesh(vox, RES)
    glb = build_voxel_glb(vox, RES)
    assert (glb.voxels, glb.cube_faces, glb.triangles) == (mesh.voxels, mesh.cube_faces, mesh.triangles.shape[0])
    _, pos, _, tri = _arrays(glb.data)
    # centros de las caras, de vuelta a ejes del robot: los mismos que los del PLY
    back = np.column_stack((pos[:, 0], -pos[:, 2], pos[:, 1])).astype(np.float64)
    quads = back.reshape(-1, 4, 3)
    glb_centers = {tuple(c) for c in np.round(quads.mean(axis=1) / RES * 2).astype(int).tolist()}
    q = mesh.triangles.reshape(-1, 2, 3)
    ply_quads = mesh.vertices[np.column_stack((q[:, 0, 0], q[:, 0, 1], q[:, 0, 2], q[:, 1, 2]))]
    ply_centers = {tuple(c) for c in np.round(ply_quads.mean(axis=1) / RES * 2).astype(int).tolist()}
    assert glb_centers == ply_centers
    # normal de cada triángulo (en ejes de glTF): apunta lejos del centro de su vóxel
    occupied = {tuple(v) for v in vox.tolist()}
    p = pos.astype(np.float64)
    a, b, c = p[tri[:, 0]], p[tri[:, 1]], p[tri[:, 2]]
    n = np.cross(b - a, c - a)
    centroid = (a + b + c) / 3
    inside = centroid - n / np.linalg.norm(n, axis=1, keepdims=True) * RES / 4
    inside_robot = np.column_stack((inside[:, 0], -inside[:, 2], inside[:, 1]))
    k_in = np.rint(inside_robot / RES).astype(int)
    assert all(tuple(k) in occupied for k in k_in.tolist())   # detrás de cada cara hay un vóxel


def test_uv_en_la_casilla_de_su_franja():
    vox = np.array([[0, 0, -9], [5, 5, 0], [10, 10, 21], [15, 15, 40]])   # franjas 0, 9, 30 y 30 (tope)
    _, pos, uv, _ = _arrays(build_voxel_glb(vox, RES).data)
    c = pos.reshape(-1, 4, 3).astype(np.float64).mean(axis=1)
    c = np.column_stack((c[:, 0], -c[:, 2], c[:, 1]))                       # de vuelta a ejes del robot
    owner = np.argmin(np.linalg.norm(c[:, None, :] - vox[None, :, :] * RES, axis=2), axis=1)   # vóxel de cada cara
    assert np.bincount(owner).tolist() == [6, 6, 6, 6]
    assert [int(band(z)) for z in vox[:, 2]] == [0, 9, 30, 30]
    for f_uv, k in zip(uv.reshape(-1, 4, 2).astype(np.float64), owner):
        u0, v0, u1, v1 = tile_uv_box(int(band(vox[k, 2])))
        assert np.allclose(np.sort(np.unique(np.round(f_uv[:, 0], 6))), [u0, u1], atol=1e-6)
        assert np.allclose(np.sort(np.unique(np.round(f_uv[:, 1], 6))), [v0, v1], atol=1e-6)


def test_textura_paleta_con_arista_gris_de_1_32():
    img = atlas_rgb()
    assert img.shape == (ATLAS_H, ATLAS_W, 3) and BORDER * 32 == TILE
    for b in (0, 9, 30):
        r, c = divmod(b, 8)
        y, x = r * CELL + PAD, c * CELL + PAD
        tile = img[y:y + TILE, x:x + TILE]
        assert (tile[BORDER:-BORDER, BORDER:-BORDER] == PALETTE[b]).all()       # el color de la app
        assert (tile[:BORDER] == EDGE_RGB).all() and (tile[:, -BORDER:] == EDGE_RGB).all()   # arista gris
        assert (img[r * CELL, c * CELL] == PALETTE[b]).all()                    # alrededor: su color
    # el PNG embebido es exactamente esa imagen
    png = atlas_png()
    w, h = struct.unpack(">II", png[16:24])
    idat, off = b"", 8
    while off < len(png):
        n, tag = struct.unpack(">I4s", png[off:off + 8])
        if tag == b"IDAT":
            idat += png[off + 8:off + 8 + n]
        off += 12 + n
    rows = np.frombuffer(zlib.decompress(idat), np.uint8).reshape(h, 1 + w * 3)
    assert (w, h) == (ATLAS_W, ATLAS_H) and (rows[:, 0] == 0).all()
    assert (rows[:, 1:].reshape(h, w, 3) == img).all()


def test_errores():
    with pytest.raises(ValueError):
        build_voxel_glb(np.empty((0, 3), int), RES)
    with pytest.raises(ValueError):
        build_voxel_glb(np.array([[0, 0, 0]]), 0.0)
    with pytest.raises(ValueError):
        read_glb(b"ply\nformat")


def _cloud_and_glb():
    vox = np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0]])
    mesh = build_voxel_mesh(vox, RES)
    cloud = AccumulatedCloud(points=mesh.vertices, mode="accumulate", topic="t", frame_id="odom", resolution=RES,
                             point_type=PointType.VOXEL_MESH, decoder="test", frames_received=1, frames_used=1,
                             frames_rejected=0, rejection_reasons={}, first_info=None, last_info=None,
                             faces=mesh.triangles, colors=mesh.colors)
    return cloud, build_voxel_glb(vox, RES).data


def _save(store, cloud, extra):
    now = datetime.now(timezone.utc)
    robot = RobotDescriptor(robot_id="test", platform="unitree_go2", body="earth", adapter="test",
                            delivery_mode=DeliveryMode.LIVE)
    return store.save(cloud, robot=robot, evidence_class=EvidenceClass.SYNTHETIC_TEST,
                      delivery_mode=DeliveryMode.LIVE, scan_context=ScanContext.CONTROLLED_TEST,
                      capture_start=now, capture_end=now, extra_files=extra)


def test_almacen_guarda_el_glb_con_su_sha256_y_detecta_cambios(tmp_path):
    store = ScanStore(tmp_path)
    cloud, data = _cloud_and_glb()
    meta = _save(store, cloud, {"glb": (".glb", data, "GLB de prueba")})
    folder = tmp_path / "scans" / meta.id
    assert meta.files["glb"].path == f"{meta.id}.glb" and meta.files["glb"].bytes == len(data)
    assert (folder / f"{meta.id}.glb").read_bytes() == data
    sums = (folder / "SHA256SUMS").read_text().splitlines()
    assert len(sums) == 3 and sums[1].endswith(f"  {meta.id}.glb")
    assert store.verify(meta.id)["ok"]
    (folder / f"{meta.id}.glb").write_bytes(data[:-4] + b"\0\0\0\1")    # alguien toca el GLB
    check = store.verify(meta.id)
    assert check["ok"] is False and check["files"]["glb"]["actual"] != check["files"]["glb"]["expected"]
    for bad in ({"ply": (".glb", data, "x")}, {"glb": ("glb", data, "x")}, {"glb": (".ply", data, "x")},
                {"glb": (".glb", b"", "x")}, {"../x": (".glb", data, "x")}):
        with pytest.raises(ScanStoreError):
            _save(store, cloud, bad)
