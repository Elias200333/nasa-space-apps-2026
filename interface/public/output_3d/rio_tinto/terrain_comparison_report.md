# TERRAIN-X: Informe de Verificación Científica de Análogos Planetarios
**Reto NASA Space Apps Challenge 2026 — Identificación de Análogos para Bases Lunares y Marte**  
**Fecha de Generación:** `2026-11-14T00:11:21.079314+00:00`  
**Cuerpo Planetario Objetivo:** `MARS` | **Emparejamiento Orbital:** `Meridiani Planum / Mawrth Vallis (Marte)`

---

## 1. Identificación y Parámetros del Sitio Terrestre
- **Nombre del Sitio:** `Cuenca Minera de Río Tinto (Huelva, España)` (ID: `ES_RIO_TINTO`)
- **Coordenadas Centrales:** `37.69700° N, -6.55600° E`
- **Radio de Exploración:** `10.0 km` (Área: `~314.2 km²`)
- **Datos Geoespaciales Utilizados:**
  - *Imágenes Satelitales Ópticas:* Sentinel-2 / Landsat True Color Composite
  - *Modelo Digital de Elevación:* SRTM 30m / Copernicus DEM real (sin interpolación procedural artificial)
  - *Datos Planetarios de Misión:* NASA Mars Trek WMTS, altimetría láser MOLA (Mars Global Surveyor)

---

## 2. Métricas Estadísticas del Modelo DEM Real
| Métrica Topográfica | Valor Obtenido en Datos Reales |
| :--- | :--- |
| **Cota Mínima** | `181.1 m` |
| **Cota Máxima** | `379.8 m` |
| **Cota Media** | `303.6 m` |
| **Desnivel Total (Rango)** | `198.7 m` |
| **Pendiente Media (Horn)** | `5.59°` |
| **Pendiente Máxima** | `11.72°` |
| **Rugosidad Media (TRI)** | `8.2 m` |
| **Puntos Evaluados en Cuadrícula** | `900` |

---

## 3. Desglose Metodológico de Similitud y Contribución de Pesos

A diferencia de estimaciones genéricas, TERRAIN-X desglosa cada variable física con su peso científico específico:

| Dimensión Analógica Evaluada | Valor Medido en Tierra | Valor Objetivo de Referencia en Mars | Coeficiente $S_i$ [0-1] | Peso Asignado ($w_i$) | Contribución al Total ($w_i 	imes S_i$) |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Rango Altimétrico y Relieve** | `198.7 m (cota 181-380 m)` | `~600 m (Martian Volcanic Flank & Sulfate Evaporite (e.g. Arsia Mons / Meridiani Planum))` | `0.537` | `10.0%` | **`5.37%`** |
| **Gradiente de Pendiente (Horn)** | `5.59° (máx 11.7°)` | `8.0° ± 4.0°` | `0.834` | `15.0%` | **`12.51%`** |
| **Rugosidad Superficial (TRI)** | `8.20 m` | `3.0 ± 1.5 m` | `0.002` | `12.0%` | **`0.03%`** |
| **Curvatura Topográfica y Sumideros** | `-0.0000 m⁻¹` | `Inversión de colapso (-0.05)` | `0.2` | `8.0%` | **`1.6%`** |
| **Tubos de Lava y Cavidades** | `Evidencia: 50% (Contexto volcánico: 35%)` | `Claraboyas intactas / Pit Craters` | `0.432` | `15.0%` | **`6.49%`** |
| **Morfología de Conos / Cráteres** | `Índice: 30%` | `Cráteres de impacto / conos piroclásticos` | `0.3` | `10.0%` | **`3.0%`** |
| **Composición Espectral y Mineralógica** | `Concordancia: 98%` | `Ferric Oxides (Hematite / Goethite), Jarosite sulfates & Smectite clays` | `0.98` | `20.0%` | **`19.6%`** |
| **Extremos Ambientales e Hiperaridez** | `Proxy Aridez: 65%` | `Desierto poliextremo / Vacío` | `0.65` | `10.0%` | **`6.5%`** |

| **SIMILITUD TOTAL VERIFICADA** | | | | **`100.0%`** | **`55.1%`** |

> [!IMPORTANT]
> **Interpretación del Resultado (55.1%):**  
> Ningún análogo terrestre es 100% idéntico a otro cuerpo celeste debido a diferencias inevitables en gravedad, atmósfera y radiación. Una puntuación en el rango del **70% al 85%** representa un análogo sobresaliente de clase mundial según los estándares de la NASA y la ESA.

---

## 4. Justificación Geológica y Límites de la Analogía

### ¿Por qué es un análogo fuerte?
- **Fuerza Analógica:** Presencia masiva de jarosita (sulfato básico de hierro y potasio), goethita y hematites, exactamente el mismo ensamblaje mineral detectado por el rover Opportunity en Meridiani Planum.
- **Fuerza Analógica:** Aguas ácidas extremas (pH 1.5 - 2.5) dominadas por bacterias quimiolitótrofas oxidantes de hierro y azufre, análogo de habitabilidad subsuperficial marciana.
- **Fuerza Analógica:** Lugar oficial de pruebas del proyecto NASA MARTE (Mars Astrobiology Research and Technology Experiment).

### ¿Dónde se rompe la analogía? (Limitaciones obligatorias)
- **Límite / Ruptura de la Analogía:** Abundante agua líquida activa en superficie, mientras que en Marte el agua líquida desapareció hace miles de millones de años.
- **Límite / Ruptura de la Analogía:** Presencia de vegetación mediterránea y modificación antrópica minera en algunas áreas.

### Utilidad para el Entrenamiento de Misiones Espaciales:
- **Entrenamiento Operacional:** Calibración de espectrómetros Mössbauer, ensayos de perforación profunda autónoma (> 10 m) y detección de biofirmas extremófilas.

---

## 5. Entregables Científicos Producidos
1. **Atlas Comparativo Lado a Lado (6 Paneles):** `thematic_comparison_atlas.png`
2. **Modelo 3D Interactivo WebGL con Datos Reales:** `terrain_3d.html`
3. **Metadatos y Registro JSON:** `comparison_metrics.json`
