# TERRAIN-X: Informe de Verificación Científica de Análogos Planetarios
**Reto NASA Space Apps Challenge 2026 — Identificación de Análogos para Bases Lunares y Marte**  
**Fecha de Generación:** `2026-11-14T00:10:53.608054+00:00`  
**Cuerpo Planetario Objetivo:** `MOON` | **Emparejamiento Orbital:** `Marius Hills Pit / Oceanus Procellarum (Moon)`

---

## 1. Identificación y Parámetros del Sitio Terrestre
- **Nombre del Sitio:** `Volcán de la Corona & Tubo de Lava (Lanzarote, Islas Canarias, España)` (ID: `ES_LANZAROTE_CORONA`)
- **Coordenadas Centrales:** `29.14800° N, -13.45000° E`
- **Radio de Exploración:** `10.0 km` (Área: `~314.2 km²`)
- **Datos Geoespaciales Utilizados:**
  - *Imágenes Satelitales Ópticas:* Sentinel-2 / Landsat True Color Composite
  - *Modelo Digital de Elevación:* SRTM 30m / Copernicus DEM real (sin interpolación procedural artificial)
  - *Datos Planetarios de Misión:* NASA Moon Trek WMTS, altimetría láser LOLA (Lunar Reconnaissance Orbiter)

---

## 2. Métricas Estadísticas del Modelo DEM Real
| Métrica Topográfica | Valor Obtenido en Datos Reales |
| :--- | :--- |
| **Cota Mínima** | `26.3 m` |
| **Cota Máxima** | `510.0 m` |
| **Cota Media** | `176.2 m` |
| **Desnivel Total (Rango)** | `483.7 m` |
| **Pendiente Media (Horn)** | `13.54°` |
| **Pendiente Máxima** | `26.68°` |
| **Rugosidad Media (TRI)** | `20.13 m` |
| **Puntos Evaluados en Cuadrícula** | `900` |

---

## 3. Desglose Metodológico de Similitud y Contribución de Pesos

A diferencia de estimaciones genéricas, TERRAIN-X desglosa cada variable física con su peso científico específico:

| Dimensión Analógica Evaluada | Valor Medido en Tierra | Valor Objetivo de Referencia en Moon | Coeficiente $S_i$ [0-1] | Peso Asignado ($w_i$) | Contribución al Total ($w_i 	imes S_i$) |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Rango Altimétrico y Relieve** | `483.7 m (cota 26-510 m)` | `~450 m (Lunar Mare Basalt & Lava Tube Pit Crater (e.g. Marius Hills Pit))` | `0.992` | `12.0%` | **`11.91%`** |
| **Gradiente de Pendiente (Horn)** | `13.54° (máx 26.7°)` | `6.5° ± 3.0°` | `0.064` | `16.0%` | **`1.02%`** |
| **Rugosidad Superficial (TRI)** | `20.13 m` | `2.6 ± 1.2 m` | `0.0` | `14.0%` | **`0.0%`** |
| **Curvatura Topográfica y Sumideros** | `0.0000 m⁻¹` | `Inversión de colapso (-0.04)` | `0.2` | `10.0%` | **`2.0%`** |
| **Tubos de Lava y Cavidades** | `Evidencia: 98% (Contexto volcánico: 95%)` | `Claraboyas intactas / Pit Craters` | `0.967` | `20.0%` | **`19.33%`** |
| **Morfología de Conos / Cráteres** | `Índice: 65%` | `Cráteres de impacto / conos piroclásticos` | `0.65` | `8.0%` | **`5.2%`** |
| **Composición Espectral y Mineralógica** | `Concordancia: 90%` | `Basaltic (Tholeiitic / Ilmenite / High-Ti & Low-Ti clinopyroxene)` | `0.9` | `12.0%` | **`10.8%`** |
| **Extremos Ambientales e Hiperaridez** | `Proxy Aridez: 88%` | `Desierto poliextremo / Vacío` | `0.88` | `8.0%` | **`7.04%`** |

| **SIMILITUD TOTAL VERIFICADA** | | | | **`100.0%`** | **`57.3%`** |

> [!IMPORTANT]
> **Interpretación del Resultado (57.3%):**  
> Ningún análogo terrestre es 100% idéntico a otro cuerpo celeste debido a diferencias inevitables en gravedad, atmósfera y radiación. Una puntuación en el rango del **70% al 85%** representa un análogo sobresaliente de clase mundial según los estándares de la NASA y la ESA.

---

## 4. Justificación Geológica y Límites de la Analogía

### ¿Por qué es un análogo fuerte?
- **Fuerza Analógica:** Tubo volcánico basáltico de gran escala (7.6 km de longitud, hasta 25 m de diámetro) análogo directo a los rilles y tubos de lava de los mares lunares.
- **Fuerza Analógica:** Serie de claraboyas de colapso ('Jameos') que replican la morfología de entrada de los pit craters lunares (Marius Hills Pit).
- **Fuerza Analógica:** Suelo basáltico cuaternario con alteración hidrotermal y química mínima debido al clima semiárido.

### ¿Dónde se rompe la analogía? (Limitaciones obligatorias)
- **Límite / Ruptura de la Analogía:** Gravedad terrestre (1 g frente a 1/6 g lunar), lo que limita el tamaño máximo estructural de los tubos terrestres respecto a los lunares.
- **Límite / Ruptura de la Analogía:** Presencia de atmósfera densa, humedad marina y microbacterias ausentes en el vacío lunar.

### Utilidad para el Entrenamiento de Misiones Espaciales:
- **Entrenamiento Operacional:** Sede oficial del curso de geología y espeleología para astronautas ESA PANGAEA; ensayo de navegación autónoma subterránea y cartografía LiDAR para rovers.

---

## 5. Entregables Científicos Producidos
1. **Atlas Comparativo Lado a Lado (6 Paneles):** `thematic_comparison_atlas.png`
2. **Modelo 3D Interactivo WebGL con Datos Reales:** `terrain_3d.html`
3. **Metadatos y Registro JSON:** `comparison_metrics.json`
