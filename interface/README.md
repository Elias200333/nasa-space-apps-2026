# TERRAIN-X · Frontend & WebXR Spatial Interface Module

## Overview
The `interface/` package delivers the interactive client layer for TERRAIN-X. It implements a multi-platform visualization suite designed for the NASA Space Apps Challenge 2026, operating seamlessly across desktop web browsers (2D touch/mouse) and immersive WebXR / mixed reality headsets (Meta Quest 2/3/Pro, Apple Vision Pro, HoloLens).

The architecture leverages **Babylon.js** for high-performance WebGL/WebXR 3D rendering and **Leaflet** for geospatial cartography, communicating in real time with both the NASA Scientific Data Server (`http://127.0.0.1:8000`) and the Unitree Go2 Quadruped Robot Server (`http://127.0.0.1:8777`).

---

## Directory Architecture

```
interface/
├── public/                 # Static assets, textures, logos, and precompiled 3D models
│   ├── textures/           # PBR maps: earth, clouds, lights, normal, spec, moon, mars
│   └── output_3d/          # DEM models (HTML/JSON), thematic atlas & topographic charts
├── src/
│   ├── babylon/            # 3D Planetary rendering, lighting, camera orbits & scene management
│   ├── data/               # Planetary analog databases & state models
│   ├── desk/               # Tactical bottom holographic console desk & DEM visualizers
│   ├── map/                # 2D Leaflet cartographic map with crosshair radar and tile overlays
│   ├── nasa/               # NASA Solar System Trek WMTS/XYZ tile service providers
│   ├── robot/              # Robot mission controllers, WebRTC bridge & subterranean cave fusion
│   ├── xr/                 # WebXR immersive spatial interface, ergonomic cockpit & Quest controllers
│   ├── main.ts             # Application bootstrapping, tab routing & event bus
│   ├── types.ts            # Core TypeScript interfaces for telemetry, analogs & metrics
│   └── style.css           # NASA aesthetic glassmorphic theme styling
├── index.html              # HTML5 entrypoint with WebXR spatial anchors
├── vite.config.ts          # Vite build configuration, HTTPS certificates & backend reverse proxies
└── package.json            # Dependencies and npm build scripts
```

---

## Subsystem Details

### 1. `src/babylon/` · Planetary 3D Scene Management
- **`earthScene.ts`**: The central orchestrator for the 3D planetary globe. Manages the celestial sphere for Earth, Moon, and Mars, applying physically based rendering (PBR) textures (diffuse, normal, specular, ambient occlusion, city lights, and rotational atmospheric cloud layers). Handles raycasting, surface coordinate translation (latitude/longitude $\leftrightarrow$ Cartesian 3D coordinates), and transition into WebXR mode.
- **`spaceBackground.ts`**: Generates procedural starfields and deep-space celestial domes with realistic stellar magnitudes.
- **`miniPlanets.ts`**: Manages concentric orbiting bodies (Mini-Moon and Mini-Mars) with illuminated elliptical trajectories.
- **`targetPin.ts`**: Holographic landing and analog target pins with pulsating beacons and surface orientation normals.
- **`textureGenerator.ts`**: Generates real-time synthetic topography ramps and procedural heightmap textures.

### 2. `src/xr/` · Immersive Spatial WebXR Cockpit
- **`xrSpatialUI.ts`**: Constructs the complete holographic command center in 3D virtual space. Arranges all panels in an ergonomically curved, concave cockpit architecture facing the user's headset:
  - Floating Top Navigation Bar with live coordinates and Space Apps branding.
  - Floating Left Planetary Card (Moon) and Right Card (Mars) tilted at $\pm 35.5^\circ$ directly toward user eyes.
  - Floating Left Camera Toolbar (Orbit, Zoom, Move, Fit).
  - Tactical Bottom Desk with 2D Radar sweep and 3D DEM terrain inspection.
  - Dock Bar with surface metrics and one-click comparative modal trigger.
- **`questControls.ts`**: Handles Oculus Touch / Quest 2/3 controller inputs (thumbstick dead-man driving, grip translation, button triggers, and ray pointer interactions).
- **`xrRobotPanel.ts`**: The WebXR holographic interface for the Unitree Go2 robot dog, streaming live camera video, 2D LiDAR plant slice, and virtual WASD / stance controls.
- **`xrPanelKit.ts`**: Reusable factory methods for building curved glassmorphic panels in `babylonjs-gui`.
- **`xrAnalogPanel.ts` & `xrComparisonPanel.ts`**: Holographic drawers for planetary analog rankings and multi-body comparative metrics.

### 3. `src/robot/` · Robotics & Subsurface Exploration Bridge
- **`robotBridge.ts`**: High-level TypeScript client for the Unitree Go2 robot REST and WebSocket APIs (`/api/status`, `/api/connect`, `/api/mission/start`, `/video/stream`, `/api/lidar`, `/ws/control`).
- **`robotMission.ts`**: Manages the desktop mission lifecycle: WebRTC initialization, automatic pose stabilization, live LiDAR SLAM accumulation, mission termination, and data download.
- **`fusionScene.ts`**: 3D spatial alignment engine that merges the robot's subterranean LiDAR point cloud (caves, lava tubes) beneath the Copernicus / IGN surface DEM model, allowing real-time subterranean exploration.
- **`caveMarkers.ts`**: Manages geo-anchored visual markers indicating entrance pits ("jameos") and subterranean cavities.
- **`terrainGrid.ts`**: Interpolation utilities for elevation and slope extraction on regular DEM matrices.

### 4. `src/map/` & `src/desk/` · Cartography and Tactical Inspection
- **`analogMap2D.ts`**: Leaflet-powered 2D geospatial map supporting Esri Satellite, OpenStreetMap, and NASA Trek planetary tile layers. Features circular radar sweeps, AOI selection, and distance profiling.
- **`analogDesk.ts`**: Coordinates the bottom inspection desk, synchronizing elevation charts, slope distributions, and similarity scoring with the active 3D DEM.

### 5. `src/data/` & `src/nasa/` · Planetary Benchmarks & Cartographic Streams
- **`analogs.ts`**: Embedded registry of certified NASA terrestrial analogs (Caldera Blanca, Río Tinto, Fuerteventura, Atacama, Haleakalā, etc.).
- **`terrainModel.ts`**: Reactive singleton that manages the active digital elevation model (DEM), loaded from Copernicus 30m or IGN LiDAR.
- **`trekProviders.ts`**: Tile URL endpoints for NASA Solar System Treks (Moon Trek, Mars Trek, Vesta Trek).

---

## Best Practices & Engineering Guidelines

1. **Strict Type Safety**: All data structures (GPS coordinates, planetary telemetry, LiDAR voxel frames) are strongly typed in `types.ts`.
2. **Resource Disposal**: WebGL materials, textures, and Babylon meshes are explicitly disposed of (`.dispose()`) on scene exit to prevent browser memory leaks.
3. **Dead-Man Safety Switch**: Robot driving commands emit heartbeat packets every $100\text{ ms}$; missing heartbeats automatically cease quadruped movement to prevent collisions.
4. **Ergonomic VR Design**: Spatial panels follow ISO/CIE ergonomic viewing angles ($15^\circ$ below horizontal gaze line, concave $35.5^\circ$ lateral curvature) to minimize cervical strain.
