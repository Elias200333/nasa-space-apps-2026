# 🧪 Automated Test Suite (`data/tests/`)

## Overview

The `data/tests/` directory contains the complete automated test suite powering the TERRAIN-X scientific verification engine. Tests are executed via `pytest` to guarantee mathematical correctness, geodetic safety, and schema integrity across all algorithms.

---

## Test Modules Index

| Test File | Test Cases | Objective |
| :--- | :---: | :--- |
| **`test_api.py`** | 4 | Tests FastAPI REST endpoints (`/health`, `/sites`, `/evaluate`, `/nasa/sources`) using Starlette's `TestClient`. Ensures schema validation and JSON serialization. |
| **`test_cache.py`** | 1 | Tests deterministic disk caching, SHA-256 parameter hashing, TTL expiry, and corrupt file recovery using a mock endpoint (`https://mock.nasa.gov/api/data`). |
| **`test_dem.py`** | 4 | Tests Horn's slope equation, Riley's TRI roughness calculation, multidirectional hillshade, and nodata filtering using synthetic control rasters from `fixtures/synthetic_dem.py`. |
| **`test_planetary.py`** | 4 | Tests `PlanetaryCRSGuard`. Asserts that terrestrial CRS (`EPSG:4326`, `WGS84`) cannot be silently assigned to extraterrestrial bodies, and rejects pixel-level raster superposition between Earth, Moon, and Mars. |
| **`test_scorer.py`** | 2 | Tests `AnalogScorer` multi-attribute suitability calculations, weight balancing, feature contributions, and penalty behavior when data is incomplete. |
| **`test_validation.py`** | 3 | Tests positive and negative control benchmarks (e.g. Lanzarote volcanic cavity $> 0.60$, Atacama hyperarid plain $< 0.25$ for lunar cavity mission), plus Monte Carlo sensitivity analysis. |
| **`conftest.py`** | N/A | Pytest configuration file setting up shared fixtures, temporary directories, and mock responses. |

---

## Execution Instructions

To execute all unit tests within the `data/` environment:

```bash
cd data
python -m pytest tests -v
```

### Expected Output
```text
======================== 18 passed in ~2.0s ========================
```

---

## Test Policy: Mocks vs. Live Endpoints

- **CI/CD Determinism:** Unit tests in this directory rely on local fixtures and isolated HTTP mocks to guarantee sub-second execution without exhausting rate limits on live NASA APIs.
- **Live Endpoint Verification:** Real-time probing of active NASA servers is handled separately by `python probe_sources.py`, which records live latency and HTTP status codes in `probe_results.json`.
