# 🔬 Core Planetary Science Package (`data/modules/science/`)

## Overview

The `data/modules/science/` package contains the analytical engines, REST APIs, and mathematical validation pipelines for evaluating terrestrial analog sites against NASA planetary mission profiles.

---

## File Breakdown

1. **`schemas.py`:**
   - Formal Pydantic schemas defining data contracts (`AnalogSite`, `MissionProfile`, `EvaluationResult`, `SourceRecord`, `GeospatialBoundingBox`).
   - Validates incoming requests and enforces typing rules across the application.

2. **`score.py`:**
   - Implements the `AnalogScorer` engine.
   - Evaluates multi-attribute suitability scores based on mission profile weights (e.g., volcanic context, cave accessibility, slope, roughness, aridity, thermal stability).
   - Computes data completeness and confidence indices, penalizing missing or unverified fields.

3. **`validation.py`:**
   - Benchmark validation suite ensuring the engine behaves predictably.
   - Asserts that positive control sites (e.g. Lanzarote lava tubes) achieve high suitability (> 0.65) while negative control sites (e.g. hyperarid sedimentary plains) score low (< 0.25) for subterranean cavity exploration.
   - Implements Monte Carlo sensitivity analysis to quantify weight perturbation impact.

4. **`api.py`:**
   - Production FastAPI application exposing REST endpoints:
     - `GET /health`: Service health check.
     - `GET /sites`: List registered analog sites.
     - `POST /evaluate`: Run multi-domain evaluation for a specific site and mission profile.
     - `GET /nasa/sources`: Retrieve live connection status of NASA endpoints.

5. **`cli.py`:**
   - Command-line interface utilities providing formatted tables, rankings, and sensitivity reports.

---

## Subdirectories

- **[`features/`](file:///c:/Users/Usuario/OneDrive/Escritorio/github/nasa-space-apps-2026/data/modules/science/features/):** 20-site planetary catalog and terrain feature extraction.
- **[`processing/`](file:///c:/Users/Usuario/OneDrive/Escritorio/github/nasa-space-apps-2026/data/modules/science/processing/):** Geoprocessing, IGN LiDAR WCS client, and NASA Trek integration.
- **[`source_adapters/`](file:///c:/Users/Usuario/OneDrive/Escritorio/github/nasa-space-apps-2026/data/modules/science/source_adapters/):** Typed clients for official NASA CMR, POWER, Trek, PDS, and ODE APIs.
