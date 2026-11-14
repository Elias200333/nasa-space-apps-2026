# TERRAIN-X | Prototipo de Interfaz 3D Planetaria (BabylonJS)
**NASA Space Apps Challenge 2026**

Bienvenido a la guía de inicio de **TERRAIN-X**. Esta interfaz permite comparar las características científicas y la morfología del terreno entre la **Luna**, **Marte** y sus **análogos geológicos terrestres** mediante un globo 3D interactivo construido con **BabylonJS**.

---

## 🚀 ¿Qué hace este prototipo?

1. **Diseño Visual de Misión Aeroespacial**: Réplica fiel con estética *glassmorphism*, temas oscuros de espacio profundo, lecturas telemétricas en tiempo real y tipografía de precisión.
2. **Selector Planetario Dinámico**: Permite elegir entre **Luna** o **Marte** (desde las tarjetas laterales o el selector superior).
3. **Generación Aleatoria de Coordenadas**: Al seleccionar un destino, el sistema genera coordenadas geográficas aleatorias en tiempo real correspondientes a zonas análogas científicas (p. ej. *Tubos de lava de Lanzarote*, *Desierto de Atacama*, *Craters of the Moon*, *Isla Devon*, etc.).
4. **Cinemática de Cámara 3D y Baliza Holográfica**:
   - La Tierra 3D rota y aproxima la cámara orbital suavemente (*CubicEase*) hacia el punto geográfico generado.
   - Proyecta una baliza holográfica luminosa (*Target Pin*) con anillos de pulso sobre la superficie terrestre en esas coordenadas.
   - Despliega una tarjeta flotante HUD con el nombre del análogo, país, coordenadas formateadas, porcentaje de similitud y justificación geológica.
5. **Efectos de Sonido Procedurales (Web Audio API)**: Emite avisos de fijación de blanco de radar (*lock-on*) y efecto de aproximación atmosférica (*whoosh*) sin necesidad de descargar archivos de audio externos.

---

## 🛠️ Requisitos Previos

Solo necesitas tener instalado **Node.js** (versión 18 o superior):
- Puedes comprobar si lo tienes abriendo tu terminal y escribiendo:
  ```bash
  node -v
  npm -v
  ```
- Si no lo tienes instalado, descárgalo gratis desde [nodejs.org](https://nodejs.org/).

---

## 📦 Instalación y Ejecución Paso a Paso

Abre tu terminal (PowerShell en Windows o Bash en macOS/Linux) y sitúate dentro de esta carpeta:

```bash
cd "C:\Users\Elias Méndez\Desktop\github\nasa-space-apps-2026\interface"
```

### 1. Instalar dependencias
*(Solo la primera vez)*:
```bash
npm install
```

### 2. Iniciar el servidor de desarrollo
```bash
npm run dev
```

La consola te mostrará una dirección local similar a:
```text
  VITE v5.4.10  ready in 320 ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
```

Abre tu navegador (Chrome, Edge, Firefox, Brave) y entra en:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🧪 Ejecución de Tests Automatizados

Hemos incluido pruebas unitarias con **Vitest** que validan la matemática esférica de BabylonJS y el generador de coordenadas:

```bash
npm test
```

Salida esperada:
```text
 ✓ tests/coordinates.test.ts (8 tests)
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

---

## 🏗️ Construcción para Producción

Para compilar la aplicación optimizada y minificada en la carpeta `dist/`:
```bash
npm run build
```

Para previsualizar el bundle de producción:
```bash
npm run preview
```

---

## 📂 Estructura de Archivos del Proyecto

```text
nasa-space-apps-2026/interface/
├── index.html                 # Estructura visual del panel (HUD, tarjetas, canvas)
├── package.json               # Configuración de dependencias y scripts
├── tsconfig.json              # Configuración de TypeScript
├── vite.config.ts             # Configuración del servidor de desarrollo Vite
├── README.md                  # Esta documentación en español
├── tests/
│   └── coordinates.test.ts    # Tests unitarios (Vitest)
└── src/
    ├── main.ts                # Controlador principal y gestión de eventos de la UI
    ├── styles.css             # Estilos glassmorphism, HUD y efectos de iluminación
    ├── types.ts               # Contratos y tipos de datos TypeScript (v1.0)
    ├── audio.ts               # Sintetizador de audio procedural (Web Audio API)
    ├── data/
    │   └── analogs.ts         # Catálogo de análogos terrestres NASA/ESA y generador
    └── babylon/
        ├── earthScene.ts      # Escena 3D de la Tierra, atmósfera, cámara y animación
        ├── miniPlanets.ts     # Visores 3D interactivos de las tarjetas de Luna y Marte
        ├── targetPin.ts       # Baliza holográfica y cálculo lat/lon a Vector3
        └── textureGenerator.ts # Generador procedural de texturas de alta resolución
```

---

## 🎮 Controles de la Interfaz

| Elemento | Acción |
| :--- | :--- |
| **Tarjeta "Moon" o Selector "Moon"** | Genera coordenadas para análogo lunar y acerca la Tierra a esa posición. |
| **Tarjeta "Mars" o Selector "Mars"** | Genera coordenadas para análogo marciano y acerca la Tierra a esa posición. |
| **Arrastrar ratón sobre la Tierra** | Rota libremente la órbita de la cámara 3D alrededor del planeta. |
| **Rueda del ratón** | Zoom dinámico continuo hacia o desde la superficie. |
| **Botón de Mira Telescópica (HUD)** | Genera un nuevo conjunto de coordenadas aleatorias al instante. |
| **Botón Flecha Superior (HUD)** | Restablece la vista orbital global de la Tierra. |
| **Botones `+` / `-` (HUD)** | Zoom incremental rápido. |
| **Botón Cuadrado (HUD)** | Alterna el modo Pantalla Completa (*Fullscreen*). |
| **Subpestañas de tarjeta (Overview, Terrain, Geology, Data)** | Alterna entre los bloques de análisis geológico del cuerpo celeste. |
