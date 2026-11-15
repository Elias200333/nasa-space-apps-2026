# TERRAIN-X: Informe de Verificación Científica de Análogos Planetarios (Radio 100 m)
**NASA Space Apps Challenge 2026 — Validación Rigurosa de Análogos para la Luna y Marte**  
**Fecha de Generación:** `2026-11-14T22:32:17.861181+00:00`  
**Cuerpo Planetario Objetivo:** `MOON` | **Emparejamiento Orbital:** `Planetary Analog Target (Moon)`

---

## 1. Identificación y Parámetros del Sitio Terrestre
- **Nombre del Sitio:** `Custom AOI (35.02791°, -111.02276°)` (ID: `US_ARIZONA_METEOR_CRATER`)
- **Coordenadas Centrales GPS:** `35.02791° N, -111.02276° E`
- **Radio de Exploración Específico:** **`100.0 metros`** (Superficie del Área de Ensayo: `31,415.9 m²` / `3.14 ha`)
- **Ventana Visual Contextual:** `800 × 800 metros`
- **Sincronización Geodésica:** Sub-píxel en WGS84 (EPSG:4326) con proyección métrica local (desfase: 0 metros)

---

## 2. Métricas del Área de Exploración de 100 Metros de Radio
| Métrica Topográfica en el Área de 100 m | Valor Medido en Datos Reales |
| :--- | :--- |
| **Cota Mínima** | `1563.7 m` |
| **Cota Máxima** | `1568.2 m` |
| **Cota Media** | `1565.1 m` |
| **Desnivel Local (Δz)** | `4.5 m` |
| **Pendiente Media Local (Horn)** | `1.67°` |
| **Pendiente Máxima Local** | `3.22°` |
| **Puntos de Muestreo Activo en 100 m** | `75 celdas` |

---

## 3. Desglose Metodológico de Similitud y Contribución de Pesos

| Dimensión Analógica Evaluada | Valor Medido en Tierra | Valor Objetivo de Referencia en Moon | Coeficiente $S_i$ [0-1] | Peso Asignado ($w_i$) | Contribución al Total ($w_i 	imes S_i$) |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Rango Altimétrico y Relieve** | `162.1 m (cota 1563-1725 m)` | `~450 m (Lunar Mare Basalt & Lava Tube Pit Crater (e.g. Marius Hills Pit))` | `0.566` | `12.0%` | **`6.8%`** |
| **Gradiente de Pendiente (Horn)** | `3.07° (máx 11.9°)` | `6.5° ± 3.0°` | `0.52` | `16.0%` | **`8.32%`** |
| **Rugosidad Superficial (TRI)** | `4.45 m` | `2.6 ± 1.2 m` | `0.305` | `14.0%` | **`4.27%`** |
| **Curvatura Topográfica y Sumideros** | `-0.0000 m⁻¹` | `Inversión de colapso (-0.04)` | `0.2` | `10.0%` | **`2.0%`** |
| **Tubos de Lava y Cavidades** | `Evidencia: 70% (Contexto volcánico: 90%)` | `Claraboyas intactas / Pit Craters` | `0.79` | `20.0%` | **`15.8%`** |
| **Morfología de Conos / Cráteres** | `Índice: 60%` | `Cráteres de impacto / conos piroclásticos` | `0.6` | `8.0%` | **`4.8%`** |
| **Composición Espectral y Mineralógica** | `Concordancia: 70%` | `Basaltic (Tholeiitic / Ilmenite / High-Ti & Low-Ti clinopyroxene)` | `0.7` | `12.0%` | **`8.4%`** |
| **Extremos Ambientales e Hiperaridez** | `Proxy Aridez: 90%` | `Desierto poliextremo / Vacío` | `0.9` | `8.0%` | **`7.2%`** |

| **SIMILITUD TOTAL VERIFICADA** | | | | **`100.0%`** | **`57.59%`** |

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
