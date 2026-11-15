# 🪐 TERRAIN-X: Planetary Analog Evaluation Engine (`data/` Subsystem)

> **NASA Space Apps Challenge 2026:** *Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars*  
> **Subsystem Root:** `nasa-space-apps-2026/data/`  
> **Core Focus:** Multi-scale scientific verification comparing Earth terrestrial analog sites against Lunar and Martian environments using real orbital, atmospheric, and high-resolution LiDAR topographic data.

---

## 📖 Table of Contents
1. [Overview & Scientific Rationale](#overview--scientific-rationale)
2. [Directory Structure](#directory-structure)
3. [Prerequisites & Installation (Windows, Linux, macOS)](#prerequisites--installation)
4. [Interactive Planetary Analog Analyzer (`main.py`)](#interactive-planetary-analog-analyzer-mainpy)
5. [CLI Usage (Ranking, Sensitivity & Inspection)](#cli-usage)
6. [REST API Execution (Contracts 1.0)](#rest-api-execution)
7. [Geospatial & Planetary Science Concepts](#geospatial--planetary-science-concepts)
8. [Troubleshooting & FAQ](#troubleshooting--faq)

---

## 2. Directory Architecture & Subfolder Index

```
nasa-space-apps-2026/data/
├── README.md                      <- Complete installation and user manual
├── requirements.txt               <- Pinned Python dependencies
├── pyproject.toml                 <- Modern packaging specification
├── main.py                        <- Interactive planetary analog analyzer
├── server.py                      <- Microservice and 3D visualization server
├── generate_terrain_3d.py         <- 3D terrain reconstruction engine
├── analyze_analog.py              <- Analog comparison script
├── docs/
│   ├── SOURCES_STATUS.md          <- Official sources audit & geodetic caveats
│   ├── SAMPLE_RESULTS.md          <- Benchmark rankings & sensitivity report
│   └── BEGINNERS_GUIDE.md         <- Plain-English GIS & planetary geodesy tutorial
├── modules/
│   └── science/
│       ├── schemas.py             <- Pydantic models (External Contracts 1.0)
│       ├── score.py               <- AnalogScorer & MissionProfile logic
│       ├── validation.py          <- Benchmark evaluations & sensitivity engine
│       ├── api.py                 <- FastAPI REST endpoints
│       ├── cli.py                 <- Command-line interface
│       ├── source_adapters/       <- Typed API clients with disk caching
│       │   ├── base.py            <- Cached HTTP requests with retries
│       │   ├── cmr.py             <- NASA CMR (NASADEM, ASTER, HLS, EMIT)
│       │   ├── pds.py             <- NASA Planetary Data System (PDS4)
│       │   ├── ode.py             <- WUSTL Orbital Data Explorer (Moon/Mars)
│       │   ├── trek.py            <- NASA Moon/Mars Trek WMTS capabilities
│       │   └── power.py           <- NASA POWER Daily meteorology & solar API
│       ├── processing/            <- Robust geomorphometry & geodesy
│       │   ├── planetary.py       <- IAU Moon/Mars coordinate guards
│       │   ├── dem.py             <- Horn's slope & Riley's TRI roughness
│       │   └── quality.py         <- Nodata filtering & raster integrity
│       └── features/
│           ├── catalog.py         <- 5 candidate Earth analog sites & controls
│           └── extractors.py      <- Gaussian normalization & feature extraction
├── output_3d/                     <- Generated 3D terrain models and atlases
└── cache/                         <- Local disk cache for API queries
```

---

## 3. NASA APIs & Planetary Datasets Integrated

The system connects dynamically to the following official NASA services:

### Step 1: Open Terminal in the `data` directory
```bash
cd "c:\Users\Usuario\Desktop\github\nasa-space-apps-2026\data"
```

### Step 2: Install Dependencies
```bash
# Windows (PowerShell or Command Prompt)
python -m pip install -r requirements.txt

# Linux / macOS
python3 -m pip install -r requirements.txt
```

---

## 4. Interactive Planetary Analog Analyzer (`main.py`)

Run the interactive multi-domain scientific analyzer. Before computing, it asks you to specify whether the analysis is for **the Moon** or for **Mars**, fetches real telemetry from NASA CMR & NASA POWER, and outputs a complete scientific breakdown:

```bash
# Evaluate Lanzarote Caldera Blanca against Moon
python analyze_analog.py --body moon --site ES_LANZAROTE_CALDERA_BLANCA --radius-m 100.0

# Evaluate Rio Tinto against Mars
python analyze_analog.py --body mars --site ES_RIO_TINTO --radius-m 100.0
```

---

## 5. CLI Usage

The command-line tool allows instant ranking and sensitivity inspection.

### A. Rank all Candidate Sites against Lunar Profile
```bash
python generate_terrain_3d.py --body Moon --site ES_LANZAROTE_CALDERA_BLANCA --radius-m 100.0
```

### D. Run the Automated Pytest Verification Suite
```bash
pytest tests
```

### C. Run Weight Sensitivity Perturbation Analysis ($\pm 25\%$)
```bash
python modules/science/cli.py sensitivity --mission LUNAR_VOLCANIC_CAVITY_V1
```

### D. Inspect a Specific Candidate Site by ID
```bash
python modules/science/cli.py site --id ES_LANZAROTE_CORONA
```

---

## 6. REST API Execution (Contracts 1.0)

Launch the FastAPI microservice on `localhost:8000`:

```bash
uvicorn modules.science.api:app --reload --host 127.0.0.1 --port 8000
```

### Official Endpoints
* `GET /api/v1/sources`: List official verified data sources (NASA CMR, PDS, ODE, Trek, POWER).
* `GET /api/v1/mission-profiles`: List operational mission profiles, weights, and targets.
* `GET /api/v1/sites`: List candidate sites, boundaries, and cited references.
* `GET /api/v1/sites/{site_id}`: Retrieve a single candidate site by ID.
* `POST /api/v1/assessments`: Run evaluation scoring for a candidate site against a mission profile.
* `GET /api/v1/validation/benchmark`: Full ranking table across all catalog sites.
* `GET /api/v1/validation/sensitivity`: Weight sensitivity perturbation trajectory.

Interactive Swagger API documentation is available at `http://127.0.0.1:8000/docs`.

---

## 7. Geospatial & Planetary Science Concepts

For an in-depth, plain-English tutorial explaining:
* Digital Elevation Models (DEMs) and Rasters
* Coordinate Reference Systems (CRS) and why you cannot compute slopes in degrees
* Horn's Slope algorithm and Riley's Terrain Ruggedness Index (TRI)
* Planetary datums (Moon IAU radius $1,737.4\text{ km}$, Mars radius $3,396.2\text{ km}$)
* Why WMTS tiles are for visualization, not metric height calculations

See [`docs/BEGINNERS_GUIDE.md`](docs/BEGINNERS_GUIDE.md).

---

## 9. Troubleshooting & FAQ

### Q: Why do I get `ModuleNotFoundError: No module named 'modules'`?
Run your command from the `data` directory using `python -m modules.science.cli` or `python modules/science/cli.py` (which includes automated path injection).

### Q: Why do planetary rasters fail if I use `EPSG:4326`?
`EPSG:4326` is the terrestrial WGS84 ellipsoid. The Moon is a sphere with a radius of $1,737.4\text{ km}$, and Mars has an equatorial radius of $3,396.2\text{ km}$. Using an Earth ellipsoid on Mars produces massive metric distortion and is physically invalid. TERRAIN-X guards prevent this silently corrupting your calculations.

### Q: Does Earthdata Login require a paid subscription?
No. NASA Earthdata Login is **100% free and open** for research and public exploration. An account is only required when directly downloading raw raster granules (e.g. HLS or EMIT); metadata discovery via CMR, CMR-STAC, and POWER is completely open.
