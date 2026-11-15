# 🛰️ Official NASA Source Adapters (`data/modules/science/source_adapters/`)

## Overview

The `data/modules/science/source_adapters/` package provides typed, resilient Python client adapters connecting TERRAIN-X directly to official NASA Earth Science and Planetary Science APIs.

---

## Client Adapters Index

```
data/modules/science/source_adapters/
├── README.md        <- (This file) Protocol definitions and endpoint documentation
├── base.py          <- Base HTTP client with retry backoff and sha256 disk caching
├── cmr.py           <- NASA Common Metadata Repository (CMR) Earthdata client
├── power.py         <- NASA POWER Daily meteorology & solar climatology client
├── trek.py          <- NASA Solar System Treks WMTS client (Moon & Mars)
├── pds.py           <- NASA Planetary Data System (PDS4) Search API client
└── ode.py           <- Washington University / NASA PDS Geosciences ODE client
```

---

## Detailed Adapter Specifications

### 1. `cmr.py` (NASA Earthdata CMR Client)
- **Base URL:** `https://cmr.earthdata.nasa.gov/search/`
- **Protocol:** REST JSON
- **Authentication:** Public search (Earthdata Login for restricted granule downloads).
- **Key Methods:**
  - `search_collection_concept_id(short_name, version)`: Finds concept IDs for global datasets (e.g., `ASTGTM` v003 -> `C1711961296-LPCLOUD`, `NASADEM` -> `C2439422590-LPCLOUD`).
  - `search_granules(concept_id, bounding_box)`: Locates spatial granule footprints covering a specific analog site.
- **Datasets Queried:** ASTER GDEM v3, NASADEM, EMIT Surface Mineralogy (`EMITL2BMIN`), and Harmonized Landsat Sentinel-2 (`HLSL30`).

### 2. `power.py` (NASA POWER Climatology Client)
- **Base URL:** `https://power.larc.nasa.gov/api/temporal/daily/point`
- **Managed By:** NASA Langley Research Center (LaRC).
- **Protocol:** REST JSON
- **Authentication:** Open Access (No API key required).
- **Parameters Retrieved:**
  - `T2M`: Temperature at 2 meters above ground (°C).
  - `PRECTOTCORR`: Corrected daily precipitation (mm/day).
  - `ALLSKY_SFC_SW_DWN`: All-sky solar insolation incident on a horizontal surface ($MJ/m^2/day$).
- **Application:** Provides empirical environmental context for terrestrial analog sites to evaluate thermal stability and surface aridity proxies.

### 3. `trek.py` (NASA Solar System Treks WMTS Client)
- **Base URLs:**
  - Moon: `https://trek.nasa.gov/tiles/Moon/EQ`
  - Mars: `https://trek.nasa.gov/tiles/Mars/EQ`
- **Managed By:** NASA Solar System Treks / Jet Propulsion Laboratory (JPL).
- **Protocol:** OGC WMTS (Web Map Tile Service) 1.0.0.
- **Layers Managed:**
  - `LRO_WAC_Mosaic_Global_303ppd_v02`: Lunar global orbital visual mosaic.
  - `LRO_LOLA_ClrShade_Global_128ppd_v04`: Lunar Orbiter Laser Altimeter color shaded relief.
  - `Mars_Viking_MDIM21_ClrMosaic_global_232m`: Martian global visual basemap.
  - `Mars_MGS_MOLA_ClrShade_merge_global_463m`: Mars Orbiter Laser Altimeter shaded relief.
- **Methods:** `get_tile_template(body, layer_name)` generates slippy map template strings `{z}/{y}/{x}`.

### 4. `pds.py` (NASA Planetary Data System Client)
- **Base URL:** `https://pds.nasa.gov/api/search/1/`
- **Managed By:** NASA Planetary Data System.
- **Protocol:** REST JSON (PDS4 search protocol).
- **Application:** Metadata search for raw planetary instrument datasets across Lunar and Martian orbital missions.

### 5. `ode.py` (Washington University ODE Client)
- **Base URL:** `https://oderest.rsl.wustl.edu/live2/`
- **Managed By:** Washington University in St. Louis (WUSTL) / NASA PDS Geosciences Node.
- **Protocol:** REST JSON.
- **Target Bodies:** `target=moon` and `target=mars`.
- **Product Types:** `LOLA_EDR` (Lunar Orbiter Laser Altimeter Experiment Data Records) and `MOLA_MEGDR` (Mars Orbiter Laser Altimeter Mission Experiment Gridded Data Records).
- **Methods:** `search_products(target_body, product_type, limit)` retrieves calibrated planetary track records.

### 6. `base.py` (Resilient HTTP Base Client)
- Standardized user-agent header: `TERRAIN-X-ScienceEngine/2.0 (NASA Space Apps 2026)`.
- Automatic disk caching via SHA-256 parameter hashing in `data/cache/`.
- Exponential backoff retry logic for intermittent network drops.
