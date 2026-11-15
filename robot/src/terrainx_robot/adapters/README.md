# Hardware Adapters & Safety Guard (`robot/src/terrainx_robot/adapters`)

## Overview
This module isolates low-level WebRTC transport mechanisms and hardware-specific protocol mappings for the **Unitree Go2** quadruped robot.

---

## Files & Engineering Logic

### `go2_webrtc.py`
- **Role**: Primary communication driver.
- **Key Logic**:
  - Connects to the Go2 onboard computer over local network (LocalSTA mode at `192.168.123.161` or LocalAP Wi-Fi).
  - Handles WebRTC SDP offer/answer signaling and ICE candidate exchange.
  - Subscribes to binary data channels for low-latency telemetry (`rt/lowstate` at 20 Hz, `rt/sportmodestate` at 20 Hz, `rt/utlidar/voxel_map` at ~8 Hz) and video media tracks (~14 FPS).

### `readonly_guard.py`
- **Role**: Security & command whitelisting firewall.
- **Key Logic**:
  - Enforces strict execution safety: only commands explicitly whitelisted (`Move`, `Stop`, `StandUp`, `StandDown`, `BalanceStand`, `Damp`) can pass to the robot.
  - Rejects arbitrary motion commands or unauthorized low-level motor actuation calls.
  - Logs all blocked commands for audit review.

### `go2_topics.py`
- **Role**: Topic definitions and binary payload structures.
- **Key Logic**:
  - Maps Unitree ROS2-style message structures into Python ctypes / struct representations.

### `library_check.py`
- **Role**: Diagnostic verification.
- **Key Logic**:
  - Validates compatibility with the installed `unitree_webrtc_connect` package and checks ABI versions.
