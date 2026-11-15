# TERRAIN-X: Informe de Verificación Científica de Análogos Planetarios (Radio 100 m)
**NASA Space Apps Challenge 2026 — Validación Rigurosa de Análogos para la Luna y Marte**  
**Fecha de Generación:** `2026-11-15T20:06:43.771540+00:00`  
**Cuerpo Planetario Objetivo:** `MOON` | **Emparejamiento Orbital:** `Planetary Analog Target (Moon)`

---

## 1. Identificación y Parámetros del Sitio Terrestre
- **Nombre del Sitio:** `Custom AOI (19.97600°, 76.50700°)` (ID: `IN_LONAR_CRATER`)
- **Coordenadas Centrales GPS:** `19.97600° N, 76.50700° E`
- **Radio de Exploración Específico:** **`100.0 metros`** (Superficie del Área de Ensayo: `31,415.9 m²` / `3.14 ha`)
- **Ventana Visual Contextual:** `800 × 800 metros`
- **Sincronización Geodésica:** Sub-píxel en WGS84 (EPSG:4326) con proyección métrica local (desfase: 0 metros)

---

## 2. Métricas del Área de Exploración de 100 Metros de Radio
| Métrica Topográfica en el Área de 100 m | Valor Medido en Datos Reales |
| :--- | :--- |
| **Cota Mínima** | `525.5 m` |
| **Cota Máxima** | `554.2 m` |
| **Cota Media** | `544.4 m` |
| **Desnivel Local (Δz)** | `28.7 m` |
| **Pendiente Media Local (Horn)** | `15.55°` |
| **Pendiente Máxima Local** | `17.02°` |
| **Puntos de Muestreo Activo en 100 m** | `73 celdas` |

---

## 3. Desglose Metodológico de Similitud y Contribución de Pesos

| Dimensión Analógica Evaluada | Valor Medido en Tierra | Valor Objetivo de Referencia en Moon | Coeficiente $S_i$ [0-1] | Peso Asignado ($w_i$) | Contribución al Total ($w_i 	imes S_i$) |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Rango Altimétrico y Relieve** | `51.8 m (cota 526-577 m)` | `~450 m (Lunar Mare Basalt & Lava Tube Pit Crater (e.g. Marius Hills Pit))` | `0.337` | `12.0%` | **`4.04%`** |
| **Gradiente de Pendiente (Horn)** | `1.55° (máx 3.4°)` | `6.5° ± 3.0°` | `0.256` | `16.0%` | **`4.1%`** |
| **Rugosidad Superficial (TRI)** | `2.26 m` | `2.6 ± 1.2 m` | `0.96` | `14.0%` | **`13.44%`** |
| **Curvatura Topográfica y Sumideros** | `0.0000 m⁻¹` | `Inversión de colapso (-0.04)` | `0.2` | `10.0%` | **`2.0%`** |
| **Tubos de Lava y Cavidades** | `Evidencia: 70% (Contexto volcánico: 90%)` | `Claraboyas intactas / Pit Craters` | `0.79` | `20.0%` | **`15.8%`** |
| **Morfología de Conos / Cráteres** | `Índice: 60%` | `Cráteres de impacto / conos piroclásticos` | `0.6` | `8.0%` | **`4.8%`** |
| **Composición Espectral y Mineralógica** | `Concordancia: 70%` | `Basaltic (Tholeiitic / Ilmenite / High-Ti & Low-Ti clinopyroxene)` | `0.7` | `12.0%` | **`8.4%`** |
| **Extremos Ambientales e Hiperaridez** | `Proxy Aridez: 90%` | `Desierto poliextremo / Vacío` | `0.9` | `8.0%` | **`7.2%`** |

| **SIMILITUD TOTAL VERIFICADA** | | | | **`100.0%`** | **`59.78%`** |

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
