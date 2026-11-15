# Tactical Inspection Console (`interface/src/desk`)

## Responsibility
The `desk` module manages the bottom scientific console desk in both the desktop web view and the WebXR spatial environment. It synchronizes 2D geospatial navigation with 3D DEM elevation charts, slope analyses, and morphological similarity scoring.

---

## File Breakdown

### `analogDesk.ts`
- **Role**: Console coordinator and metrics display.
- **Key Logic**:
  - Displays real-time geodetic coordinates, geographic region names, and target planetary benchmarks.
  - Renders 3D DEM isometric models generated from Copernicus DEM 30m or IGN LiDAR.
  - Computes and visualizes the multi-criteria similarity metric ($S_{\text{pct}}$) and Pearson correlation ($R$) comparing terrestrial volcanic flanks against Martian or Lunar morphology.
  - Integrates direct triggers to launch the subterranean cave exploration workflow.
