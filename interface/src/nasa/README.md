# NASA Solar System Treks Cartography (`interface/src/nasa`)

## Responsibility
The `nasa` module encapsulates connection endpoints and WMTS/XYZ tile stream formatting for NASA's Solar System Treks portals (Moon Trek, Mars Trek, Vesta Trek).

---

## File Breakdown

### `trekProviders.ts`
- **Role**: Tile provider directory.
- **Key Logic**:
  - Provides tile server template strings and coordinate transformations for:
    - **Moon Trek LRO WAC Global Mosaic**: $100\text{ m/pixel}$ lunar visual basemap.
    - **Moon LOLA Shaded Relief**: Laser altimeter elevation color ramp.
    - **Mars Trek Viking MDIM2.1 Global Mosaic**: Global true-color photographic mosaic.
    - **Mars MOLA Elevation**: Mars Orbiter Laser Altimeter colored topography.
