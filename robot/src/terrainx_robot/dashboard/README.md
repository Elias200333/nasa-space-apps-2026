# Dashboard Server & Subsurface Cave Integration (`robot/src/terrainx_robot/dashboard`)

## Overview
The `dashboard` package provides the FastAPI web and WebSocket server operating on port `8777`. It delivers real-time telemetry, camera streaming, teleoperation control, and subsurface cave model anchoring.

---

## Files & Engineering Logic

### `server.py`
- **Role**: FastAPI application definition.
- **Key Logic**:
  - Exposes REST endpoints:
    - `GET /api/status`: Robot connection state, battery SOC, speed limits, SLAM statistics.
    - `POST /api/connect` & `POST /api/disconnect`: Controls WebRTC link lifecycle.
    - `POST /api/mission/start` & `POST /api/mission/finish`: Demarcates 3D exploration runs.
    - `GET /api/lidar`: Returns latest LiDAR voxel point slice.
    - `GET /video/stream`: High-efficiency MJPEG camera stream.
    - `GET /api/caves`: Lists persisted subterranean cave models.
    - `POST /api/caves`: Geo-anchors a cave model into a DEM.
  - Exposes WebSocket `/ws/control`: Low-latency dead-man driving stream.

### `bridge.py`
- **Role**: ASGI reverse proxy & local network bridge.
- **Key Logic**:
  - Strips `/robot` prefix when proxied from the Vite frontend (port 3000).
  - Normalizes remote client IPs (e.g. Meta Quest headsets on Wi-Fi), preventing spurious 401 rejections and enabling automatic WebXR connection.

### `caves.py`
- **Role**: Subsurface cave repository & coordinate fusion.
- **Key Logic**:
  - Manages JSON descriptor files under `runtime/caves/`.
  - Computes global world transform matrices mapping the robot's local SLAM trajectory ($X, Y, Z$) to UTM / WGS84 surface coordinates at specified depths and headings.

### `service.py`
- **Role**: State coordinator singleton.
- **Key Logic**:
  - Buffers video frames, handles asynchronous WebRTC event dispatches, and coordinates mission SLAM accumulation.
