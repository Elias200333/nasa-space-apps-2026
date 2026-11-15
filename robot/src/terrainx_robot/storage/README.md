# Cryptographic Storage & Point Cloud Persistence (`robot/src/terrainx_robot/storage`)

## Overview
This module handles file serialization, Stanford Polygon (`.ply`) formatting, and cryptographic SHA-256 evidence generation for recorded scans.

---

## Files & Engineering Logic

### `scan_store.py`
- **Role**: File system persistence manager.
- **Key Logic**:
  - Organizes completed mission datasets under `runtime/scans/scan-<timestamp>-<hash>/`:
    - `<scan_id>.ply`: Raw binary/ASCII 3D point cloud.
    - `<scan_id>.glb`: 3D triangle mesh model.
    - `<scan_id>.mission.json`: Telemetry logs, timestamps, and odometry trajectory.
    - `<scan_id>.coords.json`: Voxel coordinate matrices.
    - `<scan_id>.metadata.json`: Mission bounds, sensor specifications, and operator notes.
    - `SHA256SUMS`: Checksums verifying every generated artifact.

### `ply.py`
- **Role**: Stanford Triangle PLY parser and serializer.
- **Key Logic**:
  - Implements high-throughput binary and ASCII PLY writers formatted with standard properties: `x`, `y`, `z`, `red`, `green`, `blue`.
  - Guarantees compatibility with external scientific tools (CloudCompare, MeshLab, Blender).
