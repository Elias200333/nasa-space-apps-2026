"""«Detener y guardar» no debe congelar el bucle de la conexión con el robot.

Visto con Pluffy (2026-11-14): 15 s de captura = 5,4 M puntos; al detener, np.unique(axis=0)
sobre todos ellos tuvo el bucle asyncio parado 14 s (8 s en la segunda prueba). El Go2 dejó
de recibir respuestas y cortó: cámara y datos fuera, «conexión perdida» 30 s después.
Todo con datos SINTÉTICOS (aquí no hay robot).
"""

import asyncio
import logging
import time

import numpy as np

from conftest import run
from terrainx_robot.adapters.replay import ReplayAdapter
from terrainx_robot.cli import _LibraryNoiseFilter
from terrainx_robot.fixtures.synthetic import generate_frames
from terrainx_robot.lidar.accumulator import CaptureAccumulator
from test_frames_validation_accumulator import _frame


def _old_dedupe(frames, res):
    """La deduplicación de antes (un np.unique(axis=0) al final), como referencia."""
    pts = np.concatenate([f.points for f in frames])
    _, first = np.unique(np.rint(pts / res).astype(np.int64), axis=0, return_index=True)
    return pts[np.sort(first)], pts.shape[0]


def _moving_frames(n=12, seed=3):
    """Mapas sintéticos con la ventana desplazada, como si el perro anduviera."""
    out = []
    for i, sf in enumerate(generate_frames(n, seed=seed)):
        ox, oy, oz = sf.meta["origin"]
        res = sf.meta["resolution"]
        out.append(_frame(sf, seq=i, origin=[ox + (i % 5) * res, oy - (i // 3) * res, oz]))
    return out


def test_deduplicacion_incremental_da_lo_mismo_que_la_de_antes():
    frames = _moving_frames()
    acc = CaptureAccumulator("accumulate")
    for f in frames:
        assert acc.add(f)
    cloud = acc.result()
    expected, before = _old_dedupe(frames, frames[0].info.resolution)
    assert np.array_equal(cloud.points, expected)               # mismos puntos, mismo orden
    assert cloud.deduplication["points_before"] == before
    assert cloud.deduplication["removed"] == before - expected.shape[0] > 0
    assert "primera aparición" in cloud.deduplication["rule"]


def test_indices_enormes_usan_el_camino_de_antes():
    """Si un índice de celda no cabe en la clave de 21 bits, se deduplica al final como antes."""
    frames = [_frame(sf, seq=i, resolution=1e-6) for i, sf in enumerate(generate_frames(3, seed=2))]
    acc = CaptureAccumulator("accumulate")
    for f in frames:
        assert acc.add(f)
    assert acc._incremental is False
    expected, _ = _old_dedupe(frames, 1e-6)
    assert np.array_equal(acc.result().points, expected)


def test_captura_del_tamano_de_pluffy_se_cierra_al_instante():
    """118 mapas de ~46 k vóxeles (la captura 1 de Pluffy): antes, 7,5 s solo en result()."""
    rng = np.random.default_rng(0)
    base = rng.integers(-64, 64, size=(46_000, 3)) * 0.05
    sf = generate_frames(1, seed=1)[0]
    acc = CaptureAccumulator("accumulate")
    t0 = time.perf_counter()
    for i in range(118):
        f = _frame(sf, seq=i)
        f.points = base + np.array([(i % 7) * 0.05, 0.0, 0.0])   # el perro se mueve un poco
        assert acc.add(f)
    per_frame = (time.perf_counter() - t0) / 118
    t1 = time.perf_counter()
    cloud = acc.result()
    assert time.perf_counter() - t1 < 0.5
    assert per_frame < 0.1                     # ~7,7 mapas/s: el bucle tiene que ir sobrado
    assert cloud.deduplication["points_before"] == 118 * 46_000
    assert cloud.points.shape[0] == np.unique(np.rint(np.concatenate(
        [base + np.array([k * 0.05, 0, 0]) for k in range(7)]) / 0.05).astype(np.int64), axis=0).shape[0]


def test_detener_y_guardar_no_congela_el_bucle(store, synthetic_session, monkeypatch):
    adapter = ReplayAdapter(synthetic_session, store)
    real_save = store.save

    def slow_save(*a, **kw):          # guardado lento (disco lento, nube grande…)
        time.sleep(0.8)
        return real_save(*a, **kw)

    monkeypatch.setattr(store, "save", slow_save)

    async def go():
        await adapter.connect()
        await adapter.start_capture(record_session=False)
        await adapter._run_window(None)
        gaps = []

        async def ticker():          # hace de conexión WebRTC: necesita el bucle cada 20 ms
            last = time.monotonic()
            while True:
                await asyncio.sleep(0.02)
                now = time.monotonic()
                gaps.append(now - last)
                last = now

        t = asyncio.create_task(ticker())
        meta = await adapter.stop_capture()
        t.cancel()
        await adapter.disconnect()
        return meta, max(gaps)

    meta, worst_gap = run(go())
    assert meta.point_count > 0
    assert worst_gap < 0.3, f"el bucle se quedó parado {worst_gap:.2f} s mientras se guardaba"
    assert adapter.capture_state.value == "complete"


def test_guardar_el_mapa_del_dashboard_no_congela_el_bucle(tmp_path, monkeypatch):
    """Lo mismo para la descarga del visor (mapa SLAM → PLY malla + GLB): la malla, el GLB y los
    archivos se hacen en otro hilo. Robot FALSO, mapas SINTÉTICOS."""
    from test_dashboard_replay_health import build

    app, service, lib, settings = build(tmp_path)
    real_save = service.store.save

    def slow_save(*a, **kw):          # guardado lento (disco lento, mapa grande…)
        time.sleep(0.8)
        return real_save(*a, **kw)

    monkeypatch.setattr(service.store, "save", slow_save)
    f = generate_frames(1, seed=9)[0]
    f.meta["origin"] = [-64.5 * 0.05, -64.5 * 0.05, -12.5 * 0.05]

    async def go():
        await service.connect()
        for _ in range(3):
            service.slam_step(f.meta, f.payload)
        gaps = []

        async def ticker():          # hace de conexión WebRTC: necesita el bucle cada 20 ms
            last = time.monotonic()
            while True:
                await asyncio.sleep(0.02)
                now = time.monotonic()
                gaps.append(now - last)
                last = now

        t = asyncio.create_task(ticker())
        meta = await service.save_slam_map()
        t.cancel()
        await service.disconnect()
        return meta, max(gaps)

    meta, worst_gap = run(go())
    assert meta["geometry"]["point_type"] == "voxel_mesh" and set(meta["files"]) == {"ply", "glb", "coords"}
    assert worst_gap < 0.3, f"el bucle se quedó parado {worst_gap:.2f} s mientras se guardaba"


def test_filtro_de_log_quita_solo_el_ruido_de_la_libreria():
    f = _LibraryNoiseFilter()

    def rec(name, level, msg):
        return logging.LogRecord(name, level, __file__, 1, msg, None, None)

    assert not f.filter(rec("root", logging.INFO, "Received message on data channel: %s"))
    assert not f.filter(rec("root", logging.INFO, '> message sent: {"type": "heartbeat"}'))
    assert not f.filter(rec("root", logging.INFO, "Heartbeat response received."))
    assert f.filter(rec("root", logging.INFO, "Data channel closed"))           # conexión: se queda
    assert f.filter(rec("root", logging.WARNING, "Received message on data channel: x"))
    assert f.filter(rec("terrainx_robot.adapters.base", logging.INFO, "> message sent"))
