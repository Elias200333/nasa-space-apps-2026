# Real-Time LiDAR SLAM & Voxel Engine (`robot/src/terrainx_robot/lidar`)

## Overview
This module processes high-speed 3D LiDAR point cloud data streamed from the Unitree Go2's onboard Livox MID-360 LiDAR sensor. It unpacks compressed voxel streams, maintains a spatial SLAM occupancy grid, and generates 3D triangle meshes.

---

## Files & Engineering Logic

### `voxel_codec.py`
- **Role**: Bitstream decompression.
- **Key Logic**:
  - Decompresses Unitree's proprietary compressed voxel packet format.
  - Converts integer grid indices into floating-point metric coordinates ($X, Y, Z$) based on the active voxel resolution (default: $0.05\text{ m}$ / $5\text{ cm}$).

### `accumulator.py`
- **Role**: Spatial SLAM map accumulation.
- **Key Logic**:
  - Maintains an in-memory 3D sparse voxel hash grid during the exploration mission.
  - Prevents point duplication in overlapping laser sweeps.
  - Calculates real-time 3D bounding boxes (extent min/max) and spatial centroids.

### `voxel_glb.py` & `voxel_mesh.py`
- **Role**: 3D mesh synthesis.
- **Key Logic**:
  - Synthesizes optimized GLTF/GLB binary meshes directly from voxel octrees.
  - Generates smoothed vertex normals and height-based color ramps (purple $\to$ cyan $\to$ amber) for instant loading in WebGL, Babylon.js, and Three.js.

### `live_stream.py`
- **Role**: High-speed broadcast buffer.
- **Key Logic**:
  - Decouples the 8 Hz LiDAR sensor ingestion thread from client HTTP/WebSocket consumers, preventing network congestion.

### `validation.py` & `mission_frame.py`
- **Role**: Frame calibration.
- **Key Logic**:
  - Transforms robot-relative coordinates into the mission odometry frame ($X = \text{forward}, Y = \text{left}, Z = \text{up}$).
