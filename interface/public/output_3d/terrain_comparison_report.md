# TERRAIN-X: Informe de Verificación Científica de Análogos Planetarios (Radio 100 m)
**NASA Space Apps Challenge 2026 — Validación Rigurosa de Análogos para la Luna y Marte**  
**Fecha de Generación:** `2026-11-15T14:30:26.012404+00:00`  
**Cuerpo Planetario Objetivo:** `EARTH` | **Emparejamiento Orbital:** `Planetary Analog Target (Earth)`

---

## 1. Identificación y Parámetros del Sitio Terrestre
- **Nombre del Sitio:** `Custom AOI (-44.83070°, -80.93440°)` (ID: `ES_LANZAROTE_CALDERA_BLANCA`)
- **Coordenadas Centrales GPS:** `-44.83070° N, -80.93440° E`
- **Radio de Exploración Específico:** **`10000.0 metros`** (Superficie del Área de Ensayo: `314,159,265.4 m²` / `31415.93 ha`)
- **Ventana Visual Contextual:** `25000 × 25000 metros`
- **Sincronización Geodésica:** Sub-píxel en WGS84 (EPSG:4326) con proyección métrica local (desfase: 0 metros)

---

## 2. Métricas del Área de Exploración de 100 Metros de Radio
| Métrica Topográfica en el Área de 100 m | Valor Medido en Datos Reales |
| :--- | :--- |
| **Cota Mínima** | `-3962.8 m` |
| **Cota Máxima** | `-3000.9 m` |
| **Cota Media** | `-3685.2 m` |
| **Desnivel Local (Δz)** | `961.9 m` |
| **Pendiente Media Local (Horn)** | `4.16°` |
| **Pendiente Máxima Local** | `8.4°` |
| **Puntos de Muestreo Activo en 100 m** | `795 celdas` |

---

## 3. Desglose Metodológico de Similitud y Contribución de Pesos

| Dimensión Analógica Evaluada | Valor Medido en Tierra | Valor Objetivo de Referencia en Earth | Coeficiente $S_i$ [0-1] | Peso Asignado ($w_i$) | Contribución al Total ($w_i 	imes S_i$) |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Rango Altimétrico y Relieve** | `1317.2 m (cota -4086--2768 m)` | `~600 m (Martian Volcanic Flank & Sulfate Evaporite (e.g. Arsia Mons / Meridiani Planum))` | `0.137` | `10.0%` | **`1.37%`** |
| **Gradiente de Pendiente (Horn)** | `22.30° (máx 45.2°)` | `8.0° ± 4.0°` | `0.002` | `15.0%` | **`0.03%`** |
| **Rugosidad Superficial (TRI)** | `35.47 m` | `3.0 ± 1.5 m` | `0.0` | `12.0%` | **`0.0%`** |
| **Curvatura Topográfica y Sumideros** | `0.0000 m⁻¹` | `Inversión de colapso (-0.05)` | `0.2` | `8.0%` | **`1.6%`** |
| **Tubos de Lava y Cavidades** | `Evidencia: 70% (Contexto volcánico: 90%)` | `Claraboyas intactas / Pit Craters` | `0.79` | `15.0%` | **`11.85%`** |
| **Morfología de Conos / Cráteres** | `Índice: 60%` | `Cráteres de impacto / conos piroclásticos` | `0.6` | `10.0%` | **`6.0%`** |
| **Composición Espectral y Mineralógica** | `Concordancia: 65%` | `Ferric Oxides (Hematite / Goethite), Jarosite sulfates & Smectite clays` | `0.65` | `20.0%` | **`13.0%`** |
| **Extremos Ambientales e Hiperaridez** | `Proxy Aridez: 90%` | `Desierto poliextremo / Vacío` | `0.9` | `10.0%` | **`9.0%`** |

| **SIMILITUD TOTAL VERIFICADA** | | | | **`100.0%`** | **`42.85%`** |

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
