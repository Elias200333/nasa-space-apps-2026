# Robotics & Subsurface SLAM Bridge (`interface/src/robot`)

## Responsibility
The `robot` module connects the client application to the Unitree Go2 quadruped robot. It controls real-time driving teleoperation, camera streaming, 3D LiDAR point cloud acquisition, and the mathematical fusion of subterranean void models beneath surface digital elevation models (DEM).

---

## File Breakdown

### `robotBridge.ts`
- **Role**: Client communication protocol.
- **Key Logic**:
  - Encapsulates HTTP REST requests (`/api/status`, `/api/connect`, `/api/disconnect`, `/api/mission/start`, `/api/mission/finish`, `/api/caves`).
  - Establishes persistent WebSocket connections (`/ws/control`) for high-frequency dead-man driving commands.
  - Implements exponential backoff and error wrapping (`BridgeError`) for robust reconnection.

### `robotMission.ts`
- **Role**: Mission lifecycle controller (desktop web interface).
- **Key Logic**:
  - Handles the step-by-step mission workflow:
    1. **Connection**: Establishes WebRTC link with the Go2 hardware.
    2. **Pose Synchronization**: Polls until the quadruped's odometry frame is calibrated (`pose_not_ready` retry loop).
    3. **Live Exploration**: Embeds the full-screen mission dashboard iframe with driving and live point cloud updates.
    4. **Mission Summary**: Finalizes SLAM capture and produces verified `.ply` and `.glb` voxel models.
    5. **Subsurface Integration**: Initiates subterranean cave fusion into the active 3D DEM.

### `fusionScene.ts`
- **Role**: Subsurface 3D alignment engine.
- **Key Logic**:
  - Takes the robot's local LiDAR point cloud ($X, Y, Z$ in meters relative to start pose) and converts it into geographic coordinates.
  - Adjusts placement via user sliders:
    - **Heading Angle ($\theta_{\text{deg}}$)**: Rotates the cave orientation relative to true North.
    - **Subsurface Depth ($D_{\text{m}}$)**: Displaces the cave model below the local DEM terrain surface ($Z_{\text{cave}} = Z_{\text{surface}} - D_{\text{m}}$).
    - **East/North Offsets**: Horizontal geo-referencing adjustments.
  - Renders the surface terrain semi-transparently ($\alpha = 0.45$), exposing the subterranean cave passages and lava tubes beneath the surface.

### `caveMarkers.ts`
- **Role**: Cavity entry point indicator ("Jameos").
- **Key Logic**:
  - Instantiates 3D glowing holographic markers at cave entrances on the planetary surface.

### `terrainGrid.ts`
- **Role**: Bilinear elevation interpolator.
- **Key Logic**:
  - Computes ground elevation at arbitrary continuous $(x, y)$ coordinates from a discrete DEM matrix.

---

## Safety & Teleoperation Protocols
- **Dead-Man Switch**: Movement commands (`{ type: "drive", vx, vy, yaw }`) must be continuously streamed. Releasing keys or controllers immediately emits `{ type: "stop" }`.
- **Speed Limits**: Software enforced clamps: $V_x \le 1.0\text{ m/s}$, $V_y \le 0.5\text{ m/s}$, $\omega_{\text{yaw}} \le 1.5\text{ rad/s}$.
