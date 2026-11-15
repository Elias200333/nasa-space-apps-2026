# WebXR Spatial Interface Subsystem (`interface/src/xr`)

## Responsibility
The `xr` subsystem powers the immersive Mixed Reality / Virtual Reality command center. It places the operator inside a holographic planetary control room with floating touch panels, tactical desks, and direct teleoperation controls for the Unitree Go2 robot dog.

---

## Architecture & Spatial Geometry

```
                    [Top Navigation Bar: Coordinates / Brand]
                                   (y = +1.10 m)
                                         |
     [Left Card: Moon]   <--- [Central 3D Globe / Target] --->  [Right Card: Mars]
      (rot.y = -0.62 rad)            (y = 0.0 m)                 (rot.y = +0.62 rad)
             |                                                           |
   [Camera Orbit Tools]                                           [Target Detail]
             \                                                           /
              \-------- [Tactical Console Desk: 2D Radar & 3D DEM] -----/
                                   (y = -0.88 m)
                                         |
                    [Bottom Dock: Comparative Environmental Metrics]
                                   (y = -1.18 m)
```

The panels form an ergonomically tuned **concave cockpit arc** tilted directly toward the headset's focal center to ensure effortless readability without neck strain.

---

## File Breakdown

### `xrSpatialUI.ts`
- **Role**: Master constructor of the holographic UI suite.
- **Key Logic**:
  - Instantiates `AdvancedDynamicTexture` instances mapped to 3D plane meshes.
  - Places the Moon card (left) at $X = -2.65\text{ m}$ with $\text{rot.y} = -0.62\text{ rad}$ (facing inwards).
  - Places the Mars card (right) at $X = +2.65\text{ m}$ with $\text{rot.y} = +0.62\text{ rad}$ (facing inwards).
  - Positions the tactical desk at $Y = -0.88\text{ m}$ with $32^\circ$ upward ergonomic inclination.
  - Dynamically updates telemetry readouts, radar blips, and 3D DEM cross-sections.

### `questControls.ts`
- **Role**: WebXR controller input manager.
- **Key Logic**:
  - Listens to Meta Quest / Vision Pro gamepad events via `WebXRSessionManager`.
  - Maps thumbstick analog axes to quadruped driving ($V_x, V_y, \omega_z$).
  - Implements the grip gesture to grab and translate the spatial command stage in room space.
  - Handles the primary trigger button as a raycast pointer selector.

### `xrRobotPanel.ts`
- **Role**: In-headset robot control panel.
- **Key Logic**:
  - Subscribes to the Unitree Go2 WebRTC video stream and displays it on an optimized unlit plane mesh.
  - Pulls LiDAR slice packets from `/api/lidar` and renders an overhead SLAM plan view using dynamic canvas textures.
  - Exposes virtual touch buttons for stance commands (`StandUp`, `StandDown`, `BalanceStand`, `Damp`).
  - Seamlessly integrates with the 15-second WebRTC pose synchronization loop without requiring PIN pairing codes.

### `xrPanelKit.ts`
- **Role**: Reusable Babylon GUI design primitives.
- **Key Logic**:
  - Helper functions for glassmorphic rectangular panels, glowing neon borders, stacked grids, and reactive buttons.

### `xrAnalogPanel.ts` & `xrComparisonPanel.ts`
- **Role**: Floating drawer dialogs.
- **Key Logic**:
  - Multi-page scrollable dialogs for comparing Earth/Moon/Mars planetary attributes and browsing the 20 analog sites.

---

## Coding Best Practices
- **Draw Call Batching**: Static UI borders and backdrops share standard PBR materials to minimize draw call overhead.
- **Dynamic Texture Throttling**: 2D canvas radar and camera textures update on variable tick intervals (LiDAR at $700\text{ ms}$, camera at $150\text{ ms}$, UI telemetry at $1000\text{ ms}$) to ensure solid $90\text{ FPS}$ in VR.
