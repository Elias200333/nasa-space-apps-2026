import * as BABYLON from 'babylonjs';
import * as GUI from 'babylonjs-gui';
import { CelestialBody, PlanetaryLayerMode } from '../types';
import { sound } from '../audio';

export interface XRSpatialUICallbacks {
  onPlanetSwitch: (planet: CelestialBody) => void;
  onLayerModeSwitch: (mode: PlanetaryLayerMode) => void;
  onCameraTool: (action: 'orbit' | 'move' | 'zoomIn' | 'zoomOut' | 'fit') => void;
  onCompareWithEarth?: (target: 'Moon' | 'Mars') => void;
}

/**
 * Gestor del Entorno Holográfico Espacial 3D (WebXR) para Babylon.js
 * =================================================================
 * Genera una suite de paneles holográficos flotantes alrededor del globo central,
 * inspirada en la sala de mando holográfica de la NASA con gafas de Realidad Virtual:
 * - Pedestal holográfico con anillos de luz y retícula de telemetría geodésica.
 * - Barra superior flotante con selector [Moon] [Earth] [Mars] y pestañas de misión.
 * - Tarjeta holográfica lateral izquierda: Luna (morfología, regolito y métricas).
 * - Tarjeta holográfica lateral derecha: Marte (volcanismo, atmósfera y métricas).
 * - Panel HUD de cartografía orbital NASA / USGS sobre el planeta.
 * - Herramientas de navegación de cámara en suspensión.
 * - Consola inferior de análisis de análogos (Cráter de Caldera Blanca, DEM IGN LiDAR, similitud 68.5%).
 * - Sin planetoides orbitando la Tierra (el foco central es el planeta interactivo).
 */
export class XRSpatialUIManager {
  private scene: BABYLON.Scene;
  private callbacks: XRSpatialUICallbacks;
  private rootNode: BABYLON.TransformNode;
  private meshes: BABYLON.Mesh[] = [];
  private dynamicTextures: GUI.AdvancedDynamicTexture[] = [];

  // Estado activo
  private activePlanet: CelestialBody = 'Earth';
  private activeLayerMode: PlanetaryLayerMode = 'surface';

  // Referencias a controles GUI para actualización dinámica
  private planetButtons: { [key in CelestialBody]?: GUI.Button } = {};
  private layerButtons: { [key in PlanetaryLayerMode]?: GUI.Button } = {};
  private cartographyTitleBlock: GUI.TextBlock | null = null;
  private pedestalReticleMesh: BABYLON.Mesh | null = null;

  constructor(scene: BABYLON.Scene, callbacks: XRSpatialUICallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.rootNode = new BABYLON.TransformNode('xrSpatialUIRoot', this.scene);
  }

  /**
   * Construye el entorno holográfico completo en la escena de Babylon.js
   */
  public buildSpatialInterface() {
    this.createHolographicPedestal();
    this.createTopNavigationBar();
    this.createLeftMoonCard();
    this.createRightMarsCard();
    this.createCentralCartographyBadge();
    this.createCameraTools();
    this.createBottomConsole();
  }

  // =========================================================================
  // 1. Pedestal Holográfico en la Base de la Tierra
  // =========================================================================
  private createHolographicPedestal() {
    const pedestalRoot = new BABYLON.TransformNode('xrPedestalRoot', this.scene);
    pedestalRoot.parent = this.rootNode;
    pedestalRoot.position = new BABYLON.Vector3(0, -2.85, 0);

    // Anillo exterior brillante cian
    const outerRing = BABYLON.MeshBuilder.CreateTorus('xrOuterRing', {
      diameter: 6.8,
      thickness: 0.045,
      tessellation: 64
    }, this.scene);
    outerRing.parent = pedestalRoot;
    const ringMat1 = new BABYLON.StandardMaterial('xrRingMat1', this.scene);
    ringMat1.emissiveColor = new BABYLON.Color3(0.08, 0.85, 0.98);
    ringMat1.diffuseColor = new BABYLON.Color3(0.08, 0.85, 0.98);
    ringMat1.alpha = 0.85;
    outerRing.material = ringMat1;
    this.meshes.push(outerRing);

    // Anillo interior azul profundo
    const innerRing = BABYLON.MeshBuilder.CreateTorus('xrInnerRing', {
      diameter: 5.6,
      thickness: 0.035,
      tessellation: 64
    }, this.scene);
    innerRing.parent = pedestalRoot;
    innerRing.position.y = -0.08;
    const ringMat2 = new BABYLON.StandardMaterial('xrRingMat2', this.scene);
    ringMat2.emissiveColor = new BABYLON.Color3(0.02, 0.55, 0.85);
    ringMat2.alpha = 0.65;
    innerRing.material = ringMat2;
    this.meshes.push(innerRing);

    // Anillo intermedio pulsante fino
    const midRing = BABYLON.MeshBuilder.CreateTorus('xrMidRing', {
      diameter: 6.2,
      thickness: 0.02,
      tessellation: 64
    }, this.scene);
    midRing.parent = pedestalRoot;
    midRing.position.y = -0.04;
    const ringMat3 = new BABYLON.StandardMaterial('xrRingMat3', this.scene);
    ringMat3.emissiveColor = new BABYLON.Color3(0.2, 0.95, 1.0);
    ringMat3.alpha = 0.5;
    midRing.material = ringMat3;
    this.meshes.push(midRing);

    // Disco reticular de telemetría holográfica con rotación lenta
    const reticlePlane = BABYLON.MeshBuilder.CreateDisc('xrPedestalReticle', {
      radius: 3.5,
      tessellation: 64
    }, this.scene);
    reticlePlane.parent = pedestalRoot;
    reticlePlane.rotation.x = Math.PI / 2;
    reticlePlane.position.y = -0.02;

    const reticleTex = new BABYLON.DynamicTexture('xrReticleTex', { width: 1024, height: 1024 }, this.scene, true);
    reticleTex.hasAlpha = true;
    const ctx = reticleTex.getContext() as any;
    ctx.clearRect(0, 0, 1024, 1024);

    // Dibujar círculos concéntricos y marcas radiales tipo HUD
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(512, 512, 480, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(34, 211, 238, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(512, 512, 400, 0, Math.PI * 2);
    ctx.stroke();

    // Marcas de cuadrante
    for (let deg = 0; deg < 360; deg += 15) {
      const rad = (deg * Math.PI) / 180;
      const r1 = deg % 45 === 0 ? 460 : 472;
      const r2 = 485;
      ctx.strokeStyle = deg % 45 === 0 ? 'rgba(34, 211, 238, 0.7)' : 'rgba(34, 211, 238, 0.3)';
      ctx.beginPath();
      ctx.moveTo(512 + Math.cos(rad) * r1, 512 + Math.sin(rad) * r1);
      ctx.lineTo(512 + Math.cos(rad) * r2, 512 + Math.sin(rad) * r2);
      ctx.stroke();
    }

    // Texto de coordenadas de telemetría geodésica
    ctx.fillStyle = 'rgba(34, 211, 238, 0.85)';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('29.039° N, 13.716° W • WGS84 | 5,000 km | TERRAIN-X HOLOGRAPHIC STAGE', 512, 930);
    ctx.fillText('NASA SPACE APPS CHALLENGE 2026 • GLOBAL TERRESTRIAL & PLANETARY OBSERVATORY', 512, 100);
    reticleTex.update();

    const reticleMat = new BABYLON.StandardMaterial('xrReticleMat', this.scene);
    reticleMat.diffuseTexture = reticleTex;
    reticleMat.emissiveTexture = reticleTex;
    reticleMat.opacityTexture = reticleTex;
    reticleMat.backFaceCulling = false;
    reticleMat.disableLighting = true;
    reticlePlane.material = reticleMat;

    this.pedestalReticleMesh = reticlePlane;
    this.meshes.push(reticlePlane);

    // Animación de rotación continua lenta del pedestal
    this.scene.onBeforeRenderObservable.add(() => {
      if (this.pedestalReticleMesh) {
        this.pedestalReticleMesh.rotation.z += 0.0006;
      }
    });
  }

  // =========================================================================
  // 2. Barra de Navegación Superior Flotante
  // =========================================================================
  private createTopNavigationBar() {
    const plane = BABYLON.MeshBuilder.CreatePlane('xrTopNavPlane', {
      width: 6.2,
      height: 0.85
    }, this.scene);
    plane.parent = this.rootNode;
    plane.position = new BABYLON.Vector3(0, 3.65, 0.2);

    const adt = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 1860, 255, false);
    this.dynamicTextures.push(adt);
    this.meshes.push(plane);

    const rootBox = new GUI.Rectangle('navBarRoot');
    rootBox.width = '1840px';
    rootBox.height = '235px';
    rootBox.cornerRadius = 24;
    rootBox.color = 'rgba(34, 211, 238, 0.45)';
    rootBox.thickness = 1.5;
    rootBox.background = 'rgba(7, 13, 26, 0.88)';
    adt.addControl(rootBox);

    const grid = new GUI.Grid();
    grid.addColumnDefinition(0.28); // Logo & Brand
    grid.addColumnDefinition(0.42); // Planetary Selector & Tabs
    grid.addColumnDefinition(0.30); // Search & Status
    rootBox.addControl(grid);

    // Columna 1: Logo & Brand
    const brandPanel = new GUI.StackPanel();
    brandPanel.isVertical = false;
    brandPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    brandPanel.paddingLeft = '30px';

    const logoBlock = new GUI.Rectangle();
    logoBlock.width = '52px';
    logoBlock.height = '52px';
    logoBlock.cornerRadius = 26;
    logoBlock.background = '#0284c7';
    logoBlock.color = '#38bdf8';
    logoBlock.thickness = 2;

    const logoImg = new GUI.Image('logoImg', './ief_comparation_logo.jpg');
    logoImg.width = '48px';
    logoImg.height = '48px';
    logoBlock.addControl(logoImg);
    brandPanel.addControl(logoBlock);

    const titlePanel = new GUI.StackPanel();
    titlePanel.isVertical = true;
    titlePanel.paddingLeft = '18px';
    titlePanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;

    const titleText = new GUI.TextBlock();
    titleText.text = 'IEF Comparaison';
    titleText.color = '#ffffff';
    titleText.fontSize = 24;
    titleText.fontWeight = 'bold';
    titleText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.height = '32px';
    titlePanel.addControl(titleText);

    const subText = new GUI.TextBlock();
    subText.text = 'NASA SPACE APPS 2026';
    subText.color = '#38bdf8';
    subText.fontSize = 13;
    subText.fontWeight = '600';
    subText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    subText.height = '20px';
    titlePanel.addControl(subText);

    brandPanel.addControl(titlePanel);
    grid.addControl(brandPanel, 0, 0);

    // Columna 2: Planetary Selector [Moon] [Earth] [Mars]
    const centerPanel = new GUI.StackPanel();
    centerPanel.isVertical = true;
    centerPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;

    const planetSwitcher = new GUI.StackPanel();
    planetSwitcher.isVertical = false;
    planetSwitcher.height = '62px';
    planetSwitcher.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;

    const createPlanetBtn = (body: CelestialBody, label: string, color: string) => {
      const btn = GUI.Button.CreateSimpleButton(`btnPlanet_${body}`, label);
      btn.width = '145px';
      btn.height = '46px';
      btn.color = '#e2e8f0';
      btn.fontSize = 17;
      btn.fontWeight = 'bold';
      btn.cornerRadius = 23;
      btn.thickness = 1.5;
      btn.background = body === this.activePlanet ? 'rgba(14, 165, 233, 0.45)' : 'rgba(15, 23, 42, 0.6)';
      btn.color = body === this.activePlanet ? '#ffffff' : '#94a3b8';

      btn.onPointerClickObservable.add(() => {
        sound.playClick(body === 'Earth' ? 600 : (body === 'Mars' ? 750 : 500));
        this.setActivePlanet(body);
        this.callbacks.onPlanetSwitch(body);
      });

      this.planetButtons[body] = btn;
      planetSwitcher.addControl(btn);
    };

    createPlanetBtn('Moon', '● Moon', '#94a3b8');
    createPlanetBtn('Earth', '● Earth', '#38bdf8');
    createPlanetBtn('Mars', '● Mars', '#f97316');

    centerPanel.addControl(planetSwitcher);

    // Pestañas secundarias
    const navTabs = new GUI.StackPanel();
    navTabs.isVertical = false;
    navTabs.height = '34px';
    navTabs.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;

    ['Explore', 'Compare', 'Terrain', 'Data', 'Missions'].forEach((tabName, idx) => {
      const tabBtn = GUI.Button.CreateSimpleButton(`tab_${tabName}`, tabName);
      tabBtn.width = '96px';
      tabBtn.height = '28px';
      tabBtn.fontSize = 13;
      tabBtn.thickness = 0;
      tabBtn.cornerRadius = 14;
      tabBtn.color = idx === 0 ? '#38bdf8' : '#64748b';
      tabBtn.background = idx === 0 ? 'rgba(56, 189, 248, 0.15)' : 'transparent';
      tabBtn.onPointerClickObservable.add(() => sound.playClick(650));
      navTabs.addControl(tabBtn);
    });

    centerPanel.addControl(navTabs);
    grid.addControl(centerPanel, 0, 1);

    // Columna 3: Search bar & XR Status
    const rightPanel = new GUI.StackPanel();
    rightPanel.isVertical = false;
    rightPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    rightPanel.paddingRight = '25px';

    const searchPill = new GUI.Rectangle();
    searchPill.width = '330px';
    searchPill.height = '44px';
    searchPill.cornerRadius = 22;
    searchPill.background = 'rgba(15, 23, 42, 0.7)';
    searchPill.color = 'rgba(255, 255, 255, 0.12)';
    searchPill.thickness = 1;

    const searchTxt = new GUI.TextBlock();
    searchTxt.text = '🔍 Search crater, region...';
    searchTxt.color = '#94a3b8';
    searchTxt.fontSize = 14;
    searchTxt.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    searchTxt.paddingLeft = '20px';
    searchPill.addControl(searchTxt);
    rightPanel.addControl(searchPill);

    const xrBadge = new GUI.Rectangle();
    xrBadge.width = '120px';
    xrBadge.height = '38px';
    xrBadge.cornerRadius = 19;
    xrBadge.background = 'rgba(16, 185, 129, 0.18)';
    xrBadge.color = '#10b981';
    xrBadge.thickness = 1.5;
    xrBadge.paddingLeft = '16px';

    const xrTxt = new GUI.TextBlock();
    xrTxt.text = '● XR ACTIVE';
    xrTxt.color = '#34d399';
    xrTxt.fontSize = 12;
    xrTxt.fontWeight = 'bold';
    xrBadge.addControl(xrTxt);
    rightPanel.addControl(xrBadge);

    grid.addControl(rightPanel, 0, 2);
  }

  // =========================================================================
  // 3. Tarjeta Holográfica Izquierda: Moon (Luna)
  // =========================================================================
  private createLeftMoonCard() {
    const plane = BABYLON.MeshBuilder.CreatePlane('xrMoonCardPlane', {
      width: 2.7,
      height: 3.5
    }, this.scene);
    plane.parent = this.rootNode;
    plane.position = new BABYLON.Vector3(-4.8, 0.65, 0.8);
    plane.rotation.y = 0.38; // Inclinación suave hacia el usuario

    const adt = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 810, 1050, false);
    this.dynamicTextures.push(adt);
    this.meshes.push(plane);

    const card = new GUI.Rectangle('moonCard');
    card.width = '790px';
    card.height = '1030px';
    card.cornerRadius = 24;
    card.color = 'rgba(203, 213, 225, 0.35)';
    card.thickness = 1.5;
    card.background = 'rgba(11, 19, 36, 0.88)';
    adt.addControl(card);

    const stack = new GUI.StackPanel();
    stack.isVertical = true;
    stack.paddingTop = '24px';
    stack.paddingLeft = '30px';
    stack.paddingRight = '30px';
    card.addControl(stack);

    // Header
    const header = new GUI.StackPanel();
    header.isVertical = false;
    header.height = '48px';

    const iconBox = new GUI.Rectangle();
    iconBox.width = '38px';
    iconBox.height = '38px';
    iconBox.cornerRadius = 19;
    iconBox.background = 'rgba(203, 213, 225, 0.2)';
    iconBox.color = '#cbd5e1';
    iconBox.thickness = 1;
    const iconTxt = new GUI.TextBlock();
    iconTxt.text = '🌙';
    iconTxt.fontSize = 20;
    iconBox.addControl(iconTxt);
    header.addControl(iconBox);

    const titleStack = new GUI.StackPanel();
    titleStack.isVertical = true;
    titleStack.paddingLeft = '14px';
    const t1 = new GUI.TextBlock();
    t1.text = 'Moon';
    t1.color = '#ffffff';
    t1.fontSize = 22;
    t1.fontWeight = 'bold';
    t1.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    t1.height = '28px';
    titleStack.addControl(t1);

    const t2 = new GUI.TextBlock();
    t2.text = "Earth's natural satellite";
    t2.color = '#94a3b8';
    t2.fontSize = 13;
    t2.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    t2.height = '18px';
    titleStack.addControl(t2);
    header.addControl(titleStack);
    stack.addControl(header);

    // Imagen / Preview visual de la Luna
    const previewContainer = new GUI.Rectangle();
    previewContainer.width = '240px';
    previewContainer.height = '240px';
    previewContainer.cornerRadius = 120;
    previewContainer.color = 'rgba(203, 213, 225, 0.3)';
    previewContainer.thickness = 2;
    previewContainer.paddingTop = '20px';
    previewContainer.background = '#0a0f1d';

    const moonImg = new GUI.Image('moonImg', './textures/moon.jpg');
    moonImg.width = '236px';
    moonImg.height = '236px';
    previewContainer.addControl(moonImg);
    stack.addControl(previewContainer);

    // Pestañas
    const tabsRow = new GUI.StackPanel();
    tabsRow.isVertical = false;
    tabsRow.height = '36px';
    tabsRow.paddingTop = '20px';
    ['Overview', 'Terrain', 'Geology', 'Data'].forEach((t, i) => {
      const b = GUI.Button.CreateSimpleButton(`mTab_${t}`, t);
      b.width = '175px';
      b.height = '30px';
      b.fontSize = 14;
      b.cornerRadius = 15;
      b.color = i === 0 ? '#38bdf8' : '#64748b';
      b.background = i === 0 ? 'rgba(56, 189, 248, 0.15)' : 'transparent';
      b.thickness = 0;
      tabsRow.addControl(b);
    });
    stack.addControl(tabsRow);

    // Lista de métricas científicas
    const metricsStack = new GUI.StackPanel();
    metricsStack.isVertical = true;
    metricsStack.paddingTop = '18px';

    const addMetricRow = (label: string, value: string) => {
      const row = new GUI.StackPanel();
      row.isVertical = false;
      row.height = '36px';
      const l = new GUI.TextBlock();
      l.text = label;
      l.color = '#94a3b8';
      l.fontSize = 15;
      l.width = '360px';
      l.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      row.addControl(l);

      const v = new GUI.TextBlock();
      v.text = value;
      v.color = '#f8fafc';
      v.fontSize = 15;
      v.fontWeight = 'bold';
      v.width = '360px';
      v.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
      row.addControl(v);

      metricsStack.addControl(row);
    };

    addMetricRow('Radius', '1,737 km');
    addMetricRow('Surface area', '37.9 million km²');
    addMetricRow('Gravity', '0.165 g (16.5% of Earth)');
    addMetricRow('Avg. temperature', '-173 to 127 °C');
    addMetricRow('Dominant terrain', 'Craters, regolith, highlands');
    stack.addControl(metricsStack);

    // Botón de acción: Comparar con la Tierra
    const btnCompare = GUI.Button.CreateSimpleButton('btnMoonCompare', '∞ Compare with Earth');
    btnCompare.width = '720px';
    btnCompare.height = '54px';
    btnCompare.cornerRadius = 27;
    btnCompare.paddingTop = '24px';
    btnCompare.background = 'rgba(34, 211, 238, 0.18)';
    btnCompare.color = '#38bdf8';
    btnCompare.fontSize = 16;
    btnCompare.fontWeight = 'bold';
    btnCompare.thickness = 1.5;
    btnCompare.onPointerClickObservable.add(() => {
      sound.playClick(700);
      if (this.callbacks.onCompareWithEarth) this.callbacks.onCompareWithEarth('Moon');
    });
    stack.addControl(btnCompare);
  }

  // =========================================================================
  // 4. Tarjeta Holográfica Derecha: Mars (Marte)
  // =========================================================================
  private createRightMarsCard() {
    const plane = BABYLON.MeshBuilder.CreatePlane('xrMarsCardPlane', {
      width: 2.7,
      height: 3.5
    }, this.scene);
    plane.parent = this.rootNode;
    plane.position = new BABYLON.Vector3(4.8, 0.65, 0.8);
    plane.rotation.y = -0.38; // Inclinación suave hacia el usuario

    const adt = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 810, 1050, false);
    this.dynamicTextures.push(adt);
    this.meshes.push(plane);

    const card = new GUI.Rectangle('marsCard');
    card.width = '790px';
    card.height = '1030px';
    card.cornerRadius = 24;
    card.color = 'rgba(249, 115, 22, 0.4)';
    card.thickness = 1.5;
    card.background = 'rgba(18, 12, 16, 0.88)';
    adt.addControl(card);

    const stack = new GUI.StackPanel();
    stack.isVertical = true;
    stack.paddingTop = '24px';
    stack.paddingLeft = '30px';
    stack.paddingRight = '30px';
    card.addControl(stack);

    // Header
    const header = new GUI.StackPanel();
    header.isVertical = false;
    header.height = '48px';

    const iconBox = new GUI.Rectangle();
    iconBox.width = '38px';
    iconBox.height = '38px';
    iconBox.cornerRadius = 19;
    iconBox.background = 'rgba(249, 115, 22, 0.25)';
    iconBox.color = '#f97316';
    iconBox.thickness = 1;
    const iconTxt = new GUI.TextBlock();
    iconTxt.text = '🔴';
    iconTxt.fontSize = 20;
    iconBox.addControl(iconTxt);
    header.addControl(iconBox);

    const titleStack = new GUI.StackPanel();
    titleStack.isVertical = true;
    titleStack.paddingLeft = '14px';
    const t1 = new GUI.TextBlock();
    t1.text = 'Mars';
    t1.color = '#ffffff';
    t1.fontSize = 22;
    t1.fontWeight = 'bold';
    t1.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    t1.height = '28px';
    titleStack.addControl(t1);

    const t2 = new GUI.TextBlock();
    t2.text = 'The Red Planet';
    t2.color = '#fb923c';
    t2.fontSize = 13;
    t2.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    t2.height = '18px';
    titleStack.addControl(t2);
    header.addControl(titleStack);
    stack.addControl(header);

    // Imagen / Preview visual de Marte
    const previewContainer = new GUI.Rectangle();
    previewContainer.width = '240px';
    previewContainer.height = '240px';
    previewContainer.cornerRadius = 120;
    previewContainer.color = 'rgba(249, 115, 22, 0.4)';
    previewContainer.thickness = 2;
    previewContainer.paddingTop = '20px';
    previewContainer.background = '#150c0c';

    const marsImg = new GUI.Image('marsImg', './textures/mars.jpg');
    marsImg.width = '236px';
    marsImg.height = '236px';
    previewContainer.addControl(marsImg);
    stack.addControl(previewContainer);

    // Pestañas
    const tabsRow = new GUI.StackPanel();
    tabsRow.isVertical = false;
    tabsRow.height = '36px';
    tabsRow.paddingTop = '20px';
    ['Overview', 'Terrain', 'Geology', 'Data'].forEach((t, i) => {
      const b = GUI.Button.CreateSimpleButton(`marTab_${t}`, t);
      b.width = '175px';
      b.height = '30px';
      b.fontSize = 14;
      b.cornerRadius = 15;
      b.color = i === 0 ? '#f97316' : '#64748b';
      b.background = i === 0 ? 'rgba(249, 115, 22, 0.18)' : 'transparent';
      b.thickness = 0;
      tabsRow.addControl(b);
    });
    stack.addControl(tabsRow);

    // Lista de métricas científicas
    const metricsStack = new GUI.StackPanel();
    metricsStack.isVertical = true;
    metricsStack.paddingTop = '18px';

    const addMetricRow = (label: string, value: string) => {
      const row = new GUI.StackPanel();
      row.isVertical = false;
      row.height = '36px';
      const l = new GUI.TextBlock();
      l.text = label;
      l.color = '#94a3b8';
      l.fontSize = 15;
      l.width = '360px';
      l.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      row.addControl(l);

      const v = new GUI.TextBlock();
      v.text = value;
      v.color = '#f8fafc';
      v.fontSize = 15;
      v.fontWeight = 'bold';
      v.width = '360px';
      v.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
      row.addControl(v);

      metricsStack.addControl(row);
    };

    addMetricRow('Radius', '3,390 km');
    addMetricRow('Surface area', '144.8 million km²');
    addMetricRow('Gravity', '0.38 g (38% of Earth)');
    addMetricRow('Avg. temperature', '-125 to 20 °C');
    addMetricRow('Dominant terrain', 'Valles, craters, volcanoes');
    stack.addControl(metricsStack);

    // Botón de acción: Comparar con la Tierra
    const btnCompare = GUI.Button.CreateSimpleButton('btnMarsCompare', '∞ Compare with Earth');
    btnCompare.width = '720px';
    btnCompare.height = '54px';
    btnCompare.cornerRadius = 27;
    btnCompare.paddingTop = '24px';
    btnCompare.background = 'rgba(249, 115, 22, 0.2)';
    btnCompare.color = '#fb923c';
    btnCompare.fontSize = 16;
    btnCompare.fontWeight = 'bold';
    btnCompare.thickness = 1.5;
    btnCompare.onPointerClickObservable.add(() => {
      sound.playClick(750);
      if (this.callbacks.onCompareWithEarth) this.callbacks.onCompareWithEarth('Mars');
    });
    stack.addControl(btnCompare);
  }

  // =========================================================================
  // 5. Panel HUD de Cartografía Orbital sobre el Globo
  // =========================================================================
  private createCentralCartographyBadge() {
    const plane = BABYLON.MeshBuilder.CreatePlane('xrCartoBadgePlane', {
      width: 3.4,
      height: 0.95
    }, this.scene);
    plane.parent = this.rootNode;
    plane.position = new BABYLON.Vector3(0, 2.35, 0.4);

    const adt = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 1020, 285, false);
    this.dynamicTextures.push(adt);
    this.meshes.push(plane);

    const badge = new GUI.Rectangle('cartoBadge');
    badge.width = '1000px';
    badge.height = '265px';
    badge.cornerRadius = 20;
    badge.color = 'rgba(34, 211, 238, 0.4)';
    badge.thickness = 1.5;
    badge.background = 'rgba(7, 13, 26, 0.85)';
    adt.addControl(badge);

    const stack = new GUI.StackPanel();
    stack.isVertical = true;
    stack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    badge.addControl(stack);

    const title = new GUI.TextBlock();
    title.text = 'EARTH • CARTOGRAPHY (NASA / USGS / WGS84)';
    title.color = '#38bdf8';
    title.fontSize = 20;
    title.fontWeight = 'bold';
    title.height = '32px';
    this.cartographyTitleBlock = title;
    stack.addControl(title);

    const subtitle = new GUI.TextBlock();
    subtitle.text = 'Global terrain, elevation and exploration layers (30 m / 5 m LiDAR)';
    subtitle.color = '#94a3b8';
    subtitle.fontSize = 14;
    subtitle.height = '24px';
    stack.addControl(subtitle);

    const btnsRow = new GUI.StackPanel();
    btnsRow.isVertical = false;
    btnsRow.height = '50px';
    btnsRow.paddingTop = '12px';
    btnsRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;

    const createLayerBtn = (mode: PlanetaryLayerMode, label: string) => {
      const b = GUI.Button.CreateSimpleButton(`layerBtn_${mode}`, label);
      b.width = '240px';
      b.height = '42px';
      b.cornerRadius = 21;
      b.fontSize = 15;
      b.fontWeight = 'bold';
      b.thickness = 1.5;
      b.background = mode === this.activeLayerMode ? 'rgba(34, 211, 238, 0.35)' : 'rgba(15, 23, 42, 0.6)';
      b.color = mode === this.activeLayerMode ? '#ffffff' : '#94a3b8';

      b.onPointerClickObservable.add(() => {
        sound.playClick(650);
        this.setActiveLayerMode(mode);
        this.callbacks.onLayerModeSwitch(mode);
      });

      this.layerButtons[mode] = b;
      btnsRow.addControl(b);
    };

    createLayerBtn('surface', '🌐 Surface');
    createLayerBtn('topography', '🏔️ Topography');
    createLayerBtn('exploration', '📍 Exploration');

    stack.addControl(btnsRow);
  }

  // =========================================================================
  // 6. Barra de Herramientas de Cámara (Izquierda del Globo)
  // =========================================================================
  private createCameraTools() {
    const plane = BABYLON.MeshBuilder.CreatePlane('xrCameraToolsPlane', {
      width: 0.75,
      height: 2.5
    }, this.scene);
    plane.parent = this.rootNode;
    plane.position = new BABYLON.Vector3(-2.3, 0.5, 0.6);

    const adt = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 225, 750, false);
    this.dynamicTextures.push(adt);
    this.meshes.push(plane);

    const panel = new GUI.Rectangle();
    panel.width = '210px';
    panel.height = '730px';
    panel.cornerRadius = 24;
    panel.background = 'rgba(7, 13, 26, 0.85)';
    panel.color = 'rgba(34, 211, 238, 0.3)';
    panel.thickness = 1.5;
    adt.addControl(panel);

    const stack = new GUI.StackPanel();
    stack.isVertical = true;
    stack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    panel.addControl(stack);

    const addToolBtn = (label: string, icon: string, action: 'orbit' | 'move' | 'zoomIn' | 'zoomOut' | 'fit') => {
      const b = GUI.Button.CreateSimpleButton(`btnTool_${action}`, `${icon}\n${label}`);
      b.width = '170px';
      b.height = '120px';
      b.cornerRadius = 18;
      b.color = '#38bdf8';
      b.fontSize = 14;
      b.fontWeight = 'bold';
      b.background = 'rgba(15, 23, 42, 0.6)';
      b.thickness = 1;
      b.paddingTop = '8px';
      b.paddingBottom = '8px';
      b.onPointerClickObservable.add(() => {
        sound.playClick(600);
        this.callbacks.onCameraTool(action);
      });
      stack.addControl(b);
    };

    addToolBtn('Orbit', '⤾', 'orbit');
    addToolBtn('Move', '✥', 'move');
    addToolBtn('Zoom +', '➕', 'zoomIn');
    addToolBtn('Zoom -', '➖', 'zoomOut');
    addToolBtn('Fit', '⛶', 'fit');
  }

  // =========================================================================
  // 7. Consola Inferior de Análisis de Análogos y 3D DEM (Mesa Holográfica)
  // =========================================================================
  private createBottomConsole() {
    const plane = BABYLON.MeshBuilder.CreatePlane('xrBottomConsolePlane', {
      width: 6.6,
      height: 2.5
    }, this.scene);
    plane.parent = this.rootNode;
    plane.position = new BABYLON.Vector3(0, -1.8, 1.4);
    plane.rotation.x = -0.42; // Inclinación ergonómica hacia arriba (tipo pupitre holográfico)

    const adt = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 2112, 800, false);
    this.dynamicTextures.push(adt);
    this.meshes.push(plane);

    const consoleBox = new GUI.Rectangle('bottomConsoleBox');
    consoleBox.width = '2080px';
    consoleBox.height = '770px';
    consoleBox.cornerRadius = 24;
    consoleBox.color = 'rgba(34, 211, 238, 0.45)';
    consoleBox.thickness = 1.5;
    consoleBox.background = 'rgba(6, 12, 24, 0.92)';
    adt.addControl(consoleBox);

    const mainStack = new GUI.StackPanel();
    mainStack.isVertical = true;
    mainStack.paddingTop = '18px';
    mainStack.paddingLeft = '30px';
    mainStack.paddingRight = '30px';
    consoleBox.addControl(mainStack);

    // Barra de Título de la Consola
    const topBar = new GUI.StackPanel();
    topBar.isVertical = false;
    topBar.height = '48px';

    const pinIcon = new GUI.TextBlock();
    pinIcon.text = '📍';
    pinIcon.fontSize = 24;
    pinIcon.width = '36px';
    topBar.addControl(pinIcon);

    const titleStack = new GUI.StackPanel();
    titleStack.isVertical = true;
    titleStack.paddingLeft = '10px';
    const cTitle = new GUI.TextBlock();
    cTitle.text = 'Analog Site Analysis';
    cTitle.color = '#38bdf8';
    cTitle.fontSize = 20;
    cTitle.fontWeight = 'bold';
    cTitle.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    cTitle.height = '24px';
    titleStack.addControl(cTitle);

    const cSub = new GUI.TextBlock();
    cSub.text = 'Crater de Caldera Blanca (Lanzarote, España) • IGN PNOA-LiDAR 5m & NASA Trek';
    cSub.color = '#94a3b8';
    cSub.fontSize = 13;
    cSub.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    cSub.height = '18px';
    titleStack.addControl(cSub);
    topBar.addControl(titleStack);

    // Badges de la derecha en el header
    const actionsPanel = new GUI.StackPanel();
    actionsPanel.isVertical = false;
    actionsPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;

    const bFit = GUI.Button.CreateSimpleButton('btnFitArea', '⛶ Fit to Area');
    bFit.width = '140px';
    bFit.height = '36px';
    bFit.fontSize = 13;
    bFit.cornerRadius = 18;
    bFit.color = '#38bdf8';
    bFit.background = 'rgba(14, 165, 233, 0.2)';
    bFit.thickness = 1;
    actionsPanel.addControl(bFit);

    const b3D = GUI.Button.CreateSimpleButton('btn3DMode', '🧊 3D (100 m)');
    b3D.width = '130px';
    b3D.height = '36px';
    b3D.fontSize = 13;
    b3D.cornerRadius = 18;
    b3D.color = '#10b981';
    b3D.background = 'rgba(16, 185, 129, 0.2)';
    b3D.thickness = 1;
    b3D.paddingLeft = '12px';
    actionsPanel.addControl(b3D);

    topBar.addControl(actionsPanel);
    mainStack.addControl(topBar);

    // CUERPO DIVIDIDO EN 2 SUB-VENTANAS (Mapa 2D radar a la izquierda + DEM 3D / Métricas a la derecha)
    const splitGrid = new GUI.Grid();
    splitGrid.height = '500px';
    splitGrid.addColumnDefinition(0.46); // Radar Map
    splitGrid.addColumnDefinition(0.54); // 3D DEM & Metrics
    splitGrid.paddingTop = '14px';
    mainStack.addControl(splitGrid);

    // Ventana Izquierda: 2D Radar Map Preview
    const leftSubWin = new GUI.Rectangle();
    leftSubWin.cornerRadius = 18;
    leftSubWin.background = '#0a101f';
    leftSubWin.color = 'rgba(34, 211, 238, 0.25)';
    leftSubWin.thickness = 1;
    leftSubWin.paddingRight = '12px';

    const mapStack = new GUI.StackPanel();
    mapStack.isVertical = true;
    mapStack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;

    const mapTitle = new GUI.TextBlock();
    mapTitle.text = 'Exploración Radar Satelital • Radio 100 m';
    mapTitle.color = '#38bdf8';
    mapTitle.fontSize = 15;
    mapTitle.fontWeight = 'bold';
    mapTitle.height = '26px';
    mapStack.addControl(mapTitle);

    const mapImgContainer = new GUI.Rectangle();
    mapImgContainer.width = '420px';
    mapImgContainer.height = '340px';
    mapImgContainer.cornerRadius = 14;
    mapImgContainer.color = '#0284c7';
    mapImgContainer.thickness = 1.5;
    mapImgContainer.background = '#050a14';

    const satImg = new GUI.Image('satMapImg', './output_3d/thematic_comparison_atlas.png');
    satImg.width = '414px';
    satImg.height = '334px';
    mapImgContainer.addControl(satImg);

    // Retículo radar cian sobre el mapa
    const radarOverlay = new GUI.Rectangle();
    radarOverlay.width = '120px';
    radarOverlay.height = '120px';
    radarOverlay.cornerRadius = 60;
    radarOverlay.color = '#22d3ee';
    radarOverlay.thickness = 2;
    radarOverlay.background = 'rgba(34, 211, 238, 0.12)';
    mapImgContainer.addControl(radarOverlay);

    mapStack.addControl(mapImgContainer);

    const coordsTag = new GUI.TextBlock();
    coordsTag.text = 'GPS Center: 29.03800° N, -13.71900° E • IGN MDT05';
    coordsTag.color = '#94a3b8';
    coordsTag.fontSize = 12;
    coordsTag.height = '22px';
    coordsTag.paddingTop = '8px';
    mapStack.addControl(coordsTag);

    leftSubWin.addControl(mapStack);
    splitGrid.addControl(leftSubWin, 0, 0);

    // Ventana Derecha: 3D DEM & Telemetría Científica
    const rightSubWin = new GUI.Rectangle();
    rightSubWin.cornerRadius = 18;
    rightSubWin.background = '#091022';
    rightSubWin.color = 'rgba(34, 211, 238, 0.25)';
    rightSubWin.thickness = 1;
    rightSubWin.paddingLeft = '12px';

    const demStack = new GUI.StackPanel();
    demStack.isVertical = true;
    demStack.paddingLeft = '24px';
    demStack.paddingRight = '24px';
    demStack.paddingTop = '16px';

    const demHeader = new GUI.TextBlock();
    demHeader.text = '3D DEM (IGN PNOA-LiDAR) • Perfil Geomorfológico';
    demHeader.color = '#38bdf8';
    demHeader.fontSize = 15;
    demHeader.fontWeight = 'bold';
    demHeader.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    demHeader.height = '24px';
    demStack.addControl(demHeader);

    // Banner de Similitud Científica
    const scoreBanner = new GUI.Rectangle();
    scoreBanner.width = '980px';
    scoreBanner.height = '74px';
    scoreBanner.cornerRadius = 14;
    scoreBanner.background = 'rgba(14, 165, 233, 0.15)';
    scoreBanner.color = '#0284c7';
    scoreBanner.thickness = 1.5;
    scoreBanner.paddingTop = '8px';

    const scoreGrid = new GUI.Grid();
    scoreGrid.addColumnDefinition(0.5);
    scoreGrid.addColumnDefinition(0.5);
    scoreBanner.addControl(scoreGrid);

    const sLabel = new GUI.TextBlock();
    sLabel.text = 'Similitud vs Luna / Marte';
    sLabel.color = '#94a3b8';
    sLabel.fontSize = 15;
    sLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    sLabel.paddingLeft = '20px';
    scoreGrid.addControl(sLabel, 0, 0);

    const sVal = new GUI.TextBlock();
    sVal.text = '68.5%';
    sVal.color = '#34d399';
    sVal.fontSize = 28;
    sVal.fontWeight = 'bold';
    sVal.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    sVal.paddingRight = '20px';
    scoreGrid.addControl(sVal, 0, 1);
    demStack.addControl(scoreBanner);

    // Tabla de Parámetros Científicos
    const paramsStack = new GUI.StackPanel();
    paramsStack.isVertical = true;
    paramsStack.paddingTop = '14px';

    const addDemMetric = (label: string, val: string, color = '#f8fafc') => {
      const row = new GUI.StackPanel();
      row.isVertical = false;
      row.height = '34px';
      const l = new GUI.TextBlock();
      l.text = label;
      l.color = '#94a3b8';
      l.fontSize = 14;
      l.width = '480px';
      l.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      row.addControl(l);

      const v = new GUI.TextBlock();
      v.text = val;
      v.color = color;
      v.fontSize = 14;
      v.fontWeight = 'bold';
      v.width = '480px';
      v.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
      row.addControl(v);
      paramsStack.addControl(row);
    };

    addDemMetric('Rango Altimétrico:', '261 m - 265 m');
    addDemMetric('Pendiente Media (Horn):', '1.3°');
    addDemMetric('Cavidades / Tubos de Lava:', 'IGN MDT05 (PNOA 5m)', '#38bdf8');
    addDemMetric('Correlación Pearson (r):', '0.999', '#34d399');
    addDemMetric('Rugosidad de Terreno (TRI):', '2.80 m');
    addDemMetric('Frecuencia de Muestreo:', '73 puntos en radio 100m');
    demStack.addControl(paramsStack);

    // Barra de comparación inferior
    const compStrip = new GUI.Rectangle();
    compStrip.width = '980px';
    compStrip.height = '62px';
    compStrip.cornerRadius = 12;
    compStrip.background = 'rgba(15, 23, 42, 0.7)';
    compStrip.color = 'rgba(255, 255, 255, 0.1)';
    compStrip.thickness = 1;
    compStrip.paddingTop = '16px';

    const stripText = new GUI.TextBlock();
    stripText.text = 'Área: Moon 0.27x | Mars 3.82x   •   Gravedad: Moon 0.166x | Mars 0.38x   •   Temp: -173 ~ 127 °C';
    stripText.color = '#94a3b8';
    stripText.fontSize = 12;
    compStrip.addControl(stripText);
    demStack.addControl(compStrip);

    rightSubWin.addControl(demStack);
    splitGrid.addControl(rightSubWin, 0, 1);
  }

  // =========================================================================
  // Métodos de Estado y Sincronización
  // =========================================================================
  public setActivePlanet(planet: CelestialBody) {
    this.activePlanet = planet;

    // Actualizar botones de selector planetario
    (['Earth', 'Mars', 'Moon'] as CelestialBody[]).forEach(body => {
      const btn = this.planetButtons[body];
      if (btn) {
        btn.background = body === planet ? 'rgba(14, 165, 233, 0.45)' : 'rgba(15, 23, 42, 0.6)';
        btn.color = body === planet ? '#ffffff' : '#94a3b8';
      }
    });

    // Actualizar título de cartografía central
    if (this.cartographyTitleBlock) {
      if (planet === 'Earth') {
        this.cartographyTitleBlock.text = 'EARTH • CARTOGRAPHY (NASA / USGS / WGS84)';
        this.cartographyTitleBlock.color = '#38bdf8';
      } else if (planet === 'Mars') {
        this.cartographyTitleBlock.text = 'MARS • CARTOGRAPHY (NASA Mars Trek • Viking & MOLA)';
        this.cartographyTitleBlock.color = '#f97316';
      } else if (planet === 'Moon') {
        this.cartographyTitleBlock.text = 'MOON • CARTOGRAPHY (NASA Moon Trek • LRO WAC & LOLA)';
        this.cartographyTitleBlock.color = '#cbd5e1';
      }
    }
  }

  public setActiveLayerMode(mode: PlanetaryLayerMode) {
    this.activeLayerMode = mode;
    (['surface', 'topography', 'exploration'] as PlanetaryLayerMode[]).forEach(m => {
      const btn = this.layerButtons[m];
      if (btn) {
        btn.background = m === mode ? 'rgba(34, 211, 238, 0.35)' : 'rgba(15, 23, 42, 0.6)';
        btn.color = m === mode ? '#ffffff' : '#94a3b8';
      }
    });
  }

  public setVisible(visible: boolean) {
    this.rootNode.setEnabled(visible);
  }

  public isVisible(): boolean {
    return this.rootNode.isEnabled();
  }

  public dispose() {
    this.dynamicTextures.forEach(dt => dt.dispose());
    this.dynamicTextures = [];
    this.meshes.forEach(m => m.dispose());
    this.meshes = [];
    this.rootNode.dispose();
  }
}

