# 📦 Exported 3D Deliverables & Comparative Atlases (`data/output_3d/`)

## Overview

The `data/output_3d/` directory contains all generated scientific deliverables produced by `main.py`, `generate_terrain_3d.py`, and `analyze_analog.py`. Every file in this folder is derived from verified geospatial and planetary data sources.

---

## Deliverables Summary

| File | Format | Source Data | Description |
| :--- | :--- | :--- | :--- |
| **`dem_ign_real.tif`** | GeoTIFF (32-bit float) | IGN PNOA-LiDAR MDT05 (WCS) | Real 5-meter resolution elevation model georeferenced in `EPSG:4258` (ETRS89 / WGS84). Zero synthetic bias. |
| **`dem_ign_real.npy`** | NumPy Array (.npy) | IGN PNOA-LiDAR MDT05 | Serialized 2D elevation grid array for fast computational reuse. |
| **`topographic_map_ign_100m.png`** | Image (PNG, 220 DPI) | IGN PNOA-LiDAR MDT05 | Real topographic map featuring analytical hillshade, elevation color ramp, dynamic contours, 100m circular exploration radius, scale bar, and north arrow. |
| **`terrain_3d.html`** | Interactive WebGL | IGN LiDAR / Plotly 3D | Fully interactive 3D mesh with draped surface satellite luminance, contour overlays, and the glowing 100-meter perimeter. |
| **`comparison_metrics.json`** | JSON | Multi-Metric Analysis | Full quantitative breakdown: 100m elevation range, mean slope, TRI roughness, and domain-by-domain similarity percentages. |
| **`thematic_comparison_atlas.png`** | High-Res Atlas (PNG) | IGN + NASA Moon/Mars Trek | 6-panel side-by-side comparative atlas displaying real Earth orthophoto, IGN DEM, slope map, depression analysis, LOLA/MOLA cross-section, and metric breakdown. |
| **`global_analog_catalog_20.json`** | JSON Database | 20 Catalog Sites | Master database of the 20 planetary analogs (10 Moon, 10 Mars) with live rankings, GPS coordinates, UTM codes, and scores. |

---

## Subdirectories

- **[`caldera_blanca/`](file:///c:/Users/Usuario/OneDrive/Escritorio/github/nasa-space-apps-2026/data/output_3d/caldera_blanca/):** Complete deliverable package specifically generated for Caldera Blanca (Lanzarote, Spain) as a lunar impact / pit crater analog.
- **[`rio_tinto/`](file:///c:/Users/Usuario/OneDrive/Escritorio/github/nasa-space-apps-2026/data/output_3d/rio_tinto/):** Complete deliverable package specifically generated for Río Tinto (Huelva, Spain) as a martian acid-sulfate / jarosite fluvial analog.
