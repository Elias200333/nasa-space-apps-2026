# TERRAIN-X: Informe de Verificación Científica de Análogos Planetarios (Radio 100 m)
**NASA Space Apps Challenge 2026 — Validación Rigurosa de Análogos para la Luna y Marte**  
**Fecha de Generación:** `2026-11-14T10:39:14.469433+00:00`  
**Cuerpo Planetario Objetivo:** `MOON` | **Emparejamiento Orbital:** `Cráteres de Impacto Complejos y Calderas Lunares/Marcianas`

---

## 1. Identificación y Parámetros del Sitio Terrestre
- **Nombre del Sitio:** `Volcán de la Corona & Tubo de Lava de los Verdes (Lanzarote, Islas Canarias, España)` (ID: `ES_LANZAROTE_CORONA`)
- **Coordenadas Centrales GPS:** `29.14800° N, -13.45000° E`
- **Radio de Exploración Específico:** **`100.0 metros`** (Superficie del Área de Ensayo: `31,415.9 m²` / `3.14 ha`)
- **Ventana Visual Contextual:** `800 × 800 metros`
- **Sincronización Geodésica:** Sub-píxel en WGS84 (EPSG:4326) con proyección métrica local (desfase: 0 metros)

---

## 2. Métricas del Área de Exploración de 100 Metros de Radio
| Métrica Topográfica en el Área de 100 m | Valor Medido en Datos Reales |
| :--- | :--- |
| **Cota Mínima** | `13.0 m` |
| **Cota Máxima** | `41.2 m` |
| **Cota Media** | `23.1 m` |
| **Desnivel Local (Δz)** | `28.2 m` |
| **Pendiente Media Local (Horn)** | `9.17°` |
| **Pendiente Máxima Local** | `23.07°` |
| **Puntos de Muestreo Activo en 100 m** | `73 celdas` |

---

## 3. Desglose Metodológico de Similitud y Contribución de Pesos

| Dimensión Analógica Evaluada | Valor Medido en Tierra | Valor Objetivo de Referencia en Moon | Coeficiente $S_i$ [0-1] | Peso Asignado ($w_i$) | Contribución al Total ($w_i 	imes S_i$) |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Rango Altimétrico y Relieve** | `78.1 m (cota -0-78 m)` | `~450 m (Lunar Mare Basalt & Lava Tube Pit Crater (e.g. Marius Hills Pit))` | `0.387` | `12.0%` | **`4.65%`** |
| **Gradiente de Pendiente (Horn)** | `1.08° (máx 4.8°)` | `6.5° ± 3.0°` | `0.195` | `16.0%` | **`3.12%`** |
| **Rugosidad Superficial (TRI)** | `1.78 m` | `2.6 ± 1.2 m` | `0.794` | `14.0%` | **`11.11%`** |
| **Curvatura Topográfica y Sumideros** | `0.0000 m⁻¹` | `Inversión de colapso (-0.04)` | `0.2` | `10.0%` | **`2.0%`** |
| **Tubos de Lava y Cavidades** | `Evidencia: 98% (Contexto volcánico: 95%)` | `Claraboyas intactas / Pit Craters` | `0.967` | `20.0%` | **`19.33%`** |
| **Morfología de Conos / Cráteres** | `Índice: 65%` | `Cráteres de impacto / conos piroclásticos` | `0.65` | `8.0%` | **`5.2%`** |
| **Composición Espectral y Mineralógica** | `Concordancia: 90%` | `Basaltic (Tholeiitic / Ilmenite / High-Ti & Low-Ti clinopyroxene)` | `0.9` | `12.0%` | **`10.8%`** |
| **Extremos Ambientales e Hiperaridez** | `Proxy Aridez: 88%` | `Desierto poliextremo / Vacío` | `0.88` | `8.0%` | **`7.04%`** |

| **SIMILITUD TOTAL VERIFICADA** | | | | **`100.0%`** | **`63.25%`** |

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
- **Fuerza Analógica:** Tubo volcánico basáltico de 7.6 km con claraboyas de colapso ('Jameos') morfológicamente idénticas a los pit craters de Marius Hills.
- **Fuerza Analógica:** Basaltos toleíticos cuaternarios sin meteorización química profunda debido a la aridez insular.
- **Fuerza Analógica:** Atenuación total de radiación y estabilidad térmica en el interior de la cavidad (~18°C constante).

### ¿Dónde se rompe la analogía? (Límites obligatorios)
- **Límite / Ruptura de la Analogía:** Gravedad terrestre (1 g frente a 0.166 g lunar); los tubos lunares pueden alcanzar diámetros de cientos de metros.
- **Límite / Ruptura de la Analogía:** Presencia de atmósfera respirable y biota ausente en el vacío lunar.

### Utilidad para el Entrenamiento de Misiones Espaciales:
- **Entrenamiento Operacional:** Sede oficial del programa ESA PANGAEA de espeleología y geología para astronautas; ensayos de navegación LiDAR autónoma subterránea.
