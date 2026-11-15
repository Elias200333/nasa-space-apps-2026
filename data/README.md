# 🪐 TERRAIN-X: Planetary Analog Evaluation Engine (`data/` Subsystem)

> **NASA Space Apps Challenge 2026:** *Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars*  
> **Subsystem Root:** `nasa-space-apps-2026/data/`  
> **Core Focus:** Multi-scale scientific verification comparing Earth terrestrial analog sites against Lunar and Martian environments using real orbital, atmospheric, and high-resolution LiDAR topographic data.

---

## 1. Executive Summary & Scientific Purpose

The `data/` module provides the scientific backbone of TERRAIN-X. Rather than relying on synthetic geometry or visual approximation, it combines:
1. **Official NASA Data & Planetary APIs:** Real orbital mosaics (NASA Moon/Mars Trek WMTS), laser altimetry benchmarks (LOLA on LRO and MOLA on MGS), atmospheric climatology (NASA POWER), and metadata catalog searches (NASA CMR and Washington University / NASA PDS ODE).
2. **Official High-Resolution Terrestrial Elevation Data:** Official Spanish Instituto Geográfico Nacional (IGN) PNOA-LiDAR WCS (5m MDT05 and 1m MDT01) for Spanish volcanic analogs (Canary Islands), USGS 3DEP LiDAR (1m-10m) for US sites, and global Copernicus DEM / SRTM (30m) for international sites.
3. **Rigorous Geomorphological & Planetary Comparison Engine:** Analytical hillshade, dynamic contour intervals, Riley's TRI topographic roughness, Horn's slope algorithms, and a multi-attribute suitability metric evaluated over an exact 100-meter exploration radius.

---

## 2. Directory Architecture & Subfolder Index

```
nasa-space-apps-2026/data/
├── README.md                      <- (This file) Root architecture, NASA data provenance, and workflows
├── requirements.txt               <- Pinned Python dependencies (requests, numpy, scipy, rasterio, plotly, etc.)
├── pyproject.toml                 <- Project metadata and pytest configuration
├── main.py                        <- Primary execution entry point (selects Moon/Mars or random simulation)
├── analyze_analog.py              <- CLI and multi-domain scientific comparison tool
├── generate_terrain_3d.py         <- 3D WebGL reconstruction, IGN LiDAR WCS fetcher & comparative atlas generator
├── server.py                      <- Local HTTP backend bridge connecting UI to scientific Python routines
├── probe_sources.py               <- Live endpoint verification tool for official NASA and external APIs
├── probe_results.json             <- Verified real-time telemetry and latency log from NASA servers
├── cache/                         <- Local persistent disk cache
│   ├── README.md                  <- Documentation of cached NASA responses and binary rasters
│   ├── dem/                       <- Real elevation tiles (.npy, .tif) from IGN PNOA-LiDAR and Copernicus
│   └── imagery/                   <- Real satellite tiles (.jpg) from NASA Trek, IGN PNOA, and ESRI
├── docs/                          <- Scientific and technical documentation
│   ├── README.md                  <- Index of project guides, methodology, and source status reports
│   ├── BEGINNERS_GUIDE.md         <- Geospatial, GIS, and planetary geodesy primer
│   ├── SAMPLE_RESULTS.md          <- Sensitivity tests and sample evaluation outputs
│   └── SOURCES_STATUS.md          <- Forensic audit of NASA endpoints and terrestrial data providers
├── fixtures/                      <- Deterministic test fixtures for offline development
│   ├── README.md                  <- Purpose of synthetic rasters and decoupling from live APIs
│   ├── synthetic_dem.py           <- Mathematical DEM generator for pytest unit tests
│   └── synthetic_dem_visual.png   <- Visual reference of test fixture
├── modules/                       <- Core Python package architecture
│   ├── README.md                  <- Modular structure description
│   └── science/                   <- Planetary science package
│       ├── README.md              <- Architecture of schemas, validation, scoring, and REST API
│       ├── schemas.py             <- Pydantic models for data contracts and validation
│       ├── score.py               <- AnalogScorer and MissionProfile weight implementations
│       ├── validation.py          <- Benchmark evaluations, positive/negative controls
│       ├── api.py                 <- FastAPI REST endpoints
│       ├── cli.py                 <- Command-line interface utilities
│       ├── features/              <- Planetary analog catalog & feature extraction
│       │   ├── README.md          <- 20-site catalog metadata and terrain feature extractors
│       │   ├── catalog.py         <- 20 peer-reviewed sites (10 Moon, 10 Mars) with WGS84 & UTM coordinates
│       │   └── extractors.py      <- Slope, roughness, and hypsometric feature extractors
│       ├── processing/            <- Geodetic processing and data ingestion
│       │   ├── README.md          <- Data pipeline, IGN LiDAR fetcher, and NASA Trek integration
│       │   ├── real_data.py       <- Real IGN PNOA WCS fetcher, NASA Trek WMTS, and subpixel alignment
│       │   ├── dem.py             <- Horn's slope, contouring, and analytical hillshade
│       │   ├── planetary.py       <- IAU coordinate guards preventing cross-body spatial overlay
│       │   ├── analogy_metrics.py <- Quantitative mathematical scoring between Earth and Moon/Mars
│       │   └── quality.py         <- Integrity verification and nodata handling
│       └── source_adapters/       <- Typed clients for official NASA and PDS APIs
│           ├── README.md          <- Details on CMR, POWER, Trek, PDS, and ODE connectors
│           ├── base.py            <- Base HTTP client with retry logic and sha256 disk caching
│           ├── cmr.py             <- NASA Earthdata Common Metadata Repository client
│           ├── power.py           <- NASA POWER Daily meteorology and solar climatology client
│           ├── trek.py            <- NASA Solar System Treks WMTS capabilities client
│           ├── pds.py             <- NASA Planetary Data System Search API v1 client
│           └── ode.py             <- Washington University / NASA PDS Geosciences ODE client
├── output_3d/                     <- Exported deliverables and analytical artifacts
│   ├── README.md                  <- Overview of generated 3D models, GeoTIFFs, and atlas PNGs
│   ├── dem_ign_real.tif           <- Real GeoTIFF elevation model (IGN PNOA-LiDAR 5m, EPSG:4258)
│   ├── dem_ign_real.npy           <- Serialized NumPy array of the real DEM
│   ├── topographic_map_ign_100m.png <- Real topographic map with hillshade, contours, and 100m radius
│   ├── terrain_3d.html            <- Interactive 3D WebGL visualization (Plotly)
│   ├── comparison_metrics.json    <- Numerical similarity scores and geomorphological metrics
│   ├── thematic_comparison_atlas.png <- Side-by-side verification atlas (Earth vs. Moon/Mars)
│   ├── global_analog_catalog_20.json <- Master catalog of 20 planetary analogs with live scores
│   ├── caldera_blanca/            <- Benchmark output folder for Caldera Blanca (Lanzarote)
│   │   └── README.md              <- Specific site deliverables and validation report
│   └── rio_tinto/                 <- Benchmark output folder for Rio Tinto (Huelva)
│       └── README.md              <- Specific site deliverables and validation report
└── tests/                         <- Automated test suite (pytest)
    ├── README.md                  <- Test suite documentation, assertions, and mock policies
    ├── test_api.py                <- FastAPI endpoint tests
    ├── test_cache.py              <- Disk caching and TTL tests
    ├── test_dem.py                <- Slope, roughness, and hillshade unit tests
    ├── test_planetary.py          <- IAU coordinate guard unit tests
    ├── test_scorer.py             <- Metric scoring and sensitivity tests
    ├── test_validation.py         <- Benchmark positive and negative control validation
    └── conftest.py                <- Pytest configuration and shared fixtures
```

---

## 3. NASA APIs & Planetary Datasets Integrated

The system connects dynamically to the following official NASA services:

| NASA Service | Official Endpoint | Mission / Instrument | Usage in TERRAIN-X |
| :--- | :--- | :--- | :--- |
| **NASA CMR** | `https://cmr.earthdata.nasa.gov/search` | ASTER GDEM v3, NASADEM, EMIT, HLS | Real-time discovery of orbital elevation and surface mineralogy collections. |
| **NASA POWER** | `https://power.larc.nasa.gov/api/temporal/daily/point` | Satellite Solar & Meteorological Reanalysis | Daily temperature ($T_{2M}$), precipitation ($PRECTOTCORR$), and solar insolation. |
| **NASA Moon Trek** | `https://trek.nasa.gov/tiles/Moon/EQ` | LRO LROC WAC, LOLA Laser Altimeter | Real 303 ppd visual mosaics and 128 ppd color shaded relief altimetry. |
| **NASA Mars Trek** | `https://trek.nasa.gov/tiles/Mars/EQ` | Viking MDIM2.1, MGS MOLA Altimeter | Global true-color orbital basemaps (232 m/px) and MOLA hypsometric relief (463 m/px). |
| **NASA PDS** | `https://pds.nasa.gov/api/search/1` | LRO, MRO (HiRISE, CRISM), MSL, M2020 | Search and metadata discovery for raw planetary mission observations. |
| **WUSTL ODE** | `https://oderest.rsl.wustl.edu/live2/` | LOLA EDR (Moon), MOLA MEGDR (Mars) | Querying individual orbital laser altimeter profile tracks and products. |

---

## 4. Execution Commands

### A. Run Stochastic / Random Planetary Simulation
```bash
python main.py --random
```
*Selects a random Moon or Mars analog from the 20-site catalog, injects realistic spatial jitter within the geological boundaries, fetches real DEM and satellite imagery, and generates synchronized 3D deliverables.*

### B. Evaluate a Specific Planetary Analog Site
```bash
# Evaluate Lanzarote Caldera Blanca against Moon
python analyze_analog.py --body moon --site ES_LANZAROTE_CALDERA_BLANCA --radius-m 100.0

# Evaluate Rio Tinto against Mars
python analyze_analog.py --body mars --site ES_RIO_TINTO --radius-m 100.0
```

### C. Generate Synchronized 100m 3D Terrain & Topographic Maps
```bash
python generate_terrain_3d.py --body Moon --site ES_LANZAROTE_CALDERA_BLANCA --radius-m 100.0
```

### D. Run the Automated Pytest Verification Suite
```bash
pytest tests
```
*(All 18 unit tests should pass in under 3 seconds).*
