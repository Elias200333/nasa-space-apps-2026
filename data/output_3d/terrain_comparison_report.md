# TERRAIN-X: Informe de Verificación Científica de Análogos Planetarios (Radio 100 m)
**NASA Space Apps Challenge 2026 — Validación Rigurosa de Análogos para la Luna y Marte**  
**Fecha de Generación:** `2026-11-14T21:14:34.916961+00:00`  
**Cuerpo Planetario Objetivo:** `MOON` | **Emparejamiento Orbital:** `Cráteres de Impacto Complejos y Calderas Lunares/Marcianas`

---

## 1. Identificación y Parámetros del Sitio Terrestre
- **Nombre del Sitio:** `Cráter de Caldera Blanca (Lanzarote, Islas Canarias, España)` (ID: `ES_LANZAROTE_CALDERA_BLANCA`)
- **Coordenadas Centrales GPS:** `29.03800° N, -13.71900° E`
- **Radio de Exploración Específico:** **`100.0 metros`** (Superficie del Área de Ensayo: `31,415.9 m²` / `3.14 ha`)
- **Ventana Visual Contextual:** `800 × 800 metros`
- **Sincronización Geodésica:** Sub-píxel en WGS84 (EPSG:4326) con proyección métrica local (desfase: 0 metros)

---

## 2. Métricas del Área de Exploración de 100 Metros de Radio
| Métrica Topográfica en el Área de 100 m | Valor Medido en Datos Reales |
| :--- | :--- |
| **Cota Mínima** | `261.4 m` |
| **Cota Máxima** | `265.2 m` |
| **Cota Media** | `263.9 m` |
| **Desnivel Local (Δz)** | `3.8 m` |
| **Pendiente Media Local (Horn)** | `1.31°` |
| **Pendiente Máxima Local** | `5.08°` |
| **Puntos de Muestreo Activo en 100 m** | `73 celdas` |

---

## 3. Desglose Metodológico de Similitud y Contribución de Pesos

| Dimensión Analógica Evaluada | Valor Medido en Tierra | Valor Objetivo de Referencia en Moon | Coeficiente $S_i$ [0-1] | Peso Asignado ($w_i$) | Contribución al Total ($w_i 	imes S_i$) |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Rango Altimétrico y Relieve** | `117.9 m (cota 203-321 m)` | `~450 m (Lunar Mare Basalt & Lava Tube Pit Crater (e.g. Marius Hills Pit))` | `0.469` | `12.0%` | **`5.63%`** |
| **Gradiente de Pendiente (Horn)** | `1.77° (máx 9.6°)` | `6.5° ± 3.0°` | `0.288` | `16.0%` | **`4.61%`** |
| **Rugosidad Superficial (TRI)** | `2.80 m` | `2.6 ± 1.2 m` | `0.986` | `14.0%` | **`13.8%`** |
| **Curvatura Topográfica y Sumideros** | `-0.0000 m⁻¹` | `Inversión de colapso (-0.04)` | `0.2` | `10.0%` | **`2.0%`** |
| **Tubos de Lava y Cavidades** | `Evidencia: 70% (Contexto volcánico: 98%)` | `Claraboyas intactas / Pit Craters` | `0.826` | `20.0%` | **`16.52%`** |
| **Morfología de Conos / Cráteres** | `Índice: 96%` | `Cráteres de impacto / conos piroclásticos` | `0.96` | `8.0%` | **`7.68%`** |
| **Composición Espectral y Mineralógica** | `Concordancia: 92%` | `Basaltic (Tholeiitic / Ilmenite / High-Ti & Low-Ti clinopyroxene)` | `0.92` | `12.0%` | **`11.04%`** |
| **Extremos Ambientales e Hiperaridez** | `Proxy Aridez: 90%` | `Desierto poliextremo / Vacío` | `0.9` | `8.0%` | **`7.2%`** |

| **SIMILITUD TOTAL VERIFICADA** | | | | **`100.0%`** | **`68.48%`** |

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
- **Fuerza Analógica:** Cráter de toba volcánica freatomagmático de 1.2 km de diámetro con cresta circular casi perfecta y fondo deprimido.
- **Fuerza Analógica:** Geometría de borde empinado y fondo plano idéntica a cráteres de impacto de transición simple-complejo en la Luna y Marte.
- **Fuerza Analógica:** Rodeado por el mar de lavas basálticas históricas del Parque Nacional de Timanfaya (1730-1736).

### ¿Dónde se rompe la analogía? (Límites obligatorios)
- **Límite / Ruptura de la Analogía:** Origen freatomagmático por interacción agua-magma terrestre frente al origen por impacto meteórico de la mayoría de cráteres lunares.
- **Límite / Ruptura de la Analogía:** Presencia de vegetación de líquenes xerófilos sobre las tobas.

### Utilidad para el Entrenamiento de Misiones Espaciales:
- **Entrenamiento Operacional:** Entrenamiento de astronautas en cartografía de paredes de cráteres, muestreo de estratos en acantilados y navegación perimetral.
