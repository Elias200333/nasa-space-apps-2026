# 2D Cartographic Map & Radar (`interface/src/map`)

## Responsibility
The `map` module delivers high-resolution 2D geospatial visualization using **Leaflet**. It renders orbital imagery, digital elevation color-ramps, and live radar overlays for planetary analog sites.

---

## File Breakdown

### `analogMap2D.ts`
- **Role**: Map container and geospatial interactions.
- **Key Logic**:
  - Multi-provider layer stack:
    - **Esri World Imagery**: Sub-meter resolution satellite photography for terrestrial analog sites.
    - **OpenStreetMap**: Geographic topography and political boundaries.
    - **NASA Trek Cartography**: WMTS layers for Moon (LRO WAC) and Mars (Viking MDIM2.1).
  - Crosshair targeting radar with range rings ($5\text{ km}, 10\text{ km}, 20\text{ km}$).
  - Area-of-Interest (AOI) bounding box selection: Allows operators to define custom survey zones and trigger server-side DEM extraction.
  - Interactive site markers with similarity badges and direct 3D generation triggers.
