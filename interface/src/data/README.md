# Planetary Data & Model State (`interface/src/data`)

## Responsibility
The `data` module provides the embedded scientific knowledge base and reactive state stores for planetary analogs, digital elevation models (DEM), and morphological comparison metrics.

---

## File Breakdown

### `analogs.ts`
- **Role**: Certified NASA Planetary Analog Registry.
- **Key Logic**:
  - Contains detailed scientific records for top-tier terrestrial analogs:
    - **Lanzarote / Caldera Blanca & Timanfaya** (Basaltic volcanic plains & lava tubes vs Tharsis Flanks, Mars).
    - **Río Tinto** (Acidic iron-sulfate / jarosite deposits vs Meridiani Planum, Mars).
    - **Fuerteventura / Malpaís de la Arena** (Rough blocky basalt pavements vs Marius Hills, Moon).
    - **Atacama / Yungay** (Hyperarid perchlorate regolith vs Gale Crater, Mars).
    - **Haleakalā & Kaumana, Hawaii** (Pyroclastic deposits & shield volcano pits vs Lunar Maria).
  - Each record specifies elevation relief, mean slope, UTM projection, target planetary analog pairing, and scientific training value.

### `terrainModel.ts`
- **Role**: Reactive DEM state manager.
- **Key Logic**:
  - Implements an event-driven singleton tracking the active DEM grid, bounding box, elevation statistics ($\text{Min}, \text{Max}, \text{Mean}, \sigma$), and Plotly HTML visualization URLs.
  - Automatically fetches updated metrics from `/output_3d/comparison_metrics.json` when a new survey site is selected.
