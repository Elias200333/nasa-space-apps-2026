# TERRAIN-X · Autonomous Planetary Analog Exploration & Subsurface Robotic Mapping
### NASA Space Apps Challenge 2026

[![NASA Space Apps Challenge](https://img.shields.io/badge/NASA%20Space%20Apps-2026-0B3D91?style=for-the-badge&logo=nasa&logoColor=white)](https://www.spaceappschallenge.org/)
[![WebXR Ready](https://img.shields.io/badge/WebXR-Immersive%203D-22D3EE?style=for-the-badge&logo=webxr&logoColor=black)](https://immersiveweb.dev/)
[![Babylon.js](https://img.shields.io/badge/Babylon.js-v7.x-BB464B?style=for-the-badge&logo=babylon.js&logoColor=white)](https://www.babylonjs.com/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Unitree Go2](https://img.shields.io/badge/Unitree%20Go2-Quadruped%20Robotics-F59E0B?style=for-the-badge&logo=robot&logoColor=black)](https://www.unitree.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-34D399?style=for-the-badge)](LICENSE)

---

## 📑 Table of Contents
1. [Executive Summary](#-executive-summary)
2. [Scientific Foundation & Analog Selection Methodology](#-scientific-foundation--analog-selection-methodology)
3. [System Architecture](#-system-architecture)
4. [Immersive WebXR Spatial Interface](#-immersive-webxr-spatial-interface)
5. [Quadruped Robotics & 3D LiDAR SLAM Subsurface Exploration](#-quadruped-robotics--3d-lidar-slam-subsurface-exploration)
6. [Subterranean Cave Fusion & Surface DEM Anchoring](#-subterranean-cave-fusion--surface-dem-anchoring)
7. [Repository Structure](#-repository-structure)
8. [Quickstart & Execution Guide](#-quickstart--execution-guide)
9. [Standalone Precompiled Demo](#-standalone-precompiled-demo)
10. [Meet the Engineering Team](#-meet-the-engineering-team)

---

## 🔭 Executive Summary

**TERRAIN-X** is an end-to-end scientific software and robotics framework engineered for the **NASA Space Apps Challenge 2026**. The platform addresses one of the most critical challenges in planetary exploration: **characterizing, training for, and mapping extreme lunar and martian surface and subsurface environments using certified terrestrial analogs**.

The platform integrates three cutting-edge capabilities into a single synchronized ecosystem:
1. **Planetary Analog Benchmarking Engine**: Ingests real-world Copernicus DEM ($30\text{ m}$), Spanish National Geographic Institute (IGN PNOA-LiDAR), and NASA planetary laser altimetry (LOLA on the Moon, MOLA on Mars) to mathematically quantify terrestrial analog suitability.
2. **Immersive WebXR Holographic Command Center**: A spatial cockpit designed for desktop browsers and Virtual/Mixed Reality headsets (Meta Quest 2/3/Pro, Apple Vision Pro), presenting planetary globes, real-time 2D targeting radar, and interactive 3D digital elevation models.
3. **Subsurface Quadruped Robotic Exploration**: Hardware teleoperation and sensor ingestion pipeline with the **Unitree Go2 quadruped robot**, streaming stereo cameras and real-time 3D LiDAR SLAM point clouds to autonomously map lava tubes and subterranean cavities, merging underground voids directly beneath surface DEM terrain.

---

## 📐 Scientific Foundation & Analog Selection Methodology

### 1. The Terrestrial Analog Paradigm
Manned and robotic missions to the Moon (Artemis Program) and Mars (Perseverance, Mars Sample Return) face severe environmental constraints: extreme thermal deltas, unbuffered radiation, micrometeorite bombardment, and hazardous abrasive regolith. **Subsurface volcanic lava tubes** represent the highest-priority targets for long-duration extraterrestrial habitats because their intact basaltic ceilings provide natural shielding against radiation and thermal fluctuations.

TERRAIN-X evaluates terrestrial sites that exhibit homologous geomorphology, petrology, and morphometric attributes to extraterrestrial landing sites.

| Terrestrial Analog Site | Extraterrestrial Target Pairing | Dominant Geomorphological Analogy |
|---|---|---|
| **Caldera Blanca / Timanfaya (Lanzarote, Spain)** | **Martian Volcanic Flanks (Tharsis / Elysium Mons)** | Basaltic hydromagmatic crater, pristine lava pavements without vegetation, and collapsed lava tube systems ("Jameos"). |
| **Río Tinto Basin (Huelva, Spain)** | **Meridiani Planum / Mawrth Vallis (Mars)** | Ultra-acidic aqueous environment ($pH \approx 1.7\text{--}2.5$), massive gossan deposits, jarosite and iron sulfate sedimentation matching rover *Opportunity* discoveries. |
| **Malpaís de la Arena (Fuerteventura, Spain)** | **Lunar Mare Basalt Pavements (Marius Hills)** | Holocene 'aa' blocky basaltic terrain with razor-sharp edges; ideal benchmark for lunar rover wheel mechanical abrasion. |
| **Yungay Station (Atacama Desert, Chile)** | **Gale Crater / Hyperarid Martian Regolith** | Decadal hyperaridity, intense UV flux, and hygroscopic halite salt crusts containing perchlorates. |
| **Haleakalā / Kaumana (Hawaii, USA)** | **Lunar Pyroclastic Deposits & Shield Pits** | Basaltic cinder cones, fine ash regolith, and active multi-kilometer basaltic lava tube conduits. |

---

### 2. Multi-Criteria Similarity Metric ($S_{\text{pct}}$)
To choose and score candidate locations objectively without human bias, TERRAIN-X employs a quantitative multi-criteria evaluation framework:

```
                                  [DEM Ingestion (30m)]
                                            │
               ┌────────────────────────────┼────────────────────────────┐
               ▼                            ▼                            ▼
      [Relief Metric (ΔZ)]         [Horn Slope (S_deg)]         [Roughness (TRI/VRM)]
               │                            │                            │
               └────────────────────────────┼────────────────────────────┘
                                            ▼
                           [Pearson Correlation Matrix (R)]
                                            │
                                            ▼
                       [Composite Similarity Score: S_pct (0-100%)]
```

#### A. Topographic Relief ($\Delta Z$)
Calculates the absolute elevation amplitude within the exploration radius ($R = 10\text{ km}$):
$$\Delta Z = Z_{\max} - Z_{\min}$$

#### B. Slope Gradient Vector (Horn's 8-Neighbor Algorithm)
The surface gradient is evaluated across every DEM cell using the robust 8-neighbor convolution kernel:
$$\frac{\partial Z}{\partial x} = \frac{(Z_{i+1, j-1} + 2Z_{i+1, j} + Z_{i+1, j+1}) - (Z_{i-1, j-1} + 2Z_{i-1, j} + Z_{i-1, j+1})}{8 \cdot \Delta x}$$
$$\frac{\partial Z}{\partial y} = \frac{(Z_{i-1, j+1} + 2Z_{i, j+1} + Z_{i+1, j+1}) - (Z_{i-1, j-1} + 2Z_{i, j-1} + Z_{i+1, j-1})}{8 \cdot \Delta y}$$
$$\text{Slope} = \arctan\left(\sqrt{\left(\frac{\partial Z}{\partial x}\right)^2 + \left(\frac{\partial Z}{\partial y}\right)^2}\right)$$

#### C. Terrain Ruggedness Index (TRI) & Vector Ruggedness Measure (VRM)
Quantifies micro-topographic roughness by computing root-mean-square elevation variance between center cells and their neighborhood, assessing rover trafficability:
$$\text{TRI} = \sqrt{\frac{1}{8}\sum_{k=1}^{8}(Z_k - Z_0)^2}$$

#### D. Pearson Profile Correlation ($R$)
Compares radial cross-sectional elevation profiles of the candidate terrestrial crater against benchmark planetary crater archetypes:
$$R = \frac{\sum_{i=1}^{N}(Z_{\text{terr}, i} - \bar{Z}_{\text{terr}})(Z_{\text{plan}, i} - \bar{Z}_{\text{plan}})}{\sqrt{\sum_{i=1}^{N}(Z_{\text{terr}, i} - \bar{Z}_{\text{terr}})^2 \sum_{i=1}^{N}(Z_{\text{plan}, i} - \bar{Z}_{\text{plan}})^2}}$$

#### E. Weighted Composite Score
The final similarity score $S_{\text{pct}}$ synthesizes morphometry, roughness, and correlation:
$$S_{\text{pct}} = \sum_{m} w_m \cdot s_m \times 100\% \quad \text{where} \quad \sum w_m = 1.0$$

---

## 🏗️ System Architecture

TERRAIN-X is built on a microservices-inspired, event-driven architecture with zero inter-process contention:

```
+---------------------------------------------------------------------------------------------------------+
|                                        TERRAIN-X SYSTEM TOPOLOGY                                        |
+---------------------------------------------------------------------------------------------------------+

     [NASA / USGS / IGN Servers]                  [Unitree Go2 Hardware]                 [WebXR Headset]
                  │                                         │                                    │
                  │ (GeoTIFF / DEM 30m)                     │ (WebRTC / AES-128 / LiDAR)         │ (WiFi / 6DoF)
                  ▼                                         ▼                                    ▼
+───────────────────────────────────+     +───────────────────────────────────+     +───────────────────────+
|      NASA SCIENTIFIC DATA         |     |       ROBOTICS TELEOPERATION      |     |  IMMERSIVE SPATIAL UI |
|      SERVER (PORT 8000)           |     |       SERVER (PORT 8777)          |     |  VITE / BABYLON (3000)|
|                                   |     |                                   |     |                       |
| • Copernicus 30m / IGN Engine     |     | • Go2WebRTC / Data Channels       |     | • PBR Planetary Globe |
| • Horn Slope & TRI Algorithms     |     | • ReadonlyGuard Safety Filter     |     | • Ergonomic VR Cockpit|
| • Pearson R Correlation Matrix    |     | • 5cm Voxel SLAM Accumulator      |     | • 2D Crosshair Radar  |
| • Thematic Atlas Generator        |     | • Dead-Man Switch (100ms Ping)    |     | • 3D DEM Inspector    |
| • GeoTIFF / Plotly 3D Exporter    |     | • Subsurface Cave Fusion Engine   |     | • WASD / Touch Driving|
+───────────────────────────────────+     +───────────────────────────────────+     +───────────────────────+
                  ▲                                         ▲                                    │
                  │                                         │                                    │
                  └─────────────────────────┬───────────────┴────────────────────────────────────┘
                                            │ Reverse Proxies (/api, /robot)
                                            ▼
                          +───────────────────────────────────+
                          |   UNIFIED MULTI-PROCESS LAUNCHER  |
                          |   (iniciar_terrain_x.exe / .bat)  |
                          +───────────────────────────────────+
```

---

## 🥽 Immersive WebXR Spatial Interface

The user interface operates simultaneously as a responsive web dashboard and an immersive room-scale WebXR experience.

```
                    [Top Navigation Bar: Coordinates / Brand]
                                   (Y = +1.10 m)
                                         │
     [Left Card: Moon]   <─── [Central 3D Globe / Target] ───>  [Right Card: Mars]
      (rot.Y = -0.62 rad)            (Y = 0.0 m)                 (rot.Y = +0.62 rad)
             │                                                           │
   [Camera Orbit Tools]                                           [Target Detail]
             \                                                           /
              \──────── [Tactical Console Desk: 2D Radar & 3D DEM] ─────/
                                   (Y = -0.88 m)
                                         │
                    [Bottom Dock: Comparative Environmental Metrics]
                                   (Y = -1.18 m)
```

### Key Spatial Ergonomics:
- **Concave Cockpit Curvature**: Lateral planetary cards (Moon on the left, Mars on the right) are angled inward at $\pm 0.62\text{ rad}$ ($\pm 35.5^\circ$) facing directly toward the user's eyes, matching natural peripheral vision.
- **Eye-Level Alignment**: The entire spatial stage is offset downward by $28\text{ cm}$ relative to headset height to keep the central globe, radar desk, and comparison metrics comfortably centered in the operator's primary field of view without neck hyperextension.
- **Natural Interaction**: Supports 6DoF hand tracking and Touch controller ray pointers, enabling operators to grab the stage, orbit the planets, or steer the robot dog via analog thumbsticks.

---

## 🐕 Quadruped Robotics & 3D LiDAR SLAM Subsurface Exploration

Subterranean lava tubes prohibit conventional wheeled rovers due to chaotic boulder blockages ("aa" lava fields) and steep pit crater drops. TERRAIN-X deploys the **Unitree Go2 quadruped robot**, capable of dynamic omnidirectional gaiting across rugged terrain.

### LiDAR SLAM Data Pipeline:
1. **Onboard Sensing**: Ingests raw distance streams from the robot's onboard Livox MID-360 LiDAR sensor ($360^\circ \times 59^\circ$ field of view).
2. **Voxel Decompression**: Decompresses Unitree's binary packet stream into centimeter-level metric points ($X, Y, Z$).
3. **Spatial Accumulation**: Employs an in-memory sparse spatial hash grid with $0.05\text{ m}$ ($5\text{ cm}$) voxel resolution, eliminating duplicate laser returns while preserving sharp wall boundaries.
4. **GLB / PLY Synthesis**: Automatically compiles the accumulated cloud into Stanford Polygon (`.ply`) point clouds and smoothed binary GLTF (`.glb`) meshes.
5. **Cryptographic Integrity**: Computes a SHA-256 hash digest over every generated point cloud file to ensure immutable provenance for planetary research.

---

## 🌋 Subterranean Cave Fusion & Surface DEM Anchoring

A critical innovation of TERRAIN-X is the **Subterranean Cave Fusion Engine**. When the robot finishes a lava tube mapping run, the underground 3D SLAM point cloud is anchored beneath the surface Copernicus / IGN digital elevation model:

$$\begin{bmatrix} X_{\text{global}} \\ Y_{\text{global}} \\ Z_{\text{global}} \end{bmatrix} = \mathbf{R}_z(\theta_{\text{heading}}) \begin{bmatrix} X_{\text{robot}} \\ Y_{\text{robot}} \\ Z_{\text{robot}} \end{bmatrix} + \begin{bmatrix} X_{\text{origin}} + \Delta E \\ Y_{\text{origin}} + \Delta N \\ Z_{\text{surface}} - D_{\text{depth}} \end{bmatrix}$$

- **Heading Angle ($\theta_{\text{heading}}$)**: Rotates the cave's principal orientation vector relative to true geographic North.
- **Subsurface Depth ($D_{\text{depth}}$)**: Displaces the floor and ceiling beneath the surface terrain ($Z_{\text{cave}} = Z_{\text{surface}} - D_{\text{depth}}$).
- **Semi-Transparent Surface Shading**: The surface DEM renders with an alpha transparency factor ($\alpha = 0.45$), revealing the underground lava tube passages beneath the volcanic surface.

---

## 📂 Repository Structure

```
nasa-space-apps-2026/
├── data/                       # NASA Scientific Data Server (Port 8000)
│   ├── server.py               # FastAPI GIS & Copernicus DEM extraction service
│   ├── terrain_analyzer.py     # Slope, TRI, VRM, and Pearson R algorithms
│   ├── output_3d/              # Generated GeoTIFFs, Plotly 3D DEMs & metrics
│   └── README.md               # Data module documentation
├── interface/                  # Frontend & Immersive WebXR Client (Port 3000)
│   ├── src/
│   │   ├── babylon/            # 3D Planetary rendering & lighting
│   │   ├── xr/                 # WebXR ergonomic cockpit & Quest controllers
│   │   ├── robot/              # Subsurface cave fusion & robot mission bridge
│   │   ├── map/                # 2D Leaflet cartography & radar sweep
│   │   ├── desk/               # Tactical console desk & DEM inspector
│   │   └── data/               # Analog registries & reactive state stores
│   ├── public/                 # Planetary textures (Earth, Moon, Mars) & models
│   ├── vite.config.ts          # Reverse proxies & HTTPS SSL certificates
│   └── README.md               # Interface module documentation
├── robot/                      # Robotics & LiDAR SLAM Subsystem (Port 8777)
│   ├── src/terrainx_robot/
│   │   ├── adapters/           # Go2 WebRTC driver & ReadonlyGuard whitelist
│   │   ├── auth/               # AES-128 key manager & fingerprinting
│   │   ├── dashboard/          # FastAPI server, bridge middleware & caves API
│   │   ├── lidar/              # Voxel codec, SLAM accumulator & GLB generator
│   │   ├── probe/              # Hardware inspection & network ping
│   │   └── storage/            # PLY point cloud writer & SHA-256 verifier
│   ├── runtime/                # Persisted mission scans, PLYs, GLBs & caves
│   └── README.md               # Robotics module documentation
├── demo/                       # Standalone Precompiled Interactive Demo
│   ├── index.html              # Zero-dependency static demo web app
│   ├── js/data.js              # Precompiled real metrics, catalogs & LiDAR points
│   ├── js/demo.js              # Babylon.js 3D globe, DEM & Go2 simulator
│   ├── css/demo.css            # Deep space NASA glassmorphic design
│   └── README.md               # Demo execution instructions
├── iniciar_terrain_x.exe       # Native Windows compiled launcher executable
├── iniciar_terrain_x.bat       # Windows batch launcher script
└── README.md                   # Master technical documentation
```

---

## ⚡ Quickstart & Execution Guide

### Option A: One-Click Execution (Recommended)
Simply double-click the native Windows executable in the root directory:
```
iniciar_terrain_x.exe
```
*(Alternatively, run `iniciar_terrain_x.bat`)*

**What the launcher does automatically:**
1. Frees ports `8000`, `8777`, and `3000` from any orphaned background processes.
2. Starts the NASA Scientific Data Server (`http://127.0.0.1:8000`).
3. Starts the Unitree Go2 Robotics Server (`http://127.0.0.1:8777`).
4. Starts the Vite WebXR Interface (`https://localhost:3000`).
5. Opens your default browser automatically.
6. Cleanly terminates all child processes upon pressing any key in the console window.

---

### Option B: Manual CLI Execution (Developers)

#### 1. Start the Scientific Data Server
```bash
cd data
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python server.py 8000
```

#### 2. Start the Robotics Subsystem
```bash
cd robot
python -m venv .venv
.\.venv\Scripts\activate
pip install -e .
python -m terrainx_robot dashboard --port 8777
```

#### 3. Start the Web & WebXR Interface
```bash
cd interface
npm install
npm run dev
```
Navigate to **`https://localhost:3000`** in your browser or Meta Quest Browser.

---

## 🌐 Standalone Precompiled Demo

If you wish to explore the interface without running Python servers or connecting robotic hardware, we provide a **100% self-contained static demo** in the **[`demo/`](demo/)** directory:

- **Direct Open**: Double-click [`demo/index.html`](demo/index.html) in any web browser.
- **Local HTTP Server**:
  ```bash
  cd demo
  python -m http.server 8080
  ```
- **Included Capabilities**: Fully functional 3D Babylon.js globe (Earth, Moon, Mars), 2D radar sweep with certified analogs, interactive 3D DEM terrain surface with wireframe/exaggeration controls, planetary comparison tables, and a Unitree Go2 simulator playing back real pre-recorded LiDAR SLAM point clouds.

---

## 👥 Meet the Engineering Team

<table align="center" style="border: none; text-align: center;">
  <tr>
    <td align="center" width="33%">
      <img src="https://github.com/Elias200333.png" width="130px;" style="border-radius: 50%; border: 3px solid #22d3ee;" alt="Elías Méndez El Bakal"/><br />
      <sub><b>Elías Méndez El Bakal</b></sub><br />
      <small>Robotics & Systems Engineering Lead</small><br />
      <small>CEO & Co-Founder, LincEx Robotics</small><br />
      <a href="https://www.linkedin.com/in/elias-mendez-el-bakal/" target="_blank">
        <img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=flat&logo=linkedin&logoColor=white" alt="LinkedIn"/>
      </a>
    </td>
    <td align="center" width="33%">
      <img src="https://ui-avatars.com/api/?name=Froilan+Quinde&background=0284c7&color=ffffff&size=130&bold=true" width="130px;" style="border-radius: 50%; border: 3px solid #38bdf8;" alt="Froilán Quinde"/><br />
      <sub><b>Froilán Quinde</b></sub><br />
      <small>Full-Stack & 3D WebXR Architect</small><br />
      <small>Graphics & Immersive Computing Specialist</small><br />
      <a href="https://www.linkedin.com/in/froilan-quinde/" target="_blank">
        <img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=flat&logo=linkedin&logoColor=white" alt="LinkedIn"/>
      </a>
    </td>
    <td align="center" width="33%">
      <img src="https://ui-avatars.com/api/?name=Ines+Santana&background=f59e0b&color=0f172a&size=130&bold=true" width="130px;" style="border-radius: 50%; border: 3px solid #f59e0b;" alt="Inés Leticia Santana Agustín"/><br />
      <sub><b>Inés Leticia Santana Agustín</b></sub><br />
      <small>Planetary Geology & Geomorphology Lead</small><br />
      <small>Astrobiology & Analog Benchmarking</small><br />
      <a href="https://www.linkedin.com/in/in%C3%A9s-leticia-santana-agust%C3%ADn-ba4ba5291/" target="_blank">
        <img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=flat&logo=linkedin&logoColor=white" alt="LinkedIn"/>
      </a>
    </td>
  </tr>
</table>

---

## 📜 License & Acknowledgments
- Developed for the **NASA Space Apps Challenge 2026**.
- Powered by open scientific data from NASA (LOLA, MOLA, Blue Marble), USGS, and the Spanish National Geographic Institute (IGN).
- Released under the [MIT License](LICENSE).
