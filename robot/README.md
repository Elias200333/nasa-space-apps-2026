# TERRAIN-X · Robotics & Subsurface Exploration Module

## Overview
The `robot/` package powers the robotic exploration subsystem of **TERRAIN-X** for the NASA Space Apps Challenge 2026. It establishes low-latency, encrypted teleoperation and real-time sensor ingestion with the physical **Unitree Go2 quadruped robot** ("Pluffy"), acquiring high-density 3D LiDAR point clouds, stereo camera feeds, and multi-axis IMU/odometry data to autonomously map subterranean planetary analogs (such as lava tubes and volcanic cavities).

---

## High-Level Architecture

```
+-----------------------------------------------------------------------------------+
|                            UNITREE GO2 HARDWARE (AIR/PRO)                         |
|     [MID-360 LiDAR]      [Stereo Cameras]       [Joint Encoders & IMU]            |
+-----------------------------------------------------------------------------------+
                                        |  (WebRTC PeerConnection / AES-128)
                                        v
+-----------------------------------------------------------------------------------+
|                        TERRAIN-X ROBOT SERVICE (PORT 8777)                        |
|                                                                                   |
|  +--------------------+   +-----------------------+   +------------------------+  |
|  |  Go2WebRTCAdapter  |-->|    ReadonlyGuard      |-->|     LidarAccumulator   |  |
|  |  (Signaling/Audio) |   | (Whitelisted Commands)|   | (Voxel Decompression)  |  |
|  +--------------------+   +-----------------------+   +------------------------+  |
|            |                          |                           |               |
|            v                          v                           v               |
|  +--------------------+   +-----------------------+   +------------------------+  |
|  |   Video Streamer   |   |   Dead-Man Watchdog   |   |  ScanStore (PLY/GLB)   |  |
|  |    (MJPEG / WebRTC)|   |  (100ms Safety Heart) |   |  (SHA-256 Provenance)  |  |
|  +--------------------+   +-----------------------+   +------------------------+  |
|            |                          |                           |               |
|            +--------------------------+---------------------------+               |
|                                       v                                           |
|                     FastAPI Dashboard & Bridge Middleware                         |
|                       (LocalSTA / Zero-Pairing WebXR API)                         |
+-----------------------------------------------------------------------------------+
                                        |  (HTTP REST / WebSocket / JSON)
                                        v
                    Client Application (Web & Immersive WebXR)
```

---

## Directory Architecture

```
robot/
├── src/terrainx_robot/
│   ├── adapters/           # Unitree WebRTC communication protocols & command guards
│   ├── auth/               # AES-128 credential management & handshake encryption
│   ├── dashboard/          # FastAPI server, WebRTC video streaming & cave fusion API
│   ├── lidar/              # Real-time LiDAR SLAM accumulation, voxel codecs & GLB export
│   ├── probe/              # Automated hardware capability inspection & network discovery
│   ├── storage/            # PLY point cloud persistence & SHA-256 cryptographic hashing
│   ├── cli.py              # Command-line interface definition (argparse)
│   ├── config.py           # Runtime configuration & path resolution
│   ├── models.py           # Pydantic data schemas for telemetry, SLAM & cave models
│   └── util.py             # Coordinate conversions and formatting helpers
├── runtime/                # Persisted mission scans, PLY clouds, GLB meshes & cave JSONs
├── requirements/           # Dependency locks (Windows, Linux, Python 3.11 - 3.13)
├── pyproject.toml          # Package specifications & build setup
└── .env                    # Local environment variables & AES keys
```

---

## Subsystem Details

### 1. `adapters/` · WebRTC Transport & Safety Guard
- **`go2_webrtc.py`**: Connects via WebRTC data channels to the robot's onboard controller. Handles signaling negotiations, channel handshakes, and event dispatch.
- **`readonly_guard.py`**: Software-enforced safety firewall. Evaluates all outbound robot commands against an immutable whitelist (`Move`, `Stop`, `StandUp`, `StandDown`, `BalanceStand`, `Damp`). Any unauthorized RPC is discarded on the host PC before transmission.
- **`go2_topics.py`**: Internal topic subscriptions (`rt/utlidar/voxel_map`, `rt/lowstate`, `rt/sportmodestate`).

### 2. `lidar/` · Real-Time LiDAR SLAM & Voxel Decoding
- **`voxel_codec.py`**: Bit-level unpacker for Unitree's compressed 3D voxel stream. Translates variable-length byte arrays into centimeter-accurate Cartesian points ($X, Y, Z$).
- **`accumulator.py`**: Manages the persistent spatial voxel grid during a mission. Deduplicates overlapping spatial voxels and updates local occupancy bounds.
- **`voxel_glb.py` & `voxel_mesh.py`**: Converts accumulated 3D voxel matrices into optimized binary GLTF (`.glb`) triangle meshes with normal smoothing for instant rendering in WebGL and WebXR.
- **`validation.py`**: Validates coordinate reference frames and bounds.

### 3. `dashboard/` · REST/WebSocket Service & Cave Subsurface Engine
- **`server.py`**: FastAPI application exposing telemetry endpoints (`/api/status`, `/api/mission/start`, `/api/caves`).
- **`bridge.py`**: ASGI reverse proxy middleware. Seamlessly normalizes connections from local browsers and remote WebXR headsets over Wi-Fi without blocking valid teleoperation.
- **`caves.py`**: Subsurface cave management engine. Geo-references and anchors the finalized 3D SLAM cavity model beneath the planetary surface DEM.
- **`service.py`**: Singleton service coordinator synchronizing telemetry, camera frames, and mission recording.

### 4. `storage/` · Cryptographic Provenance & Point Cloud Storage
- **`scan_store.py`**: Manages the file structure for recorded scans under `runtime/scans/`. Generates manifest files (`metadata.json`, `coords.json`, `mission.json`).
- **`ply.py`**: Formats and streams standardized ASCII and Binary Stanford Polygon (`.ply`) files compatible with CloudCompare, MeshLab, and Blender.
- **Cryptographic Evidence Verification**: Every generated scan calculates a SHA-256 digest over the raw LiDAR point bytes, guaranteeing data integrity for scientific analysis.

---

## Safety Standards & Teleoperation
1. **Dead-Man Switch Mechanism**: The teleoperation loop requires a WebSocket heartbeat every $100\text{ ms}$. If communication latency exceeds $250\text{ ms}$, the quadruped immediately engages active emergency damping.
2. **Velocity Envelope Clamping**: Ingress velocity parameters are software-clamped to:
   - Longitudinal Velocity ($V_x$): Max $1.0\text{ m/s}$ (default mission speed: $0.3\text{ m/s}$)
   - Lateral Velocity ($V_y$): Max $0.5\text{ m/s}$
   - Yaw Rotational Rate ($\omega_{\text{yaw}}$): Max $1.5\text{ rad/s}$
