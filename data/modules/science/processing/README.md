# ⚙️ Geospatial & Planetary Data Processing (`data/modules/science/processing/`)

## Overview

The `data/modules/science/processing/` module implements the end-to-end data pipeline responsible for fetching, cropping, georeferencing, analyzing, and comparing real digital elevation models and satellite imagery.

---

## Files in this Directory

### 1. `real_data.py` (Real Geospatial Ingestion Engine)
- **`IGNPnoaLidarFetcher`:**
  - Connects to the official Spanish Instituto Geográfico Nacional (IGN) WCS 2.0.1 service (`https://servicios.idee.es/wcs-inspire/mdt`).
  - Requests MDT05 (`Elevacion4258_5`) 5-meter LiDAR elevation rasters directly via standard OGC GetCoverage requests.
  - Queries MDT01 (1-meter LiDAR) availability, reporting CNIG download sheet availability when WCS serves 5m.
  - Integrates Spanish PNOA-MA WMS (`https://www.ign.es/wms-inspire/pnoa-ma`) for high-resolution aerial orthophotography.
  - Implements `generate_real_topographic_image`: analytical multidirectional hillshade, dynamic contour intervals (1m, 2m, 5m, 10m), scale bar, north arrow, and glowing 100-meter exploration perimeter.
- **`RealEarthDataFetcher`:**
  - Manages national (IGN) and global (Copernicus DEM / SRTM via OpenTopoData) elevation ingestion with zero geographic offset.
  - Downloads, stitches, and sub-pixel crops real satellite tiles from ESRI World Imagery and IGN PNOA.
- **`RealPlanetaryDataFetcher`:**
  - Ingests official planetary mosaics from NASA Moon Trek WMTS (`LRO_WAC_Mosaic_Global_303ppd_v02`) and NASA Mars Trek WMTS (`Mars_Viking_MDIM21_ClrMosaic_global_232m`).
  - Fetches and renders calibrated altimetric transects from LOLA (Lunar Orbiter Laser Altimeter) and MOLA (Mars Orbiter Laser Altimeter).

### 2. `dem.py` (Morphometry & Topographic Derivatives)
- Implements Horn's finite-difference slope equation (`compute_slope_deg`).
- Computes Riley's Topographic Ruggedness Index (`compute_tri_roughness`).
- Generates analytical hillshade arrays and hypsometric elevation tinting.

### 3. `planetary.py` (IAU Coordinate Guards)
- Enforces strict planetary geodesy standards established by the International Astronomical Union (IAU 2015).
- Rejects cross-body coordinate contamination (e.g., prevents applying Earth's WGS84 datum to Moon's `IAU_2015:30100` or Mars' `IAU_2015:49900`).
- Prohibits raster-level map overlay between distinct celestial bodies, restricting comparisons to normalized feature space.

### 4. `analogy_metrics.py` (Quantitative Similarity Engine)
- Implements the multi-criteria mathematical comparison between terrestrial analog sites and target planetary environments (Moon or Mars).
- Computes weighted feature similarity percentages, penalties, and comprehensive breakdown tables.

### 5. `quality.py` (Raster Integrity Validation)
- Filters invalid nodata pixels (`-9999`, `NaN`, `Inf`).
- Checks raster variance and flags degenerate flat surfaces or sensor dropouts.
