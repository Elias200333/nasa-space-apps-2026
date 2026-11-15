# TERRAIN-X • Interactive Standalone Visual Demo
### NASA Space Apps Challenge 2026 • Planetary Analog Terrain & Subterranean Cavity Comparison

> [!IMPORTANT]
> **Aviso Oficial de Demostración:**
> Esta carpeta contiene una **clonación idéntica y autónoma** de la interfaz de producción de **TERRAIN-X**.
> Funciona de manera **completamente estática**, precargando información científica real compilada previamente (modelos 3D geodésicos derivados de **Copernicus DEM 30m** e **IGN PNOA-LiDAR**, catálogos orbitales de la **NASA** y un escaneo subterráneo de alta fidelidad con **54.915 puntos LiDAR** registrado por un robot cuadrúpedo **Unitree Go2**).
> 
> Para compilar y ejecutar el proyecto completo en tiempo real con hardware físico, telemetría activa y servidores Python, accede al repositorio oficial:
> 🔗 **[https://github.com/Elias200333/nasa-space-apps-2026](https://github.com/Elias200333/nasa-space-apps-2026)**

---

## 🚀 ¿Qué es esta Demo?

Esta demo visual permite explorar y evaluar el sistema interactivo de TERRAIN-X **sin necesidad de levantar los módulos de backend de Python** (`data/server.py` en el puerto 8000 y `terrainx_robot dashboard` en el puerto 8777).

Conserva **el 100% de la experiencia visual y funcional original**:
1. **Globos Planetarios 3D (Babylon.js):** Navegación interactiva sobre la Tierra, la Luna y Marte con capas de textura fotorrealista y relieve digital.
2. **20 Coordenadas Planetarias Oficiales Precargadas:**
   - **10 Análogos Lunares Oficiales:** Malpaís de la Arena (Fuerteventura), SP Crater (Arizona), Mauna Kea (Hawái), Caldera Blanca (Lanzarote), Valentine Cave (Lava Beds), Cráter Lonar (India), Cueva de los Verdes (Lanzarote), Meteor Crater (Arizona), Cuenca de Sudbury (Canadá) y Caldera de Askja (Islandia).
   - **10 Análogos Marcianos Oficiales:** Caldera de Krafla (Islandia), Valle de la Muerte (EE.UU.), Salar de Antofalla (Puna Atacama, Argentina), Volcanes de Lodo de Gobustán (Azerbaiyán), Cráter Haughton (Isla Devon, Canadá), Cañón de Río Tinto (España), Cuatro Ciénegas (México), Wadi Rum (Jordania), Desierto de Yungay (Atacama, Chile) y Valles Secos de McMurdo (Antártida).
3. **Modelos 3D de Terreno Sincronizados (Plotly WebGL & Copernicus DEM):**
   - Al seleccionar cualquiera de las 20 coordenadas, se carga de forma inmediata su modelo topográfico 3D georreferenciado, curvas de nivel de elevación, perfiles de transecto altimétrico orbital (LOLA/MOLA) y cálculo de pendientes.
4. **Recreación y Animación SLAM de Entornos Subterráneos (Unitree Go2):**
   - Como no se requiere conexión con un robot físico en local, la estación de misión subterránea reproduce automáticamente la última misión real grabada por un robot cuadrúpedo **Unitree Go2 Pro** equipado con **LiDAR Livox MID-360** (`scan-20261115T181241Z-d17a35`).
   - Muestra una **animación progresiva de acumulación de puntos** (de 0 a 54.915 vóxeles) mientras el robot navega por el tubo de lava, sincronizado con un feed simulado de visión nocturna de la cámara frontal estéreo.
   - Al finalizar el recorrido, la vista de fusión volumétrica 3D permite rotar, cambiar el rumbo, variar la profundidad bajo la superficie y fusionar la cueva con el modelo de elevación terrestre.
5. **Compatibilidad WebXR (Gafas VR / Meta Quest):**
   - El panel holográfico espacial en WebXR recibe la telemetría y muestra la planta LiDAR acumulada en tiempo real dentro del visor de realidad virtual.

---

## 🛠️ Cómo Ejecutar la Demo Localmente

Al ser una web estática autónoma, solo requiere ser servida por cualquier servidor HTTP estándar:

### Opción 1: Con Python (Recomendada)
```bash
python -m http.server 8080 -d demo
```
Luego abre tu navegador en: **`http://localhost:8080`**

### Opción 2: Con Node.js (Serve o Vite)
```bash
npx serve demo -p 8080
```
O simplemente:
```bash
cd demo && npx http-server -p 8080
```

---

## 📁 Estructura del Módulo `demo/`

```
demo/
├── index.html                   # Interfaz idéntica clonada con banner oficial y visor 3D
├── mockApi.js                   # Interceptor in-browser que resuelve peticiones de datos y robot
├── ief_comparation_logo.jpg     # Identidad visual del equipo IEF Comparation
├── nasa_space_apps_logo.png     # Distintivo oficial NASA Space Apps Challenge
├── assets/                      # Bundles de producción (index.js, index.css, Babylon.js)
├── textures/                    # Texturas planetarias 2K (Tierra, Luna, Marte y mapas de relieve)
├── output_3d/                   # Modelos 3D, mapas temáticos y métricas de los 20 análogos
│   ├── global_analog_catalog_20.json
│   ├── ES_FUERTEVENTURA_ARENA/  # Terreno 3D, atlas y métricas científicas
│   ├── ES_LANZAROTE_CALDERA_BLANCA/
│   ├── US_ARIZONA_SP_CRATER/
│   ├── IS_KRAFLA_COLD/
│   ├── ES_RIO_TINTO/
│   └── ... (20 candidatos precompilados)
└── robot/                       # Módulo de simulación de misión y escaneo LiDAR
    ├── mision.html              # Estación de conducción y animación SLAM automática
    ├── vendor/                  # Dependencias Three.js
    └── scans/                   # Escaneo 3D real Unitree Go2 (54.915 puntos LiDAR)
```

---

## 🛰️ Créditos y Autoría

- **Desarrollado para:** NASA Space Apps Challenge 2026
- **Equipo IEF Comparation:**
  - Elías Méndez El Bakal
  - Froilán Quinde
  - Inés Leticia Santana Agustín
- **Repositorio Principal:** [https://github.com/Elias200333/nasa-space-apps-2026](https://github.com/Elias200333/nasa-space-apps-2026)
