"""RobotAdapter: captura, estados y sondeo de capacidades con un adaptador SINTÉTICO (sin robot).

Sustituye a los tests que antes pasaban por el ReplayAdapter (eliminado el 2026-11-14).
"""

import pytest

from conftest import SyntheticAdapter, run
from terrainx_robot.adapters.base import CaptureError
from terrainx_robot.fixtures.synthetic import generate_frames
from terrainx_robot.models import CaptureState, ConnectionState, EvidenceClass, PointType
from terrainx_robot.probe.capability_probe import run_probe


def _capture(adapter, duration=None, **kw):
    async def go():
        await adapter.connect()
        try:
            return await adapter.capture(duration, **kw)
        finally:
            await adapter.disconnect()

    return run(go())


def test_captura_sintetica(store):
    adapter = SyntheticAdapter(store)
    meta = _capture(adapter)
    union = {tuple(r) for f in generate_frames(6, seed=11) for r in f.indices.tolist()}
    assert meta.point_count == len(union)
    assert meta.evidence_class is EvidenceClass.SYNTHETIC_TEST and meta.demo is True
    assert meta.robot.adapter == "test_synthetic"
    assert meta.geometry.point_type is PointType.VOXEL_OCCUPANCY
    assert meta.capture.session_id is None
    assert adapter.connection_state is ConnectionState.DISCONNECTED
    assert adapter.capture_state is CaptureState.COMPLETE


def test_ventana_de_duracion_y_modo_last(store):
    meta = _capture(SyntheticAdapter(store), 0.25)
    assert meta.capture.frames_used == 3  # mapas en t = 0.0, 0.1, 0.2
    last = _capture(SyntheticAdapter(store), mode="last")
    assert last.point_count == len(generate_frames(6, seed=11)[-1].indices)


def test_estado_y_errores_de_uso(store):
    adapter = SyntheticAdapter(store)
    assert adapter.get_status().connection_state is ConnectionState.DISCONNECTED
    with pytest.raises(CaptureError):
        run(adapter.start_capture())  # sin conectar

    async def go():
        await adapter.connect()
        assert adapter.get_status().connection_state is ConnectionState.READY_READONLY
        with pytest.raises(CaptureError):
            await adapter.stop_capture()  # sin captura en curso
        await adapter.start_capture()
        with pytest.raises(CaptureError):
            await adapter.start_capture()  # doble captura
        await adapter.abort_capture()
        await adapter.disconnect()

    run(go())


def test_sondeo_de_capacidades(store):
    report = run(run_probe(SyntheticAdapter(store), window_s=None))
    caps = {c.name: c for c in report.capabilities}
    assert report.overall_status == "ok"
    assert caps["lidar_point_data"].status.value == "available"
    assert caps["lidar_point_data"].details["resolution"] == 0.05
    assert caps["battery_soc"].status.value == "available"
    assert caps["motion_control"].status.value == "disabled_by_policy"
    assert caps["robot_pose_topic"].status.value == "unavailable"
    assert any("SINTÉTICA" in c for c in report.caveats)
    assert "recorded_session_id" not in report.connection
