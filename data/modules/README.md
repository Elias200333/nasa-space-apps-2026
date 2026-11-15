# 📦 Scientific Modules Architecture (`data/modules/`)

## Overview

The `data/modules/` directory organizes the modular Python packages powering the TERRAIN-X planetary exploration and geospatial comparison engine.

---

## Subpackages

- **[`science/`](file:///c:/Users/Usuario/OneDrive/Escritorio/github/nasa-space-apps-2026/data/modules/science/):**
  - Core planetary science package implementing data models, scoring algorithms, REST APIs, geodetic processing, and NASA source adapters.

---

## Design Principles

1. **Modularity & Separation of Concerns:** Network I/O is isolated in `source_adapters/`, geoprocessing in `processing/`, catalogs in `features/`, and validation rules in `score.py` and `validation.py`.
2. **Type Safety & Schema Enforcement:** Data payloads are strictly validated using Pydantic models in `schemas.py`.
3. **Planetary Guarding:** Planetary coordinate systems are strictly separated to prevent accidental cross-body projection between Earth, Moon, and Mars.
