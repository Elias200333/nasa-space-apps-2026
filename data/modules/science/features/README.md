# 🗺️ Planetary Features & Analog Catalog (`data/modules/science/features/`)

## Overview

The `data/modules/science/features/` module manages the peer-reviewed catalog of 20 planetary analog locations (10 for the Moon and 10 for Mars) and implements quantitative terrain feature extraction from digital elevation models.

---

## Files in this Directory

### 1. `catalog.py` (The 20-Site Planetary Analog Catalog)
Defines the `ExtendedAnalogSite` data structure and the comprehensive global catalog `EXPANDED_ANALOG_CATALOG`:

- **10 Lunar Analog Sites:**
  1. *Malpaís de la Arena & Complejo Basal (Fuerteventura, Spain)* -> Lunar Mare Rough Blocky Transition Terraces.
  2. *SP Crater & San Francisco Volcanic Field (Arizona, USA)* -> Marius Hills Cones / Gruithuisen Domes.
  3. *Mauna Kea Summit & Tephra Cones (Hawaii, USA)* -> Lunar Highlands & Pyroclastic Glass Deposits.
  4. *Caldera Blanca Crater (Lanzarote, Spain)* -> Lunar Mare Basalt & Pit Crater (Marius Hills).
  5. *Lava Beds National Monument / Valentine Cave (California, USA)* -> Oceanus Procellarum / Marius Hills Pit.
  6. *Lonar Impact Crater (Maharashtra, India)* -> Simple Impact Crater in Flood Basalts.
  7. *Holuhraun & Askja Caldera (Central Highlands, Iceland)* -> Young Basaltic Mare Rilles.
  8. *Sudbury Impact Structure & Breccias (Ontario, Canada)* -> South Pole-Aitken (SPA) Basin & Impact Melt Sheet.
  9. *Ries Crater / Nördlingen (Bavaria, Germany)* -> Transition Impact Crater & Suevite Breccia.
  10. *Shackleton Rim High-Altitude Cryo-Desert (Chile/Antarctica)* -> Permanent Shadowed Regions (PSR) Volatiles.

- **10 Martian Analog Sites:**
  1. *Río Tinto Acidic Fluvial Basin (Huelva, Spain)* -> Meridiani Planum Jarosite & Hematite Deposits.
  2. *Yungay Hyperarid Core (Atacama Desert, Chile)* -> Martian Hyperarid Regolith & Perchlorate Salt Crusts.
  3. *McMurdo Dry Valleys / University Valley (Antarctica)* -> Martian Polar Layered Deposits & Regolith Ice.
  4. *Haughton Impact Crater (Devon Island, High Arctic, Canada)* -> Noachian Glaciated Impact Crater in Cold Desert.
  5. *Hanksville / San Rafael Swell (Utah, USA)* -> Jezero Crater / Eberswalde Deltaic Inverted Channels.
  6. *Timanfaya Volcanic Field & Montañas del Fuego (Lanzarote, Spain)* -> Elysium Planitia & Tharsis Fresh Lava Plains.
  7. *Al-Lisan & Dead Sea Evaporite Basin (Jordan/Israel)* -> Gale Crater Evaporite & Sulfate-Rich Sequences.
  8. *Pico del Teide High-Altitude Volcanic Summit (Tenerife, Spain)* -> Tharsis Montes Volcanic Flanks & Tephra.
  9. *Salinas Grandes & Puna Hyper-Saline Salares (Argentina)* -> Martian Chloride Salt Flats & Ephemeral Brines.
  10. *Danakil Depression & Dallol Hydrothermal System (Afar, Ethiopia)* -> Early Mars Acid-Sulfate Geothermal Environments.

Each site entry includes:
- Exact WGS84 coordinates and local metric UTM EPSG projection codes.
- Elevation envelopes verified against official LiDAR and satellite altimetry.
- Direct scientific pairing with official NASA mission targets and geographic landmarks (e.g. Gale Crater, Jezero Crater, Marius Hills, Arsia Mons).
- Primary geological references and DOI citations.

---

### 2. `extractors.py` (Quantitative Feature Extraction)
Extracts mathematical terrain metrics from elevation arrays:
- **Slope Distribution:** Computes mean, 90th percentile, and standard deviation of surface gradient.
- **Topographic Ruggedness Index (TRI):** Computes Riley's root-mean-square elevation difference across neighbor cells.
- **Hypsometric Curve & Relief Ratio:** Quantifies crater rim-to-floor depth profiles and volcanic cone elevation gradients.
- **Gaussian Normalization:** Maps raw physical units into standardized `[0.0, 1.0]` suitability indices.
