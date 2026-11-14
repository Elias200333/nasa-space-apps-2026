"""Malla de cubos del mapa SLAM (lidar/voxel_mesh.py) y su PLY (storage/ply.py). Sin robot."""

import numpy as np
import pytest

from terrainx_robot.fixtures.synthetic import generate_frames
from terrainx_robot.lidar.slam_map import SlamMap
from terrainx_robot.lidar.voxel_mesh import PALETTE, band, build_voxel_mesh
from terrainx_robot.storage.ply import PlyError, mesh_ply_bytes, read_ply, write_mesh_ply

RES = 0.05


def _normals(mesh):
    tri = mesh.vertices[mesh.triangles]                   # (T, 3, 3)
    return np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), tri.mean(axis=1)


def _outward(mesh, center):
    n, c = _normals(mesh)
    return np.all(np.einsum("ij,ij->i", n, c - np.asarray(center)) > 0)


def test_un_voxel_es_un_cubo_con_normales_hacia_fuera():
    m = build_voxel_mesh([[0, 0, 0]], RES)
    assert (m.voxels, m.cube_faces, m.triangles.shape[0], m.vertices.shape[0]) == (1, 6, 12, 8)
    # el vóxel k ocupa de (k − ½)·res a (k + ½)·res: la caja que pinta el visor
    assert np.allclose(m.vertices.min(axis=0), -0.5 * RES) and np.allclose(m.vertices.max(axis=0), 0.5 * RES)
    assert _outward(m, (0, 0, 0))
    n, _ = _normals(m)
    assert np.isclose(0.5 * np.linalg.norm(n, axis=1).sum(), 6 * RES ** 2)     # área: 6 caras
    assert np.all(m.colors == PALETTE[band(0)])


def test_caras_interiores_fuera_y_vertices_compartidos_si_es_el_mismo_color():
    m = build_voxel_mesh([[0, 0, 0], [1, 0, 0]], RES)          # dos vóxeles juntos, misma capa
    assert m.cube_faces == 10 and m.vertices.shape[0] == 12


def test_cada_capa_con_su_color_liso():
    m = build_voxel_mesh([[0, 0, 0], [0, 0, 1]], RES)          # uno encima de otro
    assert m.cube_faces == 10 and m.vertices.shape[0] == 16    # no comparten vértices: otro color
    tri_colors = m.colors[m.triangles]                          # (T, 3, 3)
    assert np.all(tri_colors == tri_colors[:, :1])              # cada triángulo, un solo color
    low = m.vertices[m.triangles].mean(axis=1)[:, 2] < 0.5 * RES
    assert np.all(tri_colors[low, 0] == PALETTE[band(0)]) and np.all(tri_colors[~low, 0] == PALETTE[band(1)])


def test_bloque_macizo_solo_tiene_la_piel_y_los_repetidos_no_cuentan():
    g = np.stack(np.meshgrid(range(3), range(3), range(3), indexing="ij"), axis=-1).reshape(-1, 3)
    m = build_voxel_mesh(np.concatenate([g, g[::-1]]), RES)
    assert m.voxels == 27 and m.cube_faces == 6 * 9
    assert _outward(m, (RES, RES, RES))                          # centro del bloque: vóxel (1, 1, 1)


def test_coordenadas_negativas_y_lejanas():
    m = build_voxel_mesh([[-400, 250, -12], [-401, 250, -12]], RES)
    assert m.cube_faces == 10
    assert np.allclose(m.vertices.min(axis=0), [(-401.5) * RES, 249.5 * RES, -12.5 * RES])


def test_franja_de_color_igual_que_el_visor():
    # paletteColor(z) de LidarMapEngine.js con el punto del vóxel, (k − ½)·res
    for kz in (-25, -9, -1, 0, 5, 21, 40):
        z = (kz - 0.5) * RES
        js = min(max(int(np.floor(z / RES - 0.5 + 1e-6)) + 10, 0), 30)
        assert band(kz) == js


def test_vacio_y_resolucion_mala():
    m = build_voxel_mesh(np.empty((0, 3)), RES)
    assert m.voxels == 0 and m.triangles.shape == (0, 3) and m.vertices.shape == (0, 3)
    with pytest.raises(ValueError):
        build_voxel_mesh([[0, 0, 0]], 0)


def _parse_mesh_ply(data: bytes):
    head, _, body = data.partition(b"end_header\n")
    lines = head.decode("ascii").splitlines()
    nv = int(next(x for x in lines if x.startswith("element vertex")).split()[-1])
    nf = int(next(x for x in lines if x.startswith("element face")).split()[-1])
    vdt = np.dtype([("x", "<f4"), ("y", "<f4"), ("z", "<f4"), ("r", "u1"), ("g", "u1"), ("b", "u1")])
    fdt = np.dtype([("n", "u1"), ("v", "<i4", (3,))])
    assert len(body) == nv * vdt.itemsize + nf * fdt.itemsize      # ni un byte de más ni de menos
    v = np.frombuffer(body, vdt, nv)
    f = np.frombuffer(body, fdt, nf, offset=nv * vdt.itemsize)
    return lines, v, f


def test_ply_de_malla_se_escribe_y_se_lee(tmp_path):
    m = build_voxel_mesh([[0, 0, 0], [1, 0, 0], [0, 0, 1]], RES)
    path = tmp_path / "m.ply"
    write_mesh_ply(path, m.vertices, m.colors, m.triangles, comments=["hola\nmundo"])
    data = path.read_bytes()
    assert data == mesh_ply_bytes(m.vertices, m.colors, m.triangles, comments=["hola\nmundo"])
    lines, v, f = _parse_mesh_ply(data)
    assert lines[:2] == ["ply", "format binary_little_endian 1.0"]
    assert "comment hola mundo" in lines and "property list uchar int vertex_indices" in lines
    assert np.all(f["n"] == 3) and np.array_equal(f["v"], m.triangles)
    assert np.allclose(np.column_stack((v["x"], v["y"], v["z"])), m.vertices, atol=1e-7)
    assert np.array_equal(np.column_stack((v["r"], v["g"], v["b"])), m.colors)
    assert read_ply(path).points.shape == m.vertices.shape     # el lector de siempre lee los vértices


def test_ply_de_malla_rechaza_indices_fuera_de_rango(tmp_path):
    m = build_voxel_mesh([[0, 0, 0]], RES)
    bad = m.triangles.copy()
    bad[0, 0] = 99
    with pytest.raises(PlyError):
        write_mesh_ply(tmp_path / "x.ply", m.vertices, m.colors, bad)
    assert not (tmp_path / "x.ply").exists()


def test_mapa_slam_exporta_la_misma_caja_que_sus_puntos():
    f = generate_frames(1, seed=9)[0]
    f.meta["origin"] = [-64.5 * 0.05, -64.5 * 0.05, -12.5 * 0.05]     # como el Go2 real: (k − ½)·res
    slam = SlamMap()
    assert slam.export_mesh() is None
    for _ in range(3):
        slam.update_raw(f.payload, f.meta["src_size"], f.meta["origin"], f.meta["resolution"])
    pts = slam.export_points()                 # esquina baja de cada vóxel: (k − ½)·res
    mesh = slam.export_mesh()
    assert mesh.voxels == pts.shape[0] > 0
    assert np.allclose(mesh.vertices.min(axis=0), pts.min(axis=0))
    assert np.allclose(mesh.vertices.max(axis=0), pts.max(axis=0) + mesh.resolution)
