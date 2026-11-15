# 🧪 Test Fixtures Directory (`data/fixtures/`)

## Overview

The `data/fixtures/` directory contains deterministic synthetic rasters and visual calibration assets used **strictly for automated unit testing (`pytest`) and offline pipeline verification**.

---

## Contents

1. **`synthetic_dem.py`:**
   - Generates mathematically controlled NumPy elevation grids (`create_test_dem`, `create_tilted_plane_dem`, `create_crater_depression_dem`, `create_nodata_dem`).
   - Used in `tests/test_dem.py` to test Horn's slope equation, Riley's TRI roughness algorithm, and nodata masking against known analytical solutions without requiring internet connectivity.

2. **`synthetic_dem_visual.png`:**
   - Rendered visual reference showing the synthetic crater and slope geometries.

---

## ⚠️ Critical Distinction: Not Used in Production

- **Unit Testing Only:** The procedural formulas (`sin`, `cos`, `exp`) implemented in this folder are **never invoked in real analog site evaluations or 3D terrain reconstruction**.
- **Real Production Pipeline:** When assessing candidates in `main.py`, `analyze_analog.py`, or `generate_terrain_3d.py`, the system requires **real physical DEMs** from official IGN PNOA-LiDAR or Copernicus/SRTM servers.
