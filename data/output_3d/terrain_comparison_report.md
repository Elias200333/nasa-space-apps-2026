# TERRAIN-X: Informe de Verificación Científica de Análogos Planetarios (Radio 100 m)
**NASA Space Apps Challenge 2026 — Validación Rigurosa de Análogos para la Luna y Marte**  
**Fecha de Generación:** `2026-11-15T11:18:39.345003+00:00`  
**Cuerpo Planetario Objetivo:** `EARTH` | **Emparejamiento Orbital:** `Planetary Analog Target (Earth)`

---

## 1. Identificación y Parámetros del Sitio Terrestre
- **Nombre del Sitio:** `Custom AOI (35.58329°, -111.63886°)` (ID: `US_ARIZONA_SP_CRATER`)
- **Coordenadas Centrales GPS:** `35.58329° N, -111.63886° E`
- **Radio de Exploración Específico:** **`100.0 metros`** (Superficie del Área de Ensayo: `31,415.9 m²` / `3.14 ha`)
- **Ventana Visual Contextual:** `800 × 800 metros`
- **Sincronización Geodésica:** Sub-píxel en WGS84 (EPSG:4326) con proyección métrica local (desfase: 0 metros)

---

## 2. Métricas del Área de Exploración de 100 Metros de Radio
| Métrica Topográfica en el Área de 100 m | Valor Medido en Datos Reales |
| :--- | :--- |
| **Cota Mínima** | `1972.0 m` |
| **Cota Máxima** | `2033.1 m` |
| **Cota Media** | `2002.3 m` |
| **Desnivel Local (Δz)** | `61.1 m` |
| **Pendiente Media Local (Horn)** | `19.57°` |
| **Pendiente Máxima Local** | `24.26°` |
| **Puntos de Muestreo Activo en 100 m** | `75 celdas` |

---

## 3. Desglose Metodológico de Similitud y Contribución de Pesos

| Dimensión Analógica Evaluada | Valor Medido en Tierra | Valor Objetivo de Referencia en Earth | Coeficiente $S_i$ [0-1] | Peso Asignado ($w_i$) | Contribución al Total ($w_i 	imes S_i$) |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Rango Altimétrico y Relieve** | `235.1 m (cota 1867-2102 m)` | `~600 m (Martian Volcanic Flank & Sulfate Evaporite (e.g. Arsia Mons / Meridiani Planum))` | `0.598` | `10.0%` | **`5.98%`** |
| **Gradiente de Pendiente (Horn)** | `3.60° (máx 8.8°)` | `8.0° ± 4.0°` | `0.546` | `15.0%` | **`8.19%`** |
| **Rugosidad Superficial (TRI)** | `5.19 m` | `3.0 ± 1.5 m` | `0.346` | `12.0%` | **`4.15%`** |
| **Curvatura Topográfica y Sumideros** | `0.0000 m⁻¹` | `Inversión de colapso (-0.05)` | `0.2` | `8.0%` | **`1.6%`** |
| **Tubos de Lava y Cavidades** | `Evidencia: 70% (Contexto volcánico: 90%)` | `Claraboyas intactas / Pit Craters` | `0.79` | `15.0%` | **`11.85%`** |
| **Morfología de Conos / Cráteres** | `Índice: 60%` | `Cráteres de impacto / conos piroclásticos` | `0.6` | `10.0%` | **`6.0%`** |
| **Composición Espectral y Mineralógica** | `Concordancia: 65%` | `Ferric Oxides (Hematite / Goethite), Jarosite sulfates & Smectite clays` | `0.65` | `20.0%` | **`13.0%`** |
| **Extremos Ambientales e Hiperaridez** | `Proxy Aridez: 90%` | `Desierto poliextremo / Vacío` | `0.9` | `10.0%` | **`9.0%`** |

| **SIMILITUD TOTAL VERIFICADA** | | | | **`100.0%`** | **`59.77%`** |

---

## 4. Procedencia y Metadatos de los Datasets Utilizados

| Dataset | Agencia / Misión | Resolución Espacial | Cobertura | Licencia / Procedencia |
| :--- | :--- | :--- | :--- | :--- |
| **Sentinel-2 / Landsat Composite** | ESA / NASA / USGS / ESRI | 1.1 m/px (Zoom 16) | Global | Open Earth Observation Policy |
| **SRTM / Copernicus DEM** | NASA JPL / NGA / DLR / IGN | 30 m (interpolado geodésico) | 60°N - 56°S | NASA Open Data Policy |
| **NASA Moon Trek (LRO WAC)** | NASA JPL / LROC Science Team | ~100 m/px | Global Lunar | NASA Planetary Data System (PDS) |
| **NASA Mars Trek (Viking MDIM21)** | NASA JPL / USGS Astrogeology | 232 m/px | Global Marciano | NASA Planetary Data System (PDS) |
| **LOLA Laser Altimeter** | NASA GSFC / LRO Mission | 10 cm vertical / ~20 m horiz | Transectos Lunares | NASA PDS Geosciences Node |
| **MOLA Laser Altimeter** | NASA GSFC / MGS Mission | 30 cm vertical / ~300 m horiz | Transectos Marcianos | NASA PDS Geosciences Node |

---

## 5. Justificación Geológica y Límites de la Analogía

### ¿Por qué es un análogo fuerte?
- **Fuerza Analógica:** Geomorphological analog identified through coordinate analysis.

### ¿Dónde se rompe la analogía? (Límites obligatorios)
- **Límite / Ruptura de la Analogía:** Specific ground-truth field data requires verification.

### Utilidad para el Entrenamiento de Misiones Espaciales:
- **Entrenamiento Operacional:** Terrain trafficability, crater rim mapping, and sensor testing.
