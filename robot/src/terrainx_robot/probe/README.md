# Hardware Probe & Network Discovery (`robot/src/terrainx_robot/probe`)

## Overview
This module inspects local networking adapters, verifies routing to the Unitree Go2 IP address, and audits available sensor capabilities.

---

## Files & Engineering Logic

### `capability_probe.py`
- **Role**: Diagnostic auditor.
- **Key Logic**:
  - Probes available hardware channels (LiDAR stream, stereo camera, joint sensors, battery BMS).
  - Formats diagnostic summary reports including firmware revisions and packet reception jitter.

### `network.py`
- **Role**: Network interface discovery.
- **Key Logic**:
  - Detects active local network adapters (Ethernet, Wi-Fi).
  - Verifies ARP and ping responsiveness on the standard robot subnet (`192.168.123.0/24`).
