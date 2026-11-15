# TERRAIN-X · Standalone Precompiled Interactive Demo
**NASA Space Apps Challenge 2026**

> **Aviso Importante:** Esta es una **demo interactiva visual** con información científica y telemetría real compilada previamente (modelos DEM Copernicus/IGN, mallas 3D, catálogo de análogos y nube de puntos LiDAR del robot Unitree Go2).  
> Si deseas ejecutar el proyecto completo en tiempo real (con conexión en vivo a sensores, pipeline satelital y hardware robótico Unitree Go2), accede al repositorio oficial:  
> 🔗 **[https://github.com/Elias200333/nasa-space-apps-2026](https://github.com/Elias200333/nasa-space-apps-2026)**

---

## 🌟 Características de esta Demo Autónoma

Esta carpeta `demo/` es **100% independiente** de los módulos de backend (`data/`, `robot/` e `interface/`). No requiere tener servidores Python o Node.js ejecutándose para explorar la experiencia:

1. **Globo Planetario 3D Interactivo (Babylon.js):**
   - Visualización fotorrealista de la **Tierra** (texturas diurnas, reflejos oceánicos especulares, nubes dinámicas y luces nocturnas).
   - Conmutación instantánea a la **Luna** (altimetría LOLA) y **Marte** (altimetría MOLA).
   - Órbitas secundarias con mini-esferas de Luna y Marte.
   - Herramientas de navegación orbital (rotación automática, zoom, centrado de planeta).

2. **Consola Científica de Terreno & Radar 2D:**
   - Radar 2D con barrido continuo y geolocalización de análogos certificados (Caldera Blanca, Río Tinto, Fuerteventura, Atacama, Hawái).
   - Modelo 3D de terreno DEM generado a partir de datos reales de **Copernicus DEM / IGN MDT05 (30 m)**.
   - Rotación 3D interactiva del bloque de terreno con el ratón.
   - Modos de malla (*wireframe*) y multiplicador de exageración vertical (×1.5, ×3.5, ×6.5).
   - Cálculo de similitud geomorfológica frente a Marte/Luna (68.5%), correlación de Pearson (*R = 0.920*) y detección de tubos de lava subterráneos.

3. **Simulador de Misión Robótica Unitree Go2:**
   - Vista en planta de la **nube de puntos LiDAR SLAM** real pregrabada (más de 54,000 puntos).
   - Cámara simulada con HUD de detección de conductos basálticos.
   - Conducción interactiva con las teclas <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>.
   - Botones de postura del cuadrúpedo: *Levantar*, *Sentar*, *Equilibrio*, *Amortiguar*.

4. **Atlas Comparativo Planetario & Métricas:**
   - Dock inferior con métricas clave (Área Superficial, Gravedad, Temperatura, Complejidad Geológica).
   - Modal de comparación completa con tablas de atmósfera, presión, radiación solar y geología de cavidades.
   - Atlas temático y mapa topográfico de 100 m de alta resolución precargados.

---

## 🚀 Cómo Ejecutar la Demo

### Opción 1: Apertura Directa en el Navegador (Sin Configuración)
Simplemente haz doble clic sobre el archivo **`index.html`** dentro de esta carpeta `demo/`. Se abrirá en tu navegador web predeterminado (Chrome, Edge, Firefox, etc.) y funcionará de inmediato.

### Opción 2: Servidor Estático Local (Recomendado para Máximo Rendimiento)
Si deseas servirlo mediante un servidor HTTP local o probarlo en otra máquina o red:

```bash
# Con Python (en la carpeta demo):
cd demo
python -m http.server 8080

# Luego abre en el navegador:
# http://localhost:8080
```

También puedes subir esta carpeta directamente a **GitHub Pages**, **Vercel**, **Netlify** o cualquier hosting estático para compartir la demo online.

---

## 🛰️ Proyecto Completo en Tiempo Real
Para compilar el proyecto completo con ingesta de satélites en vivo y conexión directa por WebRTC al cuadrúpedo Unitree Go2:  
👉 **[Repositorio Oficial en GitHub](https://github.com/Elias200333/nasa-space-apps-2026)**
