/**
 * TERRAIN-X · Standalone Precompiled Interactive Demo Engine
 * NASA Space Apps Challenge 2026
 * Pure Vanilla JavaScript & Babylon.js 3D Engine
 */

(function () {
  'use strict';

  const DATA = window.TERRAINX_DEMO_DATA;
  let activePlanet = 'Earth';
  let activeLayerMode = 'Surface';
  let activeAnalogSite = DATA.analogSites[0];

  // =========================================================================
  // 1. BABYLON.JS 3D PLANETARY SYSTEM
  // =========================================================================
  const canvas = document.getElementById('renderCanvas');
  let engine, scene, camera;
  let planetSphere, cloudsSphere;
  let earthMat, moonMat, marsMat;
  let miniMoon, miniMars;
  let autoRotate = true;

  function initBabylonGlobe() {
    if (!window.BABYLON) {
      console.warn('Babylon.js no disponible de forma local; cargando renderizador estático alternativo.');
      return;
    }

    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.02, 0.04, 0.08, 1.0);

    // Cámara Orbital
    camera = new BABYLON.ArcRotateCamera('orbitCam', -Math.PI / 2, Math.PI / 2.2, 5.2, new BABYLON.Vector3(0, 0, 0), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 2.4;
    camera.upperRadiusLimit = 16.0;
    camera.wheelPrecision = 45;
    camera.inertia = 0.85;

    // Luces
    const hemiLight = new BABYLON.HemisphericLight('hemiLight', new BABYLON.Vector3(0.5, 1, 0.5), scene);
    hemiLight.intensity = 0.45;

    const sunLight = new BABYLON.DirectionalLight('sunLight', new BABYLON.Vector3(-1, -0.2, -1), scene);
    sunLight.position = new BABYLON.Vector3(15, 4, 15);
    sunLight.intensity = 1.35;

    // Esfera Planetaria Principal
    planetSphere = BABYLON.MeshBuilder.CreateSphere('mainPlanet', { diameter: 2.0, segments: 64 }, scene);

    // Material de la Tierra
    earthMat = new BABYLON.StandardMaterial('earthMat', scene);
    earthMat.diffuseTexture = new BABYLON.Texture('textures/earth.jpg', scene);
    earthMat.bumpTexture = new BABYLON.Texture('textures/earth_normal.jpg', scene);
    earthMat.specularTexture = new BABYLON.Texture('textures/earth_specular.jpg', scene);
    earthMat.specularColor = new BABYLON.Color3(0.4, 0.4, 0.4);
    earthMat.roughness = 0.6;

    // Nubes de la Tierra
    cloudsSphere = BABYLON.MeshBuilder.CreateSphere('earthClouds', { diameter: 2.025, segments: 48 }, scene);
    const cloudsMat = new BABYLON.StandardMaterial('cloudsMat', scene);
    cloudsMat.diffuseTexture = new BABYLON.Texture('textures/earth_clouds.png', scene);
    cloudsMat.opacityTexture = cloudsMat.diffuseTexture;
    cloudsMat.disableLighting = false;
    cloudsMat.alpha = 0.55;
    cloudsSphere.material = cloudsMat;

    // Material de la Luna
    moonMat = new BABYLON.StandardMaterial('moonMat', scene);
    moonMat.diffuseTexture = new BABYLON.Texture('textures/moon.jpg', scene);
    moonMat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);

    // Material de Marte
    marsMat = new BABYLON.StandardMaterial('marsMat', scene);
    marsMat.diffuseTexture = new BABYLON.Texture('textures/mars.jpg', scene);
    marsMat.bumpTexture = new BABYLON.Texture('textures/mars_bump.jpg', scene);
    marsMat.specularColor = new BABYLON.Color3(0.1, 0.05, 0.02);

    planetSphere.material = earthMat;

    // Órbitas y Mini-Planetas decorativos
    createMiniOrbiters();

    // Render loop
    engine.runRenderLoop(() => {
      if (autoRotate) {
        planetSphere.rotation.y += 0.0018;
        if (cloudsSphere && cloudsSphere.isVisible) cloudsSphere.rotation.y += 0.0024;
      }
      scene.render();
    });

    window.addEventListener('resize', () => engine.resize());
  }

  function createMiniOrbiters() {
    // Mini Luna
    miniMoon = BABYLON.MeshBuilder.CreateSphere('miniMoon', { diameter: 0.28, segments: 24 }, scene);
    miniMoon.position = new BABYLON.Vector3(-2.2, 0.4, -0.6);
    const mmMat = new BABYLON.StandardMaterial('mmMat', scene);
    mmMat.diffuseTexture = new BABYLON.Texture('textures/moon.jpg', scene);
    miniMoon.material = mmMat;

    // Mini Marte
    miniMars = BABYLON.MeshBuilder.CreateSphere('miniMars', { diameter: 0.38, segments: 24 }, scene);
    miniMars.position = new BABYLON.Vector3(2.6, -0.3, 0.8);
    const mmarsMat = new BABYLON.StandardMaterial('mmarsMat', scene);
    mmarsMat.diffuseTexture = new BABYLON.Texture('textures/mars.jpg', scene);
    miniMars.material = mmarsMat;

    let angle = 0;
    scene.onBeforeRenderObservable.add(() => {
      angle += 0.005;
      miniMoon.position.x = Math.cos(angle) * 2.2;
      miniMoon.position.z = Math.sin(angle) * 2.2;
      miniMoon.rotation.y += 0.01;

      miniMars.position.x = Math.cos(-angle * 0.7 + 1.5) * 2.7;
      miniMars.position.z = Math.sin(-angle * 0.7 + 1.5) * 2.7;
      miniMars.rotation.y += 0.008;
    });
  }

  function switchPlanet(planetKey) {
    activePlanet = planetKey;
    document.querySelectorAll('.planet-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.planet === planetKey);
    });

    if (!planetSphere) return;

    if (planetKey === 'Earth') {
      planetSphere.material = (activeLayerMode === 'Topography') ? earthMat : earthMat;
      if (cloudsSphere) cloudsSphere.isVisible = true;
      document.getElementById('navCoords').textContent = '⊙ 29.0393° N, 13.7165° W • WGS84 | 5,000 km';
    } else if (planetKey === 'Moon') {
      planetSphere.material = moonMat;
      if (cloudsSphere) cloudsSphere.isVisible = false;
      document.getElementById('navCoords').textContent = '⊙ 18.2300° N, 30.5000° E • LUNA (LOLA 2026) | 1,737 km';
    } else if (planetKey === 'Mars') {
      planetSphere.material = marsMat;
      if (cloudsSphere) cloudsSphere.isVisible = false;
      document.getElementById('navCoords').textContent = '⊙ 18.3800° N, 77.5800° E • MARTE (MOLA MGS) | 3,390 km';
    }

    updateDockMetrics();
  }

  // =========================================================================
  // 2. RADAR 2D DE ANÁLOGOS PLANETARIOS (CANVAS 2D)
  // =========================================================================
  const radarCanvas = document.getElementById('radarCanvas');
  const radarCtx = radarCanvas ? radarCanvas.getContext('2d') : null;
  let radarAngle = 0;

  function initRadar() {
    if (!radarCtx) return;
    function renderRadar() {
      const w = radarCanvas.width = radarCanvas.clientWidth * window.devicePixelRatio;
      const h = radarCanvas.height = radarCanvas.clientHeight * window.devicePixelRatio;
      const cx = w / 2, cy = h / 2;
      const r = Math.min(cx, cy) - 10;

      radarCtx.clearRect(0, 0, w, h);

      // Fondo oscuro
      radarCtx.fillStyle = '#020617';
      radarCtx.fillRect(0, 0, w, h);

      // Círculos concéntricos
      radarCtx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
      radarCtx.lineWidth = 1.5;
      for (let i = 1; i <= 3; i++) {
        radarCtx.beginPath();
        radarCtx.arc(cx, cy, (r / 3) * i, 0, Math.PI * 2);
        radarCtx.stroke();
      }

      // Ejes en cruz
      radarCtx.beginPath();
      radarCtx.moveTo(cx, cy - r);
      radarCtx.lineTo(cx, cy + r);
      radarCtx.moveTo(cx - r, cy);
      radarCtx.lineTo(cx + r, cy);
      radarCtx.stroke();

      // Barrido de radar giratorio
      radarAngle += 0.035;
      const sweepGradient = radarCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
      sweepGradient.addColorStop(0, 'rgba(34, 211, 238, 0.4)');
      sweepGradient.addColorStop(1, 'rgba(34, 211, 238, 0.0)');

      radarCtx.save();
      radarCtx.beginPath();
      radarCtx.moveTo(cx, cy);
      radarCtx.arc(cx, cy, r, radarAngle - 0.5, radarAngle);
      radarCtx.closePath();
      radarCtx.fillStyle = sweepGradient;
      radarCtx.fill();
      radarCtx.restore();

      // Línea de barrido
      radarCtx.beginPath();
      radarCtx.moveTo(cx, cy);
      radarCtx.lineTo(cx + Math.cos(radarAngle) * r, cy + Math.sin(radarAngle) * r);
      radarCtx.strokeStyle = '#22d3ee';
      radarCtx.lineWidth = 2;
      radarCtx.stroke();

      // Objetivos / Análogos detectados
      DATA.analogSites.forEach((site, index) => {
        const blipAngle = (index * 1.3) + 0.4;
        const blipDist = 0.35 * r + (index * 0.12 * r);
        const bx = cx + Math.cos(blipAngle) * blipDist;
        const by = cy + Math.sin(blipAngle) * blipDist;

        const isCurrent = site.id === activeAnalogSite.id;
        radarCtx.beginPath();
        radarCtx.arc(bx, by, isCurrent ? 5 : 3.5, 0, Math.PI * 2);
        radarCtx.fillStyle = isCurrent ? '#f59e0b' : '#38bdf8';
        radarCtx.fill();

        if (isCurrent) {
          radarCtx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
          radarCtx.beginPath();
          radarCtx.arc(bx, by, 9 + Math.sin(Date.now() * 0.006) * 3, 0, Math.PI * 2);
          radarCtx.stroke();
        }
      });

      requestAnimationFrame(renderRadar);
    }
    requestAnimationFrame(renderRadar);
  }

  // =========================================================================
  // 3. VISUALIZADOR 3D DEM INTERACTIVO (COPERNICUS DEM 30M / IGN MDT05)
  // =========================================================================
  const demCanvas = document.getElementById('demCanvas');
  const demCtx = demCanvas ? demCanvas.getContext('2d') : null;
  let demExaggeration = 3.5;
  let demWireframe = false;
  let demRotX = 0.58;
  let demRotY = 0.75;
  let isDraggingDem = false;
  let lastMouseX = 0, lastMouseY = 0;

  function initDemRenderer() {
    if (!demCtx) return;

    demCanvas.addEventListener('mousedown', (e) => {
      isDraggingDem = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    });

    window.addEventListener('mouseup', () => { isDraggingDem = false; });

    window.addEventListener('mousemove', (e) => {
      if (!isDraggingDem) return;
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      demRotY += dx * 0.01;
      demRotX = Math.max(0.1, Math.min(1.4, demRotX + dy * 0.01));
      drawDem();
    });

    drawDem();
  }

  function drawDem() {
    if (!demCtx) return;
    const w = demCanvas.width = demCanvas.clientWidth * window.devicePixelRatio;
    const h = demCanvas.height = demCanvas.clientHeight * window.devicePixelRatio;

    demCtx.clearRect(0, 0, w, h);
    demCtx.fillStyle = '#020617';
    demCtx.fillRect(0, 0, w, h);

    const grid = DATA.dem3DData.grid;
    const rows = grid.length;
    const cols = grid[0].length;
    const cx = w / 2;
    const cy = h / 2 + 25;
    const scale = Math.min(w, h) * 0.42;

    const cosY = Math.cos(demRotY), sinY = Math.sin(demRotY);
    const cosX = Math.cos(demRotX), sinX = Math.sin(demRotX);

    function project(x, y, z) {
      // Normalizar a [-1, 1]
      const nx = (x / (cols - 1)) * 2 - 1;
      const ny = (y / (rows - 1)) * 2 - 1;
      const nz = ((z - 260) / 140) * demExaggeration * 0.35;

      // Rotación Y
      const rx = nx * cosY - ny * sinY;
      const ry = nx * sinY + ny * cosY;

      // Rotación X e inclinación isométrica
      const px = rx * scale + cx;
      const py = (ry * sinX - nz * cosX) * scale + cy;
      return { px, py, nz };
    }

    // Dibujar malla cuadrilátera de superficie
    for (let y = 0; y < rows - 1; y++) {
      for (let x = 0; x < cols - 1; x++) {
        const z00 = grid[y][x];
        const z10 = grid[y][x + 1];
        const z11 = grid[y + 1][x + 1];
        const z01 = grid[y + 1][x];

        const p00 = project(x, y, z00);
        const p10 = project(x + 1, y, z10);
        const p11 = project(x + 1, y + 1, z11);
        const p01 = project(x, y + 1, z01);

        const avgZ = (z00 + z10 + z11 + z01) / 4.0;
        const normZ = Math.max(0, Math.min(1, (avgZ - 260) / 140));

        // Rampa de color hipsométrica
        let fillColor;
        if (normZ < 0.25) fillColor = `rgba(30, 58, 138, 0.8)`;
        else if (normZ < 0.5) fillColor = `rgba(16, 185, 129, 0.85)`;
        else if (normZ < 0.75) fillColor = `rgba(245, 158, 11, 0.85)`;
        else fillColor = `rgba(239, 68, 68, 0.9)`;

        demCtx.beginPath();
        demCtx.moveTo(p00.px, p00.py);
        demCtx.lineTo(p10.px, p10.py);
        demCtx.lineTo(p11.px, p11.py);
        demCtx.lineTo(p01.px, p01.py);
        demCtx.closePath();

        if (!demWireframe) {
          demCtx.fillStyle = fillColor;
          demCtx.fill();
        }

        demCtx.strokeStyle = demWireframe ? 'rgba(34, 211, 238, 0.7)' : 'rgba(2, 6, 23, 0.4)';
        demCtx.lineWidth = 1;
        demCtx.stroke();
      }
    }

    // Marcador del Tubo de Lava detectado
    const tubePt = project(20, 20, grid[20][20]);
    demCtx.beginPath();
    demCtx.arc(tubePt.px, tubePt.py, 6, 0, Math.PI * 2);
    demCtx.fillStyle = '#f59e0b';
    demCtx.fill();
    demCtx.strokeStyle = '#fff';
    demCtx.lineWidth = 2;
    demCtx.stroke();
  }

  // =========================================================================
  // 4. SIMULADOR DE TELEMETRÍA Y LIDAR SLAM DEL UNITREE GO2
  // =========================================================================
  const robotCamCanvas = document.getElementById('robotCamCanvas');
  const robotCamCtx = robotCamCanvas ? robotCamCanvas.getContext('2d') : null;

  const robotLidarCanvas = document.getElementById('robotLidarCanvas');
  const robotLidarCtx = robotLidarCanvas ? robotLidarCanvas.getContext('2d') : null;

  let robotX = 0, robotY = 0, robotYaw = 0;
  let robotSpeed = 0.3;
  let robotBattery = 88.4;
  let isRobotRunning = false;

  function initRobotVisualizer() {
    if (!robotCamCtx || !robotLidarCtx) return;

    function renderRobotFeed() {
      if (document.getElementById('robotModal').classList.contains('active')) {
        drawRobotCamera();
        drawRobotLidar();
      }
      requestAnimationFrame(renderRobotFeed);
    }
    requestAnimationFrame(renderRobotFeed);

    // Conducción WASD interactiva
    window.addEventListener('keydown', (e) => {
      if (!document.getElementById('robotModal').classList.contains('active')) return;
      if (e.key === 'w' || e.key === 'W') { robotX += Math.cos(robotYaw) * 0.12; robotY += Math.sin(robotYaw) * 0.12; }
      if (e.key === 's' || e.key === 'S') { robotX -= Math.cos(robotYaw) * 0.12; robotY -= Math.sin(robotYaw) * 0.12; }
      if (e.key === 'a' || e.key === 'A') { robotYaw -= 0.08; }
      if (e.key === 'd' || e.key === 'D') { robotYaw += 0.08; }
      if (e.key === ' ') { /* parada de emergencia */ }
    });
  }

  function drawRobotCamera() {
    const w = robotCamCanvas.width = robotCamCanvas.clientWidth * window.devicePixelRatio;
    const h = robotCamCanvas.height = robotCamCanvas.clientHeight * window.devicePixelRatio;

    robotCamCtx.fillStyle = '#050a14';
    robotCamCtx.fillRect(0, 0, w, h);

    // Terreno simulado de cueva basáltica / exterior
    robotCamCtx.fillStyle = '#1e293b';
    robotCamCtx.fillRect(0, h * 0.45, w, h * 0.55);

    // Líneas de perspectiva del suelo
    robotCamCtx.strokeStyle = 'rgba(34, 211, 238, 0.2)';
    robotCamCtx.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      robotCamCtx.beginPath();
      robotCamCtx.moveTo(w / 2, h * 0.45);
      robotCamCtx.lineTo((w / 8) * i, h);
      robotCamCtx.stroke();
    }

    // Cuadro delimitador de detección IA de cueva
    const boxW = 140, boxH = 90;
    const bx = w / 2 - boxW / 2 + Math.sin(Date.now() * 0.002) * 20;
    const by = h * 0.5 - 20;

    robotCamCtx.strokeStyle = '#22d3ee';
    robotCamCtx.lineWidth = 2;
    robotCamCtx.strokeRect(bx, by, boxW, boxH);

    robotCamCtx.fillStyle = '#22d3ee';
    robotCamCtx.font = '12px monospace';
    robotCamCtx.fillText('CONDUCTO BASÁLTICO (CONF: 96%)', bx, by - 8);

    // Crosshairs centrales
    robotCamCtx.strokeStyle = 'rgba(245, 158, 11, 0.8)';
    robotCamCtx.beginPath();
    robotCamCtx.moveTo(w / 2 - 15, h / 2);
    robotCamCtx.lineTo(w / 2 + 15, h / 2);
    robotCamCtx.moveTo(w / 2, h / 2 - 15);
    robotCamCtx.lineTo(w / 2, h / 2 + 15);
    robotCamCtx.stroke();
  }

  function drawRobotLidar() {
    const w = robotLidarCanvas.width = robotLidarCanvas.clientWidth * window.devicePixelRatio;
    const h = robotLidarCanvas.height = robotLidarCanvas.clientHeight * window.devicePixelRatio;

    robotLidarCtx.fillStyle = '#020617';
    robotLidarCtx.fillRect(0, 0, w, h);

    const cx = w / 2 + robotX * 15;
    const cy = h / 2 + robotY * 15;
    const scale = 26;

    // Círculos de alcance LiDAR
    robotLidarCtx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
    robotLidarCtx.lineWidth = 1;
    [1, 2, 3, 4].forEach(dist => {
      robotLidarCtx.beginPath();
      robotLidarCtx.arc(cx, cy, dist * scale, 0, Math.PI * 2);
      robotLidarCtx.stroke();
    });

    // Puntos reales del LiDAR SLAM pregrabado
    const pts = DATA.robotTelemetry.sampleLidarPoints;
    pts.forEach(p => {
      const px = cx + p[0] * scale;
      const py = cy + p[1] * scale;
      const z = p[2];

      const hue = Math.round(220 - (z + 0.5) * 160);
      robotLidarCtx.fillStyle = `hsl(${hue}, 90%, 55%)`;
      robotLidarCtx.fillRect(px - 1.5, py - 1.5, 3, 3);
    });

    // Icono del robot Go2
    robotLidarCtx.save();
    robotLidarCtx.translate(cx, cy);
    robotLidarCtx.rotate(robotYaw);

    robotLidarCtx.fillStyle = '#34d399';
    robotLidarCtx.beginPath();
    robotLidarCtx.moveTo(12, 0);
    robotLidarCtx.lineTo(-8, -7);
    robotLidarCtx.lineTo(-4, 0);
    robotLidarCtx.lineTo(-8, 7);
    robotLidarCtx.closePath();
    robotLidarCtx.fill();

    robotLidarCtx.restore();
  }

  // =========================================================================
  // 5. ACTUALIZACIÓN DE MÉTRICAS Y EVENTOS
  // =========================================================================
  function updateDockMetrics() {
    const p = DATA.planets[activePlanet];
    document.getElementById('dockSurfArea').textContent = `${p.surfaceMillionKm2}M km²`;
    document.getElementById('dockGravity').textContent = `${p.gravityG}× (${p.gravityMs2} m/s²)`;
    document.getElementById('dockTemp').textContent = `${p.avgTempC} °C`;
    document.getElementById('dockComplexity').textContent = p.complexity.split(' ')[0] || 'Media';
  }

  function setupEventHandlers() {
    // Selector planetario
    document.querySelectorAll('.planet-pill').forEach(btn => {
      btn.addEventListener('click', () => switchPlanet(btn.dataset.planet));
    });

    // Herramientas orbitales
    document.getElementById('btnOrbit')?.addEventListener('click', () => { autoRotate = !autoRotate; });
    document.getElementById('btnZoomIn')?.addEventListener('click', () => { if (camera) camera.radius = Math.max(2.4, camera.radius - 0.8); });
    document.getElementById('btnZoomOut')?.addEventListener('click', () => { if (camera) camera.radius = Math.min(16.0, camera.radius + 0.8); });
    document.getElementById('btnFit')?.addEventListener('click', () => {
      if (camera) { camera.radius = 5.2; camera.beta = Math.PI / 2.2; camera.alpha = -Math.PI / 2; }
    });

    // Controles DEM
    document.getElementById('btnDemWireframe')?.addEventListener('click', function () {
      demWireframe = !demWireframe;
      this.classList.toggle('active', demWireframe);
      drawDem();
    });

    document.getElementById('btnDemExaggeration')?.addEventListener('click', function () {
      demExaggeration = demExaggeration === 3.5 ? 6.5 : (demExaggeration === 6.5 ? 1.5 : 3.5);
      this.textContent = `Exageración: ×${demExaggeration.toFixed(1)}`;
      drawDem();
    });

    // Modales
    const robotModal = document.getElementById('robotModal');
    document.getElementById('btnOpenRobot')?.addEventListener('click', () => { robotModal.classList.add('active'); });
    document.getElementById('btnCloseRobot')?.addEventListener('click', () => { robotModal.classList.remove('active'); });

    const compModal = document.getElementById('compModal');
    document.getElementById('btnOpenComp')?.addEventListener('click', () => { compModal.classList.add('active'); });
    document.getElementById('btnCloseComp')?.addEventListener('click', () => { compModal.classList.remove('active'); });

    // Cierre al hacer clic fuera
    [robotModal, compModal].forEach(m => {
      m?.addEventListener('click', (e) => {
        if (e.target === m) m.classList.remove('active');
      });
    });

    // Botones de postura del perro
    document.querySelectorAll('.posture-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const cmd = this.dataset.posture;
        const msg = document.getElementById('robotStatusMsg');
        if (msg) msg.textContent = `🐕 Postura ejecutada: ${cmd} (OK)`;
      });
    });
  }

  // =========================================================================
  // 6. INICIALIZACIÓN GENERAL
  // =========================================================================
  window.addEventListener('DOMContentLoaded', () => {
    initBabylonGlobe();
    initRadar();
    initDemRenderer();
    initRobotVisualizer();
    setupEventHandlers();
    updateDockMetrics();
    console.log('TERRAIN-X Standalone Precompiled Demo initialized successfully.');
  });

})();
