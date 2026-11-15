import * as BABYLON from 'babylonjs';
import * as GUI from 'babylonjs-gui';
import { CelestialBody, PlanetaryLayerMode, AnalogSite } from '../types';
import { sound } from '../audio';
import { ANALOG_DATABASE } from '../data/analogs';

export interface XRSpatialUICallbacks {
  onPlanetSwitch: (planet: CelestialBody) => void;
  onLayerModeSwitch: (mode: PlanetaryLayerMode) => void;
  onCameraTool: (action: 'orbit' | 'move' | 'zoomIn' | 'zoomOut' | 'fit') => void;
  onCompareWithEarth?: (target: 'Moon' | 'Mars') => void;
  onAnalogSiteSelect?: (site: AnalogSite) => void;
}

/**
 * Gestor del Entorno Holográfico Espacial 3D (WebXR) para Babylon.js
 * =================================================================
 * Réplica 1:1 de la sala de mando holográfica espacial (NASA Space Apps Challenge 2026):
 * - Centro Diáfano y Profundo: La Tierra flota a 3.4 m en el centro, flanqueada por las mini-esferas 3D de la Luna y Marte con órbitas luminosas.
 * - Pedestal holográfico concéntrico bajo la Tierra y píldora de telemetría geodésica WGS84.
 * - Selector planetario [Moon] [Earth] [Mars] y Badge de Cartografía NASA/USGS flotando sobre el planeta.
 * - Tarjeta Lateral Izquierda: Tarjeta holográfica compacta de la Luna (viewport circular, pestañas, métricas y botón de comparación).
 * - Barra vertical de herramientas de cámara (Orbit, Move, Zoom+, Zoom-, Fit) junto a la Luna.
 * - Tarjeta Lateral Derecha: Tarjeta holográfica de Marte en tonos cobre/naranja.
 * - Mesa de Control Inferior:
 *   * Parte superior: "Analog Site Analysis" (Caldera Blanca) con mapa satelital 2D y modelo 3D DEM altimétrico con estadísticas.
 *   * Parte inferior: "Terrain Comparison" con métricas multivariables y botón Full Comparison.
 * - Barra Superior: IEF Comparaison con pestañas Explore, Compare, Terrain, Data, Missions y buscador.
 * - Seguimiento ergonómico a la cámara exclusivamente en POSICIÓN, con rotación FIJA a nivel ABSOLUTO.
 */
export class XRSpatialUIManager {
  private scene: BABYLON.Scene;
  private callbacks: XRSpatialUICallbacks;
  private rootNode: BABYLON.TransformNode;
  private pedestalRootNode: BABYLON.TransformNode;
  private meshes: BABYLON.Mesh[] = [];
  private dynamicTextures: (GUI.AdvancedDynamicTexture | BABYLON.DynamicTexture)[] = [];

  // Estado activo
  private activePlanet: CelestialBody = 'Earth';
  private activeLayerMode: PlanetaryLayerMode = 'surface';
  private isXRMode = false;

  // Catálogo de análogos candidatos
  private moonCandidates: AnalogSite[] = [];
  private marsCandidates: AnalogSite[] = [];
  private selectedMoonSite: AnalogSite;
  private selectedMarsSite: AnalogSite;

  // Rotaciones de los modelos 3D DEM interactivos
  private dem3DAngle = 0.55;

  // Referencias a elementos para actualización dinámica
  private planetButtons: { [key in CelestialBody]?: GUI.Button } = {};
  private layerButtons: { [key in PlanetaryLayerMode]?: GUI.Button } = {};
  private pedestalReticleMesh: BABYLON.Mesh | null = null;

  // Texturas dinámicas
  private desk3DDynamicTex: BABYLON.DynamicTexture | null = null;
  private deskTelemetryBlocks: { [key: string]: GUI.TextBlock } = {};
  private telemetryCoordsBlock: GUI.TextBlock | null = null;

  constructor(scene: BABYLON.Scene, callbacks: XRSpatialUICallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.rootNode = new BABYLON.TransformNode('xrSpatialUIRoot', this.scene);
    this.pedestalRootNode = new BABYLON.TransformNode('xrPedestalRootNode', this.scene);

    // Cargar y filtrar los análogos de la base de datos
    this.moonCandidates = ANALOG_DATABASE.filter(s => s.target_body === 'Moon');
    this.marsCandidates = ANALOG_DATABASE.filter(s => s.target_body === 'Mars');

    // Por defecto seleccionar candidatos representativos
    this.selectedMoonSite = this.moonCandidates.find(s => s.id.includes('CALDERA_BLANCA')) || this.moonCandidates[0] || ANALOG_DATABASE[0];
    this.selectedMarsSite = this.marsCandidates[0] || ANALOG_DATABASE[10] || ANALOG_DATABASE[0];
  }

  /**
   * Construye el entorno holográfico completo coincidiendo exactamente con la imagen de referencia
   */
  public buildSpatialInterface() {
    this.createHolographicPedestal();
    this.createTopNavigationBar();
    this.createCentralPlanetarySelector();
    this.createCentralCartographyBadge();
    this.createCentralTelemetryPill();
    this.createLeftMoonCard();
    this.createCameraToolsToolbar();
    this.createRightMarsCard();
    this.createBottomConsoleDesk();
  }

  // =========================================================================
  // 1. Pedestal Holográfico en la Base de la Tierra
  // =========================================================================
  private createHolographicPedestal() {
    const pedestalRoot = new BABYLON.TransformNode('xrPedestalRoot', this.scene);
    pedestalRoot.parent = this.pedestalRootNode;
    pedestalRoot.position = new BABYLON.Vector3(0, -1.25, 0);

    // Anillo exterior brillante cian
    const outerRing = BABYLON.MeshBuilder.CreateTorus('xrOuterRing', {
      diameter: 3.4,
      thickness: 0.035,
      tessellation: 64
    }, this.scene);
    outerRing.parent = pedestalRoot;
    const ringMat1 = new BABYLON.StandardMaterial('xrRingMat1', this.scene);
    ringMat1.emissiveColor = new BABYLON.Color3(0.08, 0.85, 0.98);
    ringMat1.diffuseColor = new BABYLON.Color3(0.08, 0.85, 0.98);
    ringMat1.alpha = 0.85;
    ringMat1.disableLighting = true;
    outerRing.material = ringMat1;
    this.meshes.push(outerRing);

    // Anillo interior azul profundo
    const innerRing = BABYLON.MeshBuilder.CreateTorus('xrInnerRing', {
      diameter: 2.8,
      thickness: 0.025,
      tessellation: 64
    }, this.scene);
    innerRing.parent = pedestalRoot;
    innerRing.position.y = -0.04;
    const ringMat2 = new BABYLON.StandardMaterial('xrRingMat2', this.scene);
    ringMat2.emissiveColor = new BABYLON.Color3(0.02, 0.55, 0.85);
    ringMat2.alpha = 0.65;
    ringMat2.disableLighting = true;
    innerRing.material = ringMat2;
    this.meshes.push(innerRing);

    // Disco reticular de telemetría geodésica
    const reticlePlane = BABYLON.MeshBuilder.CreateDisc('xrPedestalReticle', {
      radius: 1.8,
      tessellation: 64
    }, this.scene);
    reticlePlane.parent = pedestalRoot;
    reticlePlane.rotation.x = Math.PI / 2;
    reticlePlane.position.y = -0.02;

    const reticleTex = new BABYLON.DynamicTexture('xrReticleTex', { width: 1024, height: 1024 }, this.scene, true);
    this.dynamicTextures.push(reticleTex);
    reticleTex.hasAlpha = true;
    const ctx = reticleTex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 1024, 1024);

    ctx.strokeStyle = 'rgba(34, 211, 238, 0.4)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(512, 512, 480, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(34, 211, 238, 0.25)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(512, 512, 380, 0, Math.PI * 2);
    ctx.stroke();

    for (let deg = 0; deg < 360; deg += 15) {
      const rad = (deg * Math.PI) / 180;
      const r1 = deg % 45 === 0 ? 440 : 465;
      const r2 = 485;
      ctx.strokeStyle = deg % 45 === 0 ? 'rgba(34, 211, 238, 0.8)' : 'rgba(34, 211, 238, 0.35)';
      ctx.lineWidth = deg % 45 === 0 ? 2.5 : 1.2;
      ctx.beginPath();
      ctx.moveTo(512 + Math.cos(rad) * r1, 512 + Math.sin(rad) * r1);
      ctx.lineTo(512 + Math.cos(rad) * r2, 512 + Math.sin(rad) * r2);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(34, 211, 238, 0.9)';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('29.039° N, 13.716° W • WGS84 | TERRAIN-X HOLOGRAPHIC STAGE', 512, 930);
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
      width: 3.8,
      height: 0.52
    }, this.scene);
    plane.parent = this.rootNode;
    plane.position = new BABYLON.Vector3(0, 1.35, 2.7);
    plane.rotation.x = -0.12;
    plane.rotation.y = 0;

    const adt = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 2048, 280, false);
    this.dynamicTextures.push(adt);
    this.meshes.push(plane);
    (plane.material as BABYLON.StandardMaterial).backFaceCulling = false;
    (plane.material as BABYLON.StandardMaterial).disableLighting = true;

    const rootBox = new GUI.Rectangle('navBarRoot');
    rootBox.width = '2020px';
    rootBox.height = '260px';
    rootBox.cornerRadius = 28;
    rootBox.color = 'rgba(34, 211, 238, 0.45)';
    rootBox.thickness = 1.5;
    rootBox.background = 'rgba(7, 13, 26, 0.88)';
    adt.addControl(rootBox);

    const grid = new GUI.Grid();
    grid.addColumnDefinition(0.30); // Logo
    grid.addColumnDefinition(0.42); // Tabs
    grid.addColumnDefinition(0.28); // Search & User
    rootBox.addControl(grid);

    // 1. Logo
    const brandPanel = new GUI.StackPanel();
    brandPanel.isVertical = false;
    brandPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    brandPanel.paddingLeft = '30px';

    const logoBlock = new GUI.Rectangle();
    logoBlock.width = '64px';
    logoBlock.height = '64px';
    logoBlock.cornerRadius = 32;
    logoBlock.background = '#0284c7';
    logoBlock.color = '#38bdf8';
    logoBlock.thickness = 2;

    const logoImg = new GUI.Image('logoImg', './ief_comparation_logo.jpg');
    logoImg.width = '60px';
    logoImg.height = '60px';
    logoBlock.addControl(logoImg);
    brandPanel.addControl(logoBlock);

    const titlePanel = new GUI.StackPanel();
    titlePanel.isVertical = true;
    titlePanel.paddingLeft = '18px';
    titlePanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;

    const titleText = new GUI.TextBlock();
    titleText.text = 'IEF Comparaison';
    titleText.color = '#ffffff';
    titleText.fontSize = 32;
    titleText.fontWeight = 'bold';
    titleText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.height = '40px';
    titlePanel.addControl(titleText);

    const subText = new GUI.TextBlock();
    subText.text = 'NASA SPACE APPS 2026';
    subText.color = '#38bdf8';
    subText.fontSize = 18;
    subText.fontWeight = 'bold';
    subText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    subText.height = '24px';
    titlePanel.addControl(subText);

    brandPanel.addControl(titlePanel);
    grid.addControl(brandPanel, 0, 0);

    // 2. Navigation Tabs
    const tabsRow = new GUI.StackPanel();
    tabsRow.isVertical = false;
    tabsRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;

    ['Explore', 'Compare', 'Terrain', 'Data', 'Missions'].forEach((name, idx) => {
      const b = GUI.Button.CreateSimpleButton(`topTab_${name}`, name);
      b.width = '130px';
      b.height = '48px';
      b.cornerRadius = 24;
      b.fontSize = 20;
      b.fontWeight = 'bold';
      b.color = idx === 0 ? '#38bdf8' : '#94a3b8';
      b.background = idx === 0 ? 'rgba(56, 189, 248, 0.22)' : 'transparent';
      b.thickness = idx === 0 ? 1.5 : 0;
      b.paddingLeft = '6px';
      b.paddingRight = '6px';
      b.onPointerClickObservable.add(() => sound.playClick(650));
      tabsRow.addControl(b);
    });

    grid.addControl(tabsRow, 0, 1);

    // 3. Search & User Avatar
    const userPanel = new GUI.StackPanel();
    userPanel.isVertical = false;
    userPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    userPanel.paddingRight = '30px';

    const searchPill = new GUI.Rectangle();
    searchPill.width = '360px';
    searchPill.height = '48px';
    searchPill.cornerRadius = 24;
    searchPill.background = 'rgba(15, 23, 42, 0.7)';
    searchPill.color = 'rgba(255, 255, 255, 0.15)';
    searchPill.thickness = 1;

    const sTxt = new GUI.TextBlock();
    sTxt.text = '🔍 Search a location, crater...';
    sTxt.color = '#94a3b8';
    sTxt.fontSize = 18;
    sTxt.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    sTxt.paddingLeft = '18px';
    searchPill.addControl(sTxt);
    userPanel.addControl(searchPill);

    const userAvatar = new GUI.Rectangle();
    userAvatar.width = '48px';
    userAvatar.height = '48px';
    userAvatar.cornerRadius = 24;
    userAvatar.background = '#0284c7';
    userAvatar.color = '#38bdf8';
    userAvatar.thickness = 1.5;
    userAvatar.paddingLeft = '12px';

    const uTxt = new GUI.TextBlock();
    uTxt.text = 'EM';
    uTxt.color = '#ffffff';
    uTxt.fontSize = 18;
    uTxt.fontWeight = 'bold';
    userAvatar.addControl(uTxt);
    userPanel.addControl(userAvatar);

    grid.addControl(userPanel, 0, 2);
  }

  // =========================================================================
  // 4. Selector Planetario Central [Moon] [Earth] [Mars]
  // =========================================================================
  private createCentralPlanetarySelector() {
    const plane = BABYLON.MeshBuilder.CreatePlane('xrPlanetarySelectorPlane', {
      width: 1.25,
      height: 0.32
    }, this.scene);
    plane.parent = this.rootNode;
    plane.position = new BABYLON.Vector3(0, 1.05, 2.85);
    plane.rotation.x = -0.10;
    plane.rotation.y = 0;

    const adt = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 1250, 320, false);
    this.dynamicTextures.push(adt);
    this.meshes.push(plane);
    (plane.material as BABYLON.StandardMaterial).backFaceCulling = false;
    (plane.material as BABYLON.StandardMaterial).disableLighting = true;

    const rootBox = new GUI.Rectangle('planetSelectorBox');
    rootBox.width = '1200px';
    rootBox.height = '280px';
    rootBox.cornerRadius = 32;
    rootBox.color = 'rgba(34, 211, 238, 0.4)';
    rootBox.thickness = 1.5;
    rootBox.background = 'rgba(7, 13, 26, 0.9)';
    adt.addControl(rootBox);

    const stack = new GUI.StackPanel();
    stack.isVertical = false;
    stack.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    rootBox.addControl(stack);

    const createPlanetBtn = (body: CelestialBody, label: string) => {
      const btn = GUI.Button.CreateSimpleButton(`btnPlanet_${body}`, label);
      btn.width = '350px';
      btn.height = '180px';
      btn.fontSize = 32;
      btn.fontWeight = 'bold';
      btn.cornerRadius = 28;
      btn.thickness = 2;
      btn.background = body === this.activePlanet ? 'rgba(14, 165, 233, 0.5)' : 'rgba(15, 23, 42, 0.65)';
      btn.color = body === this.activePlanet ? '#ffffff' : '#94a3b8';
      btn.paddingLeft = '12px';
      btn.paddingRight = '12px';

      btn.onPointerClickObservable.add(() => {
        sound.playClick(body === 'Earth' ? 600 : (body === 'Mars' ? 750 : 500));
        this.setActivePlanet(body);
        this.callbacks.onPlanetSwitch(body);
      });

      this.planetButtons[body] = btn;
      stack.addControl(btn);
    };

    createPlanetBtn('Moon', '⚪ Moon');
    createPlanetBtn('Earth', '🔵 Earth');
    createPlanetBtn('Mars', '🟠 Mars');
  }

  // =========================================================================
  // 5. Badge de Cartografía Orbital NASA / USGS sobre la Tierra
  // =========================================================================
  private createCentralCartographyBadge() {
    const plane = BABYLON.MeshBuilder.CreatePlane('xrCartoBadgePlane', {
      width: 1.65,
      height: 0.55
    }, this.scene);
    plane.parent = this.rootNode;
    plane.position = new BABYLON.Vector3(0.75, 0.92, 2.85);
    plane.rotation.x = -0.10;
    plane.rotation.y = -0.12;

    const adt = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 1650, 550, false);
    this.dynamicTextures.push(adt);
    this.meshes.push(plane);
    (plane.material as BABYLON.StandardMaterial).backFaceCulling = false;
    (plane.material as BABYLON.StandardMaterial).disableLighting = true;

    const badge = new GUI.Rectangle('cartoBadge');
    badge.width = '1600px';
    badge.height = '510px';
    badge.cornerRadius = 24;
    badge.color = 'rgba(34, 211, 238, 0.45)';
    badge.thickness = 1.5;
    badge.background = 'rgba(7, 13, 26, 0.88)';
    adt.addControl(badge);

    const stack = new GUI.StackPanel();
    stack.isVertical = true;
    stack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    badge.addControl(stack);

    const title = new GUI.TextBlock();
    title.text = 'EARTH • CARTOGRAPHY (NASA/USGS)';
    title.color = '#38bdf8';
    title.fontSize = 28;
    title.fontWeight = 'bold';
    title.height = '42px';
    stack.addControl(title);

    const btnsRow = new GUI.StackPanel();
    btnsRow.isVertical = false;
    btnsRow.height = '64px';
    btnsRow.paddingTop = '10px';
    btnsRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;

    const createLayerBtn = (mode: PlanetaryLayerMode, label: string) => {
      const b = GUI.Button.CreateSimpleButton(`layerBtn_${mode}`, label);
      b.width = '240px';
      b.height = '50px';
      b.cornerRadius = 25;
      b.fontSize = 20;
      b.fontWeight = 'bold';
      b.thickness = 1.5;
      b.background = mode === this.activeLayerMode ? 'rgba(34, 211, 238, 0.4)' : 'rgba(15, 23, 42, 0.65)';
      b.color = mode === this.activeLayerMode ? '#ffffff' : '#94a3b8';
      b.paddingLeft = '8px';
      b.paddingRight = '8px';

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

    const subtitle = new GUI.TextBlock();
    subtitle.text = 'Global terrain, elevation and exploration layers (30 m)';
    subtitle.color = '#94a3b8';
    subtitle.fontSize = 18;
    subtitle.height = '32px';
    subtitle.paddingTop = '8px';
    stack.addControl(subtitle);
  }

  // =========================================================================
  // 6. Píldora de Telemetría Geodésica bajo la Tierra
  // =========================================================================
  private createCentralTelemetryPill() {
    const plane = BABYLON.MeshBuilder.CreatePlane('xrTelemetryPillPlane', {
      width: 1.6,
      height: 0.28
    }, this.scene);
    plane.parent = this.rootNode;
    plane.position = new BABYLON.Vector3(0, -1.08, 3.0);
    plane.rotation.x = 0.15;
    plane.rotation.y = 0;

    const adt = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 1600, 280, false);
    this.dynamicTextures.push(adt);
    this.meshes.push(plane);
    (plane.material as BABYLON.StandardMaterial).backFaceCulling = false;
    (plane.material as BABYLON.StandardMaterial).disableLighting = true;

    const pill = new GUI.Rectangle('telemetryPill');
    pill.width = '1560px';
    pill.height = '240px';
    pill.cornerRadius = 30;
    pill.background = 'rgba(7, 13, 26, 0.85)';
    pill.color = 'rgba(34, 211, 238, 0.4)';
    pill.thickness = 1.5;
    adt.addControl(pill);

    const txt = new GUI.TextBlock();
    txt.text = '⊙ 29.0393° N, 13.7165° W • WGS84   |   5,000 km';
    txt.color = '#38bdf8';
    txt.fontSize = 28;
    txt.fontWeight = 'bold';
    pill.addControl(txt);
    this.telemetryCoordsBlock = txt;
  }

  // =========================================================================
  // 7. Tarjeta Holográfica Izquierda: Moon (Luna)
  // =========================================================================
  private createLeftMoonCard() {
    const plane = BABYLON.MeshBuilder.CreatePlane('xrMoonCardPlane', {
      width: 1.55,
      height: 2.15
    }, this.scene);
    plane.parent = this.rootNode;
    plane.position = new BABYLON.Vector3(-2.55, 0.08, 2.55);
    plane.rotation.y = 0.32; // Inclinación suave hacia el centro (~18º)
    plane.rotation.x = -0.04;

    const adt = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 1550, 2150, false);
    this.dynamicTextures.push(adt);
    this.meshes.push(plane);
    (plane.material as BABYLON.StandardMaterial).backFaceCulling = false;
    (plane.material as BABYLON.StandardMaterial).disableLighting = true;

    const card = new GUI.Rectangle('moonCard');
    card.width = '1510px';
    card.height = '2100px';
    card.cornerRadius = 28;
    card.color = 'rgba(203, 213, 225, 0.45)';
    card.thickness = 2;
    card.background = 'rgba(10, 18, 32, 0.88)';
    adt.addControl(card);

    const stack = new GUI.StackPanel();
    stack.isVertical = true;
    stack.paddingTop = '28px';
    stack.paddingLeft = '35px';
    stack.paddingRight = '35px';
    card.addControl(stack);

    // Header
    const header = new GUI.StackPanel();
    header.isVertical = false;
    header.height = '72px';

    const iconBox = new GUI.Rectangle();
    iconBox.width = '56px';
    iconBox.height = '56px';
    iconBox.cornerRadius = 28;
    iconBox.background = 'rgba(203, 213, 225, 0.2)';
    iconBox.color = '#cbd5e1';
    iconBox.thickness = 1.5;
    const iconTxt = new GUI.TextBlock();
    iconTxt.text = '🌙';
    iconTxt.fontSize = 28;
    iconBox.addControl(iconTxt);
    header.addControl(iconBox);

    const titleStack = new GUI.StackPanel();
    titleStack.isVertical = true;
    titleStack.paddingLeft = '18px';
    titleStack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;

    const t1 = new GUI.TextBlock();
    t1.text = 'Moon';
    t1.color = '#ffffff';
    t1.fontSize = 32;
    t1.fontWeight = 'bold';
    t1.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    t1.height = '40px';
    titleStack.addControl(t1);

    const t2 = new GUI.TextBlock();
    t2.text = "Earth's natural satellite";
    t2.color = '#94a3b8';
    t2.fontSize = 18;
    t2.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    t2.height = '24px';
    titleStack.addControl(t2);
    header.addControl(titleStack);

    const moreBtn = new GUI.TextBlock();
    moreBtn.text = '•••';
    moreBtn.color = '#94a3b8';
    moreBtn.fontSize = 28;
    moreBtn.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    moreBtn.paddingRight = '10px';
    header.addControl(moreBtn);

    stack.addControl(header);

    // Viewport circular fotográfico de la Luna
    const previewContainer = new GUI.Rectangle();
    previewContainer.width = '420px';
    previewContainer.height = '420px';
    previewContainer.cornerRadius = 210;
    previewContainer.color = 'rgba(203, 213, 225, 0.35)';
    previewContainer.thickness = 2.5;
    previewContainer.paddingTop = '18px';
    previewContainer.background = '#0a0f1d';

    const moonImg = new GUI.Image('moonImg', './textures/moon.jpg');
    moonImg.width = '415px';
    moonImg.height = '415px';
    previewContainer.addControl(moonImg);
    stack.addControl(previewContainer);

    // Dots indicadores
    const dotsRow = new GUI.StackPanel();
    dotsRow.isVertical = false;
    dotsRow.height = '28px';
    dotsRow.paddingTop = '12px';
    dotsRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;

    [0, 1, 2].forEach(i => {
      const dot = new GUI.Rectangle();
      dot.width = '12px';
      dot.height = '12px';
      dot.cornerRadius = 6;
      dot.background = i === 0 ? '#38bdf8' : 'rgba(255, 255, 255, 0.25)';
      dot.thickness = 0;
      dot.paddingLeft = '4px';
      dot.paddingRight = '4px';
      dotsRow.addControl(dot);
    });
    stack.addControl(dotsRow);

    // Subpestañas
    const tabsRow = new GUI.StackPanel();
    tabsRow.isVertical = false;
    tabsRow.height = '54px';
    tabsRow.paddingTop = '16px';

    ['Overview', 'Terrain', 'Geology', 'Data'].forEach((t, i) => {
      const b = GUI.Button.CreateSimpleButton(`mTab_${t}`, t);
      b.width = '350px';
      b.height = '44px';
      b.fontSize = 20;
      b.fontWeight = 'bold';
      b.cornerRadius = 22;
      b.color = i === 0 ? '#38bdf8' : '#64748b';
      b.background = i === 0 ? 'rgba(56, 189, 248, 0.18)' : 'transparent';
      b.thickness = i === 0 ? 1.5 : 0;
      b.paddingLeft = '6px';
      b.paddingRight = '6px';
      tabsRow.addControl(b);
    });
    stack.addControl(tabsRow);

    // Lista de métricas científicas
    const metricsStack = new GUI.StackPanel();
    metricsStack.isVertical = true;
    metricsStack.paddingTop = '20px';

    const addMetricRow = (icon: string, label: string, value: string) => {
      const row = new GUI.StackPanel();
      row.isVertical = false;
      row.height = '50px';

      const ic = new GUI.TextBlock();
      ic.text = icon;
      ic.fontSize = 22;
      ic.width = '42px';
      row.addControl(ic);

      const l = new GUI.TextBlock();
      l.text = label;
      l.color = '#94a3b8';
      l.fontSize = 22;
      l.width = '640px';
      l.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      row.addControl(l);

      const v = new GUI.TextBlock();
      v.text = value;
      v.color = '#f8fafc';
      v.fontSize = 22;
      v.fontWeight = 'bold';
      v.width = '720px';
      v.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
      row.addControl(v);

      metricsStack.addControl(row);
    };

    addMetricRow('⏱️', 'Radius', '1,737 km');
    addMetricRow('🌐', 'Surface area', '37.9 million km²');
    addMetricRow('⬇️', 'Gravity', '0.165 g (16.5% of Earth)');
    addMetricRow('🌡️', 'Avg. temperature', '-173 to 127 °C');
    addMetricRow('🏔️', 'Dominant terrain', 'Craters, regolith, highlands');
    stack.addControl(metricsStack);

    // Botón Compare with Earth
    const btnCompare = GUI.Button.CreateSimpleButton('btnMoonCompare', '∞ Compare with Earth    ✓');
    btnCompare.width = '1440px';
    btnCompare.height = '72px';
    btnCompare.cornerRadius = 36;
    btnCompare.paddingTop = '24px';
    btnCompare.background = 'rgba(34, 211, 238, 0.18)';
    btnCompare.color = '#38bdf8';
    btnCompare.fontSize = 24;
    btnCompare.fontWeight = 'bold';
    btnCompare.thickness = 1.5;
    btnCompare.onPointerClickObservable.add(() => {
      sound.playClick(700);
      if (this.callbacks.onCompareWithEarth) this.callbacks.onCompareWithEarth('Moon');
    });
    stack.addControl(btnCompare);
  }

  // =========================================================================
  // 8. Barra de Herramientas de Cámara (Flotante entre Luna y Tierra)
  // =========================================================================
  private createCameraToolsToolbar() {
    const plane = BABYLON.MeshBuilder.CreatePlane('xrCameraToolsPlane', {
      width: 0.38,
      height: 1.45
    }, this.scene);
    plane.parent = this.rootNode;
    plane.position = new BABYLON.Vector3(-1.62, 0.08, 2.65);
    plane.rotation.y = 0.22;

    const adt = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 380, 1450, false);
    this.dynamicTextures.push(adt);
    this.meshes.push(plane);
    (plane.material as BABYLON.StandardMaterial).backFaceCulling = false;
    (plane.material as BABYLON.StandardMaterial).disableLighting = true;

    const panel = new GUI.Rectangle();
    panel.width = '350px';
    panel.height = '1410px';
    panel.cornerRadius = 24;
    panel.background = 'rgba(7, 13, 26, 0.88)';
    panel.color = 'rgba(34, 211, 238, 0.35)';
    panel.thickness = 1.5;
    adt.addControl(panel);

    const stack = new GUI.StackPanel();
    stack.isVertical = true;
    stack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    panel.addControl(stack);

    const addToolBtn = (label: string, icon: string, action: 'orbit' | 'move' | 'zoomIn' | 'zoomOut' | 'fit', isFirst = false) => {
      const b = GUI.Button.CreateSimpleButton(`btnTool_${action}`, `${icon}\n${label}`);
      b.width = '280px';
      b.height = '230px';
      b.cornerRadius = 22;
      b.color = '#38bdf8';
      b.fontSize = 24;
      b.fontWeight = 'bold';
      b.background = isFirst ? 'rgba(14, 165, 233, 0.35)' : 'rgba(15, 23, 42, 0.65)';
      b.thickness = isFirst ? 2 : 1;
      b.paddingTop = '12px';
      b.paddingBottom = '12px';
      b.onPointerClickObservable.add(() => {
        sound.playClick(600);
        this.callbacks.onCameraTool(action);
      });
      stack.addControl(b);
    };

    addToolBtn('Orbit', '⤾', 'orbit', true);
    addToolBtn('Move', '✥', 'move');
    addToolBtn('Zoom +', '➕', 'zoomIn');
    addToolBtn('Zoom -', '➖', 'zoomOut');
    addToolBtn('Fit', '⛶', 'fit');
  }

  // =========================================================================
  // 9. Tarjeta Holográfica Derecha: Mars (Marte)
  // =========================================================================
  private createRightMarsCard() {
    const plane = BABYLON.MeshBuilder.CreatePlane('xrMarsCardPlane', {
      width: 1.55,
      height: 2.15
    }, this.scene);
    plane.parent = this.rootNode;
    plane.position = new BABYLON.Vector3(2.55, 0.08, 2.55);
    plane.rotation.y = -0.32; // Inclinación suave hacia el centro (~-18º)
    plane.rotation.x = -0.04;

    const adt = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 1550, 2150, false);
    this.dynamicTextures.push(adt);
    this.meshes.push(plane);
    (plane.material as BABYLON.StandardMaterial).backFaceCulling = false;
    (plane.material as BABYLON.StandardMaterial).disableLighting = true;

    const card = new GUI.Rectangle('marsCard');
    card.width = '1510px';
    card.height = '2100px';
    card.cornerRadius = 28;
    card.color = 'rgba(249, 115, 22, 0.5)';
    card.thickness = 2;
    card.background = 'rgba(20, 12, 16, 0.88)';
    adt.addControl(card);

    const stack = new GUI.StackPanel();
    stack.isVertical = true;
    stack.paddingTop = '28px';
    stack.paddingLeft = '35px';
    stack.paddingRight = '35px';
    card.addControl(stack);

    // Header
    const header = new GUI.StackPanel();
    header.isVertical = false;
    header.height = '72px';

    const iconBox = new GUI.Rectangle();
    iconBox.width = '56px';
    iconBox.height = '56px';
    iconBox.cornerRadius = 28;
    iconBox.background = 'rgba(249, 115, 22, 0.25)';
    iconBox.color = '#f97316';
    iconBox.thickness = 1.5;
    const iconTxt = new GUI.TextBlock();
    iconTxt.text = '🟠';
    iconTxt.fontSize = 28;
    iconBox.addControl(iconTxt);
    header.addControl(iconBox);

    const titleStack = new GUI.StackPanel();
    titleStack.isVertical = true;
    titleStack.paddingLeft = '18px';
    titleStack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;

    const t1 = new GUI.TextBlock();
    t1.text = 'Mars';
    t1.color = '#ffffff';
    t1.fontSize = 32;
    t1.fontWeight = 'bold';
    t1.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    t1.height = '40px';
    titleStack.addControl(t1);

    const t2 = new GUI.TextBlock();
    t2.text = 'The Red Planet';
    t2.color = '#fb923c';
    t2.fontSize = 18;
    t2.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    t2.height = '24px';
    titleStack.addControl(t2);
    header.addControl(titleStack);

    const moreBtn = new GUI.TextBlock();
    moreBtn.text = '•••';
    moreBtn.color = '#fb923c';
    moreBtn.fontSize = 28;
    moreBtn.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    moreBtn.paddingRight = '10px';
    header.addControl(moreBtn);

    stack.addControl(header);

    // Viewport circular fotográfico de Marte
    const previewContainer = new GUI.Rectangle();
    previewContainer.width = '420px';
    previewContainer.height = '420px';
    previewContainer.cornerRadius = 210;
    previewContainer.color = 'rgba(249, 115, 22, 0.4)';
    previewContainer.thickness = 2.5;
    previewContainer.paddingTop = '18px';
    previewContainer.background = '#150a0a';

    const marsImg = new GUI.Image('marsImg', './textures/mars.jpg');
    marsImg.width = '415px';
    marsImg.height = '415px';
    previewContainer.addControl(marsImg);
    stack.addControl(previewContainer);

    // Dots
    const dotsRow = new GUI.StackPanel();
    dotsRow.isVertical = false;
    dotsRow.height = '28px';
    dotsRow.paddingTop = '12px';
    dotsRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;

    [0, 1, 2].forEach(i => {
      const dot = new GUI.Rectangle();
      dot.width = '12px';
      dot.height = '12px';
      dot.cornerRadius = 6;
      dot.background = i === 0 ? '#f97316' : 'rgba(255, 255, 255, 0.25)';
      dot.thickness = 0;
      dot.paddingLeft = '4px';
      dot.paddingRight = '4px';
      dotsRow.addControl(dot);
    });
    stack.addControl(dotsRow);

    // Subpestañas
    const tabsRow = new GUI.StackPanel();
    tabsRow.isVertical = false;
    tabsRow.height = '54px';
    tabsRow.paddingTop = '16px';

    ['Overview', 'Terrain', 'Geology', 'Data'].forEach((t, i) => {
      const b = GUI.Button.CreateSimpleButton(`marTab_${t}`, t);
      b.width = '350px';
      b.height = '44px';
      b.fontSize = 20;
      b.fontWeight = 'bold';
      b.cornerRadius = 22;
      b.color = i === 0 ? '#f97316' : '#64748b';
      b.background = i === 0 ? 'rgba(249, 115, 22, 0.22)' : 'transparent';
      b.thickness = i === 0 ? 1.5 : 0;
      b.paddingLeft = '6px';
      b.paddingRight = '6px';
      tabsRow.addControl(b);
    });
    stack.addControl(tabsRow);

    // Lista de métricas científicas
    const metricsStack = new GUI.StackPanel();
    metricsStack.isVertical = true;
    metricsStack.paddingTop = '20px';

    const addMetricRow = (icon: string, label: string, value: string) => {
      const row = new GUI.StackPanel();
      row.isVertical = false;
      row.height = '50px';

      const ic = new GUI.TextBlock();
      ic.text = icon;
      ic.fontSize = 22;
      ic.width = '42px';
      row.addControl(ic);

      const l = new GUI.TextBlock();
      l.text = label;
      l.color = '#94a3b8';
      l.fontSize = 22;
      l.width = '640px';
      l.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      row.addControl(l);

      const v = new GUI.TextBlock();
      v.text = value;
      v.color = '#f8fafc';
      v.fontSize = 22;
      v.fontWeight = 'bold';
      v.width = '720px';
      v.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
      row.addControl(v);

      metricsStack.addControl(row);
    };

    addMetricRow('⏱️', 'Radius', '3,390 km');
    addMetricRow('🌐', 'Surface area', '144.8 million km²');
    addMetricRow('⬇️', 'Gravity', '0.38 g (38% of Earth)');
    addMetricRow('🌡️', 'Avg. temperature', '-125 to 20 °C');
    addMetricRow('🏔️', 'Dominant terrain', 'Valles, craters, volcanoes');
    stack.addControl(metricsStack);

    // Botón Compare with Earth
    const btnCompare = GUI.Button.CreateSimpleButton('btnMarsCompare', '∞ Compare with Earth    ✓');
    btnCompare.width = '1440px';
    btnCompare.height = '72px';
    btnCompare.cornerRadius = 36;
    btnCompare.paddingTop = '24px';
    btnCompare.background = 'rgba(249, 115, 22, 0.2)';
    btnCompare.color = '#fb923c';
    btnCompare.fontSize = 24;
    btnCompare.fontWeight = 'bold';
    btnCompare.thickness = 1.5;
    btnCompare.onPointerClickObservable.add(() => {
      sound.playClick(750);
      if (this.callbacks.onCompareWithEarth) this.callbacks.onCompareWithEarth('Mars');
    });
    stack.addControl(btnCompare);
  }

  // =========================================================================
  // 10. Mesa de Control Inferior: Analog Site Analysis & Terrain Comparison
  // =========================================================================
  private createBottomConsoleDesk() {
    const plane = BABYLON.MeshBuilder.CreatePlane('xrBottomConsolePlane', {
      width: 3.8,
      height: 1.45
    }, this.scene);
    plane.parent = this.rootNode;
    plane.position = new BABYLON.Vector3(0, -0.85, 2.15);
    plane.rotation.x = 0.56; // Inclinación ergonómica hacia arriba (32º)
    plane.rotation.y = 0;

    const adt = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 2280, 870, false);
    this.dynamicTextures.push(adt);
    this.meshes.push(plane);
    (plane.material as BABYLON.StandardMaterial).backFaceCulling = false;
    (plane.material as BABYLON.StandardMaterial).disableLighting = true;

    const deskBox = new GUI.Rectangle('bottomDeskBox');
    deskBox.width = '2240px';
    deskBox.height = '840px';
    deskBox.cornerRadius = 28;
    deskBox.color = 'rgba(34, 211, 238, 0.45)';
    deskBox.thickness = 1.5;
    deskBox.background = 'rgba(6, 12, 24, 0.92)';
    adt.addControl(deskBox);

    const mainStack = new GUI.StackPanel();
    mainStack.isVertical = true;
    mainStack.paddingTop = '20px';
    mainStack.paddingLeft = '30px';
    mainStack.paddingRight = '30px';
    deskBox.addControl(mainStack);

    // SECCIÓN SUPERIOR: "Analog Site Analysis" Header
    const topBar = new GUI.StackPanel();
    topBar.isVertical = false;
    topBar.height = '50px';

    const pinIcon = new GUI.TextBlock();
    pinIcon.text = '📍';
    pinIcon.fontSize = 28;
    pinIcon.width = '42px';
    topBar.addControl(pinIcon);

    const titleStack = new GUI.StackPanel();
    titleStack.isVertical = true;
    titleStack.paddingLeft = '12px';
    const cTitle = new GUI.TextBlock();
    cTitle.text = 'Analog Site Analysis';
    cTitle.color = '#38bdf8';
    cTitle.fontSize = 24;
    cTitle.fontWeight = 'bold';
    cTitle.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    cTitle.height = '30px';
    titleStack.addControl(cTitle);

    const cSub = new GUI.TextBlock();
    cSub.text = 'Crater de Caldera Blanca (Lanzarote, España)';
    cSub.color = '#94a3b8';
    cSub.fontSize = 18;
    cSub.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    cSub.height = '20px';
    titleStack.addControl(cSub);
    topBar.addControl(titleStack);

    // Botones derecha del header
    const rightActions = new GUI.StackPanel();
    rightActions.isVertical = false;
    rightActions.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;

    const bFit = GUI.Button.CreateSimpleButton('btnFitArea', '⛶ Fit to Area');
    bFit.width = '180px';
    bFit.height = '42px';
    bFit.fontSize = 18;
    bFit.cornerRadius = 21;
    bFit.color = '#38bdf8';
    bFit.background = 'rgba(14, 165, 233, 0.2)';
    bFit.thickness = 1;
    rightActions.addControl(bFit);

    const b3D = GUI.Button.CreateSimpleButton('btn3DMode', '🧊 3D (10 km) ⌵');
    b3D.width = '180px';
    b3D.height = '42px';
    b3D.fontSize = 18;
    b3D.cornerRadius = 21;
    b3D.color = '#10b981';
    b3D.background = 'rgba(16, 185, 129, 0.2)';
    b3D.thickness = 1;
    b3D.paddingLeft = '14px';
    rightActions.addControl(b3D);

    topBar.addControl(rightActions);
    mainStack.addControl(topBar);

    // CUERPO DIVIDIDO EN 2 SUB-VENTANAS (Mapa Satelital 2D a la izquierda + DEM 3D a la derecha)
    const splitGrid = new GUI.Grid();
    splitGrid.height = '520px';
    splitGrid.addColumnDefinition(0.46); // 2D Map
    splitGrid.addColumnDefinition(0.54); // 3D DEM & Stats
    splitGrid.paddingTop = '12px';
    mainStack.addControl(splitGrid);

    // Ventana Izquierda: 2D Satellite Map
    const leftSubWin = new GUI.Rectangle();
    leftSubWin.cornerRadius = 18;
    leftSubWin.background = '#0a101f';
    leftSubWin.color = 'rgba(34, 211, 238, 0.3)';
    leftSubWin.thickness = 1;
    leftSubWin.paddingRight = '12px';

    const mapStack = new GUI.StackPanel();
    mapStack.isVertical = true;
    mapStack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;

    const mapImgContainer = new GUI.Rectangle();
    mapImgContainer.width = '960px';
    mapImgContainer.height = '460px';
    mapImgContainer.cornerRadius = 14;
    mapImgContainer.color = '#0284c7';
    mapImgContainer.thickness = 1.5;
    mapImgContainer.background = '#050a14';

    const satImg = new GUI.Image('satMapImg', './output_3d/thematic_comparison_atlas.png');
    satImg.width = '950px';
    satImg.height = '450px';
    mapImgContainer.addControl(satImg);

    const radarOverlay = new GUI.Rectangle();
    radarOverlay.width = '180px';
    radarOverlay.height = '180px';
    radarOverlay.cornerRadius = 90;
    radarOverlay.color = '#22d3ee';
    radarOverlay.thickness = 2;
    radarOverlay.background = 'rgba(34, 211, 238, 0.12)';
    mapImgContainer.addControl(radarOverlay);

    mapStack.addControl(mapImgContainer);
    leftSubWin.addControl(mapStack);
    splitGrid.addControl(leftSubWin, 0, 0);

    // Ventana Derecha: 3D DEM (IGN PNOA-LiDAR) & Telemetría Científica
    const rightSubWin = new GUI.Rectangle();
    rightSubWin.cornerRadius = 18;
    rightSubWin.background = '#091022';
    rightSubWin.color = 'rgba(34, 211, 238, 0.3)';
    rightSubWin.thickness = 1;
    rightSubWin.paddingLeft = '12px';

    const demContainer = new GUI.Grid();
    demContainer.addColumnDefinition(0.55); // 3D Canvas
    demContainer.addColumnDefinition(0.45); // Metrics Stats
    rightSubWin.addControl(demContainer);

    // Columna 1 del 3D DEM: Gráfico 3D en perspectiva isométrica
    const dem3DPlane = BABYLON.MeshBuilder.CreatePlane('xrDesk3DDEMMesh', {
      width: 1.0,
      height: 0.72
    }, this.scene);
    dem3DPlane.parent = this.rootNode;
    dem3DPlane.position = new BABYLON.Vector3(0.42, -0.78, 2.18);
    dem3DPlane.rotation.x = 0.56;

    const demTex = new BABYLON.DynamicTexture('xrDesk3DDEMTex', { width: 1000, height: 720 }, this.scene, true);
    this.dynamicTextures.push(demTex);
    this.desk3DDynamicTex = demTex;
    this.redrawDesk3DDEM();

    const demMat = new BABYLON.StandardMaterial('xrDesk3DDEMMat', this.scene);
    demMat.diffuseTexture = demTex;
    demMat.emissiveTexture = demTex;
    demMat.backFaceCulling = false;
    demMat.disableLighting = true;
    dem3DPlane.material = demMat;
    this.meshes.push(dem3DPlane);

    // Columna 2 del 3D DEM: Estadísticas Científicas
    const statsStack = new GUI.StackPanel();
    statsStack.isVertical = true;
    statsStack.paddingLeft = '20px';
    statsStack.paddingRight = '20px';
    statsStack.paddingTop = '18px';

    const sLabel = new GUI.TextBlock();
    sLabel.text = 'Similarity (vs Mars)';
    sLabel.color = '#94a3b8';
    sLabel.fontSize = 20;
    sLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    sLabel.height = '26px';
    statsStack.addControl(sLabel);

    const sScore = new GUI.TextBlock();
    sScore.text = '68.5%';
    sScore.color = '#22d3ee';
    sScore.fontSize = 44;
    sScore.fontWeight = 'bold';
    sScore.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    sScore.height = '52px';
    statsStack.addControl(sScore);

    const addStatRow = (label: string, val: string, color = '#f8fafc') => {
      const row = new GUI.StackPanel();
      row.isVertical = false;
      row.height = '42px';
      row.paddingTop = '6px';

      const l = new GUI.TextBlock();
      l.text = label;
      l.color = '#94a3b8';
      l.fontSize = 18;
      l.width = '240px';
      l.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      row.addControl(l);

      const v = new GUI.TextBlock();
      v.text = val;
      v.color = color;
      v.fontSize = 18;
      v.fontWeight = 'bold';
      v.width = '260px';
      v.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
      row.addControl(v);

      statsStack.addControl(row);
    };

    addStatRow('Elevation', '261 - 265 m');
    addStatRow('Slope (avg.)', '1.3°');
    addStatRow('Cavities / Tubes', 'IGN MDT05', '#38bdf8');
    addStatRow('Pearson (R)', '0.999', '#34d399');

    demContainer.addControl(statsStack, 0, 1);
    splitGrid.addControl(rightSubWin, 0, 1);

    // SECCIÓN INFERIOR: "Terrain Comparison" Dock Bar
    const dockBar = new GUI.Rectangle('bottomDockBar');
    dockBar.width = '2200px';
    dockBar.height = '135px';
    dockBar.cornerRadius = 18;
    dockBar.background = 'rgba(15, 23, 42, 0.85)';
    dockBar.color = 'rgba(34, 211, 238, 0.35)';
    dockBar.thickness = 1.5;
    dockBar.paddingTop = '16px';

    const dockGrid = new GUI.Grid();
    dockGrid.addColumnDefinition(0.24); // Title
    dockGrid.addColumnDefinition(0.18); // Surface Area
    dockGrid.addColumnDefinition(0.18); // Gravity
    dockGrid.addColumnDefinition(0.18); // Avg. Temp
    dockGrid.addColumnDefinition(0.22); // Action Button
    dockBar.addControl(dockGrid);

    // 1. Título
    const docTitleStack = new GUI.StackPanel();
    docTitleStack.isVertical = true;
    docTitleStack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    docTitleStack.paddingLeft = '20px';

    const dt1 = new GUI.TextBlock();
    dt1.text = '📊 Terrain Comparison';
    dt1.color = '#ffffff';
    dt1.fontSize = 22;
    dt1.fontWeight = 'bold';
    dt1.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    dt1.height = '30px';
    docTitleStack.addControl(dt1);

    const dt2 = new GUI.TextBlock();
    dt2.text = 'Key surface & environment metrics';
    dt2.color = '#94a3b8';
    dt2.fontSize = 16;
    dt2.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    dt2.height = '22px';
    docTitleStack.addControl(dt2);
    dockGrid.addControl(docTitleStack, 0, 0);

    // 2, 3, 4. Métricas
    const addMetricCol = (col: number, label: string, m1: string, m2: string) => {
      const p = new GUI.StackPanel();
      p.isVertical = true;
      p.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;

      const l = new GUI.TextBlock();
      l.text = label;
      l.color = '#94a3b8';
      l.fontSize = 16;
      l.height = '22px';
      p.addControl(l);

      const v = new GUI.TextBlock();
      v.text = `${m1}  •  ${m2}`;
      v.color = '#38bdf8';
      v.fontSize = 18;
      v.fontWeight = 'bold';
      v.height = '26px';
      p.addControl(v);

      dockGrid.addControl(p, 0, col);
    };

    addMetricCol(1, 'Surface Area', 'Moon 0.27×', 'Mars 3.82×');
    addMetricCol(2, 'Gravity (vs Earth)', 'Moon 0.165×', 'Mars 0.38×');
    addMetricCol(3, 'Avg. Temperature', '-173 ~ 127 °C', '-125 ~ 20 °C');

    // 5. Botón Full Comparison
    const btnFull = GUI.Button.CreateSimpleButton('btnFullCompDesk', '∞ Full Comparison →');
    btnFull.width = '320px';
    btnFull.height = '56px';
    btnFull.fontSize = 20;
    btnFull.fontWeight = 'bold';
    btnFull.cornerRadius = 28;
    btnFull.color = '#38bdf8';
    btnFull.background = 'rgba(14, 165, 233, 0.25)';
    btnFull.thickness = 1.5;
    btnFull.paddingRight = '20px';
    btnFull.onPointerClickObservable.add(() => sound.playClick(750));
    dockGrid.addControl(btnFull, 0, 4);

    mainStack.addControl(dockBar);
  }

  // =========================================================================
  // DIBUJADO DEL VISOR 3D DEM (Malla isométrica idéntica a la imagen)
  // =========================================================================
  private redrawDesk3DDEM() {
    if (!this.desk3DDynamicTex) return;
    const ctx = this.desk3DDynamicTex.getContext() as CanvasRenderingContext2D;
    const W = 1000;
    const H = 720;

    ctx.fillStyle = '#080f20';
    ctx.fillRect(0, 0, W, H);

    // Retícula sutil
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.15)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    const gridN = 14;
    const centerX = W * 0.44;
    const centerY = H * 0.58;
    const cosA = Math.cos(this.dem3DAngle);
    const sinA = Math.sin(this.dem3DAngle);
    const scaleX = 320;
    const scaleY = 170;
    const scaleZ = 130;

    const points: { sx: number; sy: number; z: number }[][] = [];

    for (let i = 0; i <= gridN; i++) {
      points[i] = [];
      const u = (i / gridN - 0.5) * 2;
      for (let j = 0; j <= gridN; j++) {
        const v = (j / gridN - 0.5) * 2;
        const dist = Math.sqrt(u * u + v * v);
        // Geometría cónica con depresión central (caldera volcánica)
        const elev = Math.exp(-dist * 2.2) * 1.05 - Math.exp(-dist * 5.0) * 0.82 + Math.sin(u * 6) * Math.cos(v * 6) * 0.08;

        const rx = u * cosA - v * sinA;
        const ry = u * sinA + v * cosA;

        const sx = centerX + rx * scaleX;
        const sy = centerY + ry * scaleY * 0.45 - elev * scaleZ;
        points[i][j] = { sx, sy, z: elev };
      }
    }

    // Polígonos con rampa térmica exacta de la imagen (marrón basalto a cian y nieve)
    for (let i = 0; i < gridN; i++) {
      for (let j = 0; j < gridN; j++) {
        const p1 = points[i][j];
        const p2 = points[i + 1][j];
        const p3 = points[i + 1][j + 1];
        const p4 = points[i][j + 1];
        const avgZ = Math.max(0, Math.min(1, (p1.z + p2.z + p3.z + p4.z) / 4));

        ctx.beginPath();
        ctx.moveTo(p1.sx, p1.sy);
        ctx.lineTo(p2.sx, p2.sy);
        ctx.lineTo(p3.sx, p3.sy);
        ctx.lineTo(p4.sx, p4.sy);
        ctx.closePath();

        const r = Math.floor(20 + avgZ * 160);
        const g = Math.floor(40 + avgZ * 140);
        const b = Math.floor(60 + avgZ * 90);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
        ctx.strokeStyle = `rgba(34, 211, 238, ${0.25 + avgZ * 0.6})`;
        ctx.lineWidth = 1.2;
        ctx.fill();
        ctx.stroke();
      }
    }

    // Anillo de exploración 100m en perspectiva
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY - 45, 90, 40, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Marcador central de diamante rojo
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - 68);
    ctx.lineTo(centerX + 14, centerY - 54);
    ctx.lineTo(centerX, centerY - 40);
    ctx.lineTo(centerX - 14, centerY - 54);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Barra de color a la derecha (220 m a 320 m)
    const barX = W - 100;
    const barY = 80;
    const barH = 500;
    const grad = ctx.createLinearGradient(0, barY, 0, barY + barH);
    grad.addColorStop(0, '#f8fafc');
    grad.addColorStop(0.3, '#38bdf8');
    grad.addColorStop(0.7, '#0284c7');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(barX, barY, 22, barH);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(barX, barY, 22, barH);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Elev. (m)', barX - 10, barY - 15);
    ctx.fillText('320', barX + 30, barY + 15);
    ctx.fillText('270', barX + 30, barY + barH / 2);
    ctx.fillText('220', barX + 30, barY + barH);

    // Título 3D DEM (IGN PNOA-LiDAR)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('3D DEM (IGN PNOA-LiDAR)', 30, 45);

    this.desk3DDynamicTex.update();
  }

  // =========================================================================
  // SEGUIMIENTO ERGONÓMICO A LA CÁMARA (WebXRCamera)
  // =========================================================================
  /**
   * En WebXR: la suite espacial sigue a la cámara EXCLUSIVAMENTE EN POSICIÓN.
   * La orientación se mantiene fija a nivel ABSOLUTO.
   * Si el usuario se desplaza, los paneles le acompañan; pero si gira la cabeza
   * o mira hacia atrás, los paneles se quedan en su orientación absoluta.
   */
  public updateFollowCamera(cameraPosition: BABYLON.Vector3) {
    if (this.isXRMode) {
      this.rootNode.position.x = BABYLON.Scalar.Lerp(this.rootNode.position.x, cameraPosition.x, 0.15);
      this.rootNode.position.y = BABYLON.Scalar.Lerp(this.rootNode.position.y, cameraPosition.y, 0.15);
      this.rootNode.position.z = BABYLON.Scalar.Lerp(this.rootNode.position.z, cameraPosition.z, 0.15);
    } else {
      const dirX = cameraPosition.x;
      const dirZ = cameraPosition.z;
      if (Math.abs(dirX) > 0.05 || Math.abs(dirZ) > 0.05) {
        const targetYaw = Math.atan2(dirX, dirZ);
        this.rootNode.rotation.y = BABYLON.Scalar.LerpAngle(this.rootNode.rotation.y, targetYaw, 0.08);
      }
    }
  }

  public setInitialOrientation(yaw: number) {
    this.rootNode.rotation.y = yaw;
  }

  public updateOrientation(cameraPosition: BABYLON.Vector3) {
    this.updateFollowCamera(cameraPosition);
  }

  public setXRMode(active: boolean) {
    this.isXRMode = active;
  }

  public getPedestalRootNode(): BABYLON.TransformNode {
    return this.pedestalRootNode;
  }

  public setActivePlanet(planet: CelestialBody) {
    this.activePlanet = planet;

    (['Earth', 'Mars', 'Moon'] as CelestialBody[]).forEach(body => {
      const btn = this.planetButtons[body];
      if (btn) {
        btn.background = body === planet ? 'rgba(14, 165, 233, 0.5)' : 'rgba(15, 23, 42, 0.65)';
        btn.color = body === planet ? '#ffffff' : '#94a3b8';
      }
    });
  }

  public setActiveLayerMode(mode: PlanetaryLayerMode) {
    this.activeLayerMode = mode;
    (['surface', 'topography', 'exploration'] as PlanetaryLayerMode[]).forEach(m => {
      const btn = this.layerButtons[m];
      if (btn) {
        btn.background = m === mode ? 'rgba(34, 211, 238, 0.4)' : 'rgba(15, 23, 42, 0.65)';
        btn.color = m === mode ? '#ffffff' : '#94a3b8';
      }
    });
  }

  public selectMoonCandidate(site: AnalogSite) {
    this.selectedMoonSite = site;
    this.redrawDesk3DDEM();
  }

  public selectMarsCandidate(site: AnalogSite) {
    this.selectedMarsSite = site;
    this.redrawDesk3DDEM();
  }

  public toggleStation(target: 'Moon' | 'Mars', open?: boolean) {
    // Las tarjetas de Luna y Marte se mantienen permanentemente visibles y proporcionadas
  }

  public setVisible(visible: boolean) {
    this.rootNode.setEnabled(visible);
    this.pedestalRootNode.setEnabled(visible);
  }

  public isVisible(): boolean {
    return this.rootNode.isEnabled();
  }

  public getRootNode(): BABYLON.TransformNode {
    return this.rootNode;
  }

  public dispose() {
    this.dynamicTextures.forEach(dt => dt.dispose());
    this.dynamicTextures = [];
    this.meshes.forEach(m => m.dispose());
    this.meshes = [];
    this.rootNode.dispose();
    this.pedestalRootNode.dispose();
  }
}
