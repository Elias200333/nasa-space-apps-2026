import * as BABYLON from 'babylonjs';
import * as GUI from 'babylonjs-gui';
import { CelestialBody, PlanetaryLayerMode, AnalogSite } from '../types';
import { sound } from '../audio';
import { ANALOG_DATABASE } from '../data/analogs';
import {
  bodyName, demSourceShort, drawDemIso, drawSatellite, elevationText, fmtNum, radiusText,
  terrainModel, TerrainModel, zoomForRadius,
} from '../data/terrainModel';

export interface XRSpatialUICallbacks {
  onPlanetSwitch: (planet: CelestialBody) => void;
  onLayerModeSwitch: (mode: PlanetaryLayerMode) => void;
  onCameraTool: (action: 'orbit' | 'move' | 'zoomIn' | 'zoomOut' | 'fit') => void;
  onCompareWithEarth?: (target: 'Moon' | 'Mars') => void;
  onAnalogSiteSelect?: (site: AnalogSite) => void;
  // Acciones de la barra superior y de la mesa (antes decorativas)
  onRecenter?: () => void;
  onToggleRobot?: () => void;
  onExitXR?: () => void;
  onFitToArea?: () => void;
  onOpenAnalogs?: () => void;
  onFullComparison?: () => void;
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
  private navCoordsBlock: GUI.TextBlock | null = null;

  // Mesa «Analog Site Analysis» con datos reales (src/data/terrainModel.ts)
  private deskSubBlock: GUI.TextBlock | null = null;
  private deskSimLabel: GUI.TextBlock | null = null;
  private deskSimValue: GUI.TextBlock | null = null;
  private deskRows: GUI.TextBlock[] = [];
  private deskSatImage: GUI.Image | null = null;
  private deskRing: GUI.Control | null = null;
  private deskModel: TerrainModel | null = null;
  private deskUnsub: (() => void) | null = null;

  // Mini-esferas 3D orbitales de la Luna y Marte
  private miniMoonMesh: BABYLON.Mesh | null = null;
  private miniMarsMesh: BABYLON.Mesh | null = null;
  private orbitMoonAngle = 0.8;
  private orbitMarsAngle = 2.4;
  private orbitObserver: BABYLON.Nullable<BABYLON.Observer<BABYLON.Scene>> = null;
  private navTabButtons: { [key: string]: GUI.Button } = {};
  private activeNavTab = 'explore';

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
    this.createOrbitingPlanets();
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
    ctx.fillText('TERRAIN-X HOLOGRAPHIC STAGE', 512, 930);
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
  // 1b. Mini-Planetas Orbitales 3D (Luna y Marte flanqueando la Tierra)
  // =========================================================================
  private createOrbitingPlanets() {
    const orbitRoot = new BABYLON.TransformNode('xrOrbitRoot', this.scene);
    orbitRoot.parent = this.pedestalRootNode;
    orbitRoot.position = new BABYLON.Vector3(0, 0, 0);

    // 1. Órbita elíptica luminosa de la Luna
    const moonOrbitTorus = BABYLON.MeshBuilder.CreateTorus('xrMoonOrbitTorus', {
      diameter: 3.2,
      thickness: 0.009,
      tessellation: 96
    }, this.scene);
    moonOrbitTorus.parent = orbitRoot;
    moonOrbitTorus.rotation.x = Math.PI / 2 + 0.24;
    moonOrbitTorus.rotation.y = 0.15;
    const moonOrbitMat = new BABYLON.StandardMaterial('xrMoonOrbitMat', this.scene);
    moonOrbitMat.emissiveColor = new BABYLON.Color3(0.22, 0.74, 0.97);
    moonOrbitMat.diffuseColor = new BABYLON.Color3(0.22, 0.74, 0.97);
    moonOrbitMat.alpha = 0.45;
    moonOrbitMat.disableLighting = true;
    moonOrbitTorus.material = moonOrbitMat;
    moonOrbitTorus.isPickable = false;
    this.meshes.push(moonOrbitTorus);

    // Mini-esfera 3D de la Luna
    const moonSphere = BABYLON.MeshBuilder.CreateSphere('xrMiniMoon', {
      diameter: 0.32,
      segments: 32
    }, this.scene);
    moonSphere.parent = orbitRoot;
    const moonMat = new BABYLON.StandardMaterial('xrMiniMoonMat', this.scene);
    moonMat.diffuseTexture = new BABYLON.Texture('./textures/moon.jpg', this.scene);
    moonMat.emissiveColor = new BABYLON.Color3(0.22, 0.22, 0.22);
    moonMat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    moonSphere.material = moonMat;
    this.miniMoonMesh = moonSphere;
    this.meshes.push(moonSphere);

    // 2. Órbita elíptica luminosa de Marte
    const marsOrbitTorus = BABYLON.MeshBuilder.CreateTorus('xrMarsOrbitTorus', {
      diameter: 4.4,
      thickness: 0.009,
      tessellation: 96
    }, this.scene);
    marsOrbitTorus.parent = orbitRoot;
    marsOrbitTorus.rotation.x = Math.PI / 2 - 0.20;
    marsOrbitTorus.rotation.y = -0.22;
    const marsOrbitMat = new BABYLON.StandardMaterial('xrMarsOrbitMat', this.scene);
    marsOrbitMat.emissiveColor = new BABYLON.Color3(0.98, 0.45, 0.09);
    marsOrbitMat.diffuseColor = new BABYLON.Color3(0.98, 0.45, 0.09);
    marsOrbitMat.alpha = 0.45;
    marsOrbitMat.disableLighting = true;
    marsOrbitTorus.material = marsOrbitMat;
    marsOrbitTorus.isPickable = false;
    this.meshes.push(marsOrbitTorus);

    // Mini-esfera 3D de Marte
    const marsSphere = BABYLON.MeshBuilder.CreateSphere('xrMiniMars', {
      diameter: 0.42,
      segments: 32
    }, this.scene);
    marsSphere.parent = orbitRoot;
    const marsMat = new BABYLON.StandardMaterial('xrMiniMarsMat', this.scene);
    marsMat.diffuseTexture = new BABYLON.Texture('./textures/mars.jpg', this.scene);
    marsMat.emissiveColor = new BABYLON.Color3(0.28, 0.12, 0.05);
    marsMat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    marsSphere.material = marsMat;
    this.miniMarsMesh = marsSphere;
    this.meshes.push(marsSphere);

    // Acción de selección interactiva (clic / rayo)
    moonSphere.actionManager = new BABYLON.ActionManager(this.scene);
    moonSphere.actionManager.registerAction(
      new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickTrigger, () => {
        sound.playClick(600);
        this.setActivePlanet('Moon');
        this.callbacks.onPlanetSwitch('Moon');
      })
    );

    marsSphere.actionManager = new BABYLON.ActionManager(this.scene);
    marsSphere.actionManager.registerAction(
      new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickTrigger, () => {
        sound.playClick(750);
        this.setActivePlanet('Mars');
        this.callbacks.onPlanetSwitch('Mars');
      })
    );

    // Animación continua y suave de traslación y rotación
    this.orbitObserver = this.scene.onBeforeRenderObservable.add(() => {
      this.orbitMoonAngle += 0.0035;
      this.orbitMarsAngle -= 0.0024;

      if (this.miniMoonMesh) {
        this.miniMoonMesh.position.x = Math.cos(this.orbitMoonAngle) * 1.6;
        this.miniMoonMesh.position.z = Math.sin(this.orbitMoonAngle) * 1.6;
        this.miniMoonMesh.position.y = Math.sin(this.orbitMoonAngle) * 0.35;
        this.miniMoonMesh.rotation.y += 0.006;
      }
      if (this.miniMarsMesh) {
        this.miniMarsMesh.position.x = Math.cos(this.orbitMarsAngle) * 2.2;
        this.miniMarsMesh.position.z = Math.sin(this.orbitMarsAngle) * 2.2;
        this.miniMarsMesh.position.y = Math.cos(this.orbitMarsAngle) * 0.42;
        this.miniMarsMesh.rotation.y += 0.005;
      }
    });
  }

  // =========================================================================
  // 2. Barra de Navegación Superior Flotante
  // =========================================================================
  private createTopNavigationBar() {
    const plane = BABYLON.MeshBuilder.CreatePlane('xrTopNavPlane', {
      width: 4.2,
      height: 0.54
    }, this.scene);
    plane.parent = this.rootNode;
    plane.position = new BABYLON.Vector3(0, 1.10, 2.7);
    plane.rotation.x = -0.12;
    plane.rotation.y = 0;

    const adt = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 2400, 280, false);
    this.dynamicTextures.push(adt);
    this.meshes.push(plane);
    (plane.material as BABYLON.StandardMaterial).backFaceCulling = false;
    (plane.material as BABYLON.StandardMaterial).disableLighting = true;

    const rootBox = new GUI.Rectangle('navBarRoot');
    rootBox.width = '2360px';
    rootBox.height = '260px';
    rootBox.cornerRadius = 28;
    rootBox.color = 'rgba(34, 211, 238, 0.45)';
    rootBox.thickness = 1.5;
    rootBox.background = 'rgba(7, 13, 26, 0.88)';
    adt.addControl(rootBox);

    const grid = new GUI.Grid();
    grid.addColumnDefinition(540, true);  // Logo y títulos
    grid.addColumnDefinition(580, true);  // Coordenadas en vivo
    grid.addColumnDefinition(580, true);  // Barra de búsqueda idéntica a la web
    grid.addColumnDefinition(660, true);  // Campana, EM, Robot Go2, Salir de XR
    rootBox.addControl(grid);

    // 1. Logo y títulos
    const brandPanel = new GUI.StackPanel();
    brandPanel.isVertical = false;
    brandPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    brandPanel.paddingLeft = '24px';

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
    titlePanel.paddingLeft = '14px';
    titlePanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;

    const titleText = new GUI.TextBlock();
    titleText.text = 'IEF Comparation';
    titleText.color = '#ffffff';
    titleText.fontSize = 28;
    titleText.fontWeight = 'bold';
    titleText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.height = '36px';
    titlePanel.addControl(titleText);

    const subText = new GUI.TextBlock();
    subText.text = 'NASA SPACE APPS 2026';
    subText.color = '#38bdf8';
    subText.fontSize = 16;
    subText.fontWeight = 'bold';
    subText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    subText.height = '22px';
    titlePanel.addControl(subText);

    brandPanel.addControl(titlePanel);

    // Badge NASA Space Apps
    const spaceAppsBadge = new GUI.Rectangle();
    spaceAppsBadge.width = '90px';
    spaceAppsBadge.height = '48px';
    spaceAppsBadge.cornerRadius = 24;
    spaceAppsBadge.color = 'rgba(255, 255, 255, 0.2)';
    spaceAppsBadge.thickness = 1;
    spaceAppsBadge.background = 'rgba(15, 23, 42, 0.6)';
    spaceAppsBadge.paddingLeft = '12px';
    const saImg = new GUI.Image('saBadgeImg', './nasa_space_apps_logo.png');
    saImg.width = '40px';
    saImg.height = '40px';
    spaceAppsBadge.addControl(saImg);
    brandPanel.addControl(spaceAppsBadge);

    grid.addControl(brandPanel, 0, 0);

    // 2. Coordenadas del centro del globo en vivo (idéntica a la píldora superior)
    const coordsPill = new GUI.Rectangle('navCoordsPill');
    coordsPill.width = '550px';
    coordsPill.height = '58px';
    coordsPill.cornerRadius = 29;
    coordsPill.background = 'rgba(8, 14, 28, 0.85)';
    coordsPill.color = 'rgba(34, 211, 238, 0.45)';
    coordsPill.thickness = 1.5;
    const coordsTxt = new GUI.TextBlock();
    coordsTxt.text = '⊙ 15.0488° N, 169.5728° W • WGS84 | 5,000 km';
    coordsTxt.color = '#e2e8f0';
    coordsTxt.fontSize = 20;
    coordsTxt.fontFamily = 'monospace';
    coordsPill.addControl(coordsTxt);
    this.navCoordsBlock = coordsTxt;
    grid.addControl(coordsPill, 0, 1);

    // 3. Barra de búsqueda idéntica a la web
    const searchPill = new GUI.Rectangle('navSearchPill');
    searchPill.width = '550px';
    searchPill.height = '58px';
    searchPill.cornerRadius = 29;
    searchPill.background = 'rgba(15, 23, 42, 0.75)';
    searchPill.color = 'rgba(255, 255, 255, 0.18)';
    searchPill.thickness = 1;
    const searchTxt = new GUI.TextBlock();
    searchTxt.text = '🔍 Search a location, crater, or feature...   /';
    searchTxt.color = '#94a3b8';
    searchTxt.fontSize = 19;
    searchPill.addControl(searchTxt);
    searchPill.onPointerClickObservable.add(() => {
      sound.playClick(600);
      this.callbacks.onOpenAnalogs?.();
    });
    grid.addControl(searchPill, 0, 2);

    // 4. Acciones: Campana · EM · Robot Go2 · Salir de XR
    const actions = new GUI.StackPanel();
    actions.isVertical = false;
    actions.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    actions.paddingRight = '24px';
    actions.spacing = 10;

    // Campana de notificaciones
    const bellBtn = GUI.Button.CreateSimpleButton('navBell', '🔔');
    bellBtn.width = '58px';
    bellBtn.height = '58px';
    bellBtn.cornerRadius = 29;
    bellBtn.color = '#38bdf8';
    bellBtn.background = 'rgba(15, 23, 42, 0.75)';
    bellBtn.thickness = 1;
    bellBtn.fontSize = 24;
    actions.addControl(bellBtn);

    // Avatar usuario EM
    const avatar = new GUI.Rectangle('userAvatar');
    avatar.width = '58px';
    avatar.height = '58px';
    avatar.cornerRadius = 29;
    avatar.background = '#0284c7';
    avatar.color = '#38bdf8';
    avatar.thickness = 1.5;
    const avTxt = new GUI.TextBlock();
    avTxt.text = 'EM';
    avTxt.color = '#ffffff';
    avTxt.fontSize = 22;
    avTxt.fontWeight = 'bold';
    avatar.addControl(avTxt);
    actions.addControl(avatar);

    const mk = (label: string, fn: (() => void) | undefined, primary = false, color = '#38bdf8') => {
      const b = GUI.Button.CreateSimpleButton(`nav_${label}`, label);
      b.width = primary ? '260px' : '180px';
      b.height = '58px';
      b.cornerRadius = 29;
      b.fontSize = 20;
      b.fontWeight = 'bold';
      b.thickness = 1.5;
      b.color = primary ? '#ffffff' : color;
      b.background = primary ? 'rgba(8, 145, 178, 0.92)' : 'rgba(14, 165, 233, 0.18)';
      b.onPointerClickObservable.add(() => { sound.playClick(700); fn?.(); });
      actions.addControl(b);
    };

    mk('🐕 Robot Go2 (WASD)', () => this.callbacks.onToggleRobot?.(), true);
    mk('🥽 Salir de XR', () => this.callbacks.onExitXR?.());
    grid.addControl(actions, 0, 3);
  }

  private updateNavTabs() {
    Object.keys(this.navTabButtons).forEach(id => {
      const b = this.navTabButtons[id];
      if (b) {
        const active = id === this.activeNavTab;
        b.color = active ? '#ffffff' : '#94a3b8';
        b.background = active ? 'rgba(8, 145, 178, 0.85)' : 'rgba(15, 23, 42, 0.65)';
      }
    });
  }

  /** Coordenadas del centro del globo (las mismas que la píldora de la web). */
  public setCoordinates(text: string) {
    if (this.navCoordsBlock) this.navCoordsBlock.text = `⊙ ${text}`;
    if (this.telemetryCoordsBlock) this.telemetryCoordsBlock.text = `⊙ ${text}`;
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
    plane.position = new BABYLON.Vector3(0, 0.84, 2.85);
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
    plane.position = new BABYLON.Vector3(0.75, 0.72, 2.85);
    plane.rotation.x = -0.10;
    plane.rotation.y = 0.14;

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
    plane.position = new BABYLON.Vector3(-2.65, -0.05, 2.60);
    plane.rotation.y = -0.62; // Orientado hacia el usuario/gafas (~ -35.5º hacia adentro)
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

    // Subpestañas interactivas
    const tabsRow = new GUI.StackPanel();
    tabsRow.isVertical = false;
    tabsRow.height = '54px';
    tabsRow.paddingTop = '16px';

    // Lista de métricas científicas dinámicas
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

    const moonTabButtons: { [key: string]: GUI.Button } = {};
    const setMoonTab = (tab: string) => {
      Object.keys(moonTabButtons).forEach(t => {
        const b = moonTabButtons[t];
        const active = t === tab;
        b.color = active ? '#38bdf8' : '#64748b';
        b.background = active ? 'rgba(56, 189, 248, 0.22)' : 'transparent';
        b.thickness = active ? 1.5 : 0;
      });
      metricsStack.clearControls();
      if (tab === 'Overview') {
        addMetricRow('⏱️', 'Radius', '1,737 km');
        addMetricRow('🌐', 'Surface area', '37.9 million km²');
        addMetricRow('⬇️', 'Gravity', '0.165 g (16.5% of Earth)');
        addMetricRow('🌡️', 'Avg. temperature', '-173 to 127 °C');
        addMetricRow('🏔️', 'Dominant terrain', 'Craters, regolith, highlands');
      } else if (tab === 'Terrain') {
        addMetricRow('🏔️', 'Topography', 'Impact basins & highlands');
        addMetricRow('⬆️', 'Max Elevation', '+10.7 km (Dirichlet-Jackson)');
        addMetricRow('⬇️', 'Lowest Point', '-9.1 km (Antoniadi Crater)');
        addMetricRow('〰️', 'Roughness', 'Media-Alta (Hurst 0.82)');
        addMetricRow('📐', 'Surface Slope', 'Media 5.8° (máx 34°)');
      } else if (tab === 'Geology') {
        addMetricRow('💎', 'Composition', 'Anortosita, basalto ilmenítico');
        addMetricRow('🌋', 'Volcanism', 'Mares de lava inactivos');
        addMetricRow('🧲', 'Magnetic Field', 'Residual cortical localizado');
        addMetricRow('🧊', 'Water Ice', 'Cráteres polares en sombra (PSR)');
        addMetricRow('💨', 'Atmosphere', 'Exosfera traza (< 10⁻¹¹ mbar)');
      } else if (tab === 'Data') {
        addMetricRow('🚀', 'Key Missions', 'Apollo, LRO, Artemis III');
        addMetricRow('📍', 'Analog Sites', 'Caldera Blanca, Mauna Kea');
        addMetricRow('🎯', 'Similarity Score', '62.8% - 71.1%');
        addMetricRow('📡', 'DEM Resolution', '30 m LRO LOLA / 5 m IGN');
        addMetricRow('🐕', 'Rover Operation', 'Unitree Go2 / Artemis Rover');
      }
    };

    ['Overview', 'Terrain', 'Geology', 'Data'].forEach((t, i) => {
      const b = GUI.Button.CreateSimpleButton(`mTab_${t}`, t);
      b.width = '350px';
      b.height = '44px';
      b.fontSize = 20;
      b.fontWeight = 'bold';
      b.cornerRadius = 22;
      b.color = i === 0 ? '#38bdf8' : '#64748b';
      b.background = i === 0 ? 'rgba(56, 189, 248, 0.22)' : 'transparent';
      b.thickness = i === 0 ? 1.5 : 0;
      b.paddingLeft = '6px';
      b.paddingRight = '6px';
      b.onPointerClickObservable.add(() => {
        sound.playClick(650);
        setMoonTab(t);
      });
      moonTabButtons[t] = b;
      tabsRow.addControl(b);
    });
    stack.addControl(tabsRow);

    // Inicializar con Overview
    setMoonTab('Overview');
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
    plane.position = new BABYLON.Vector3(-1.75, -0.05, 2.70);
    plane.rotation.y = -0.42; // Orientado hacia el usuario/gafas (~ -24º hacia adentro)

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
      b.width = '210px';
      b.height = '210px';
      b.cornerRadius = 105;
      b.color = '#38bdf8';
      b.fontSize = 20;
      b.fontWeight = 'bold';
      b.background = isFirst ? 'rgba(8, 145, 178, 0.45)' : 'rgba(15, 23, 42, 0.75)';
      b.thickness = isFirst ? 2.5 : 1.5;
      b.paddingTop = '14px';
      b.paddingBottom = '14px';
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
    plane.position = new BABYLON.Vector3(2.65, -0.05, 2.60);
    plane.rotation.y = 0.62; // Orientado hacia el usuario/gafas (~ +35.5º hacia adentro)
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

    // Subpestañas interactivas de Marte
    const tabsRow = new GUI.StackPanel();
    tabsRow.isVertical = false;
    tabsRow.height = '54px';
    tabsRow.paddingTop = '16px';

    // Lista de métricas científicas dinámicas
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

    const marsTabButtons: { [key: string]: GUI.Button } = {};
    const setMarsTab = (tab: string) => {
      Object.keys(marsTabButtons).forEach(t => {
        const b = marsTabButtons[t];
        const active = t === tab;
        b.color = active ? '#f97316' : '#64748b';
        b.background = active ? 'rgba(249, 115, 22, 0.22)' : 'transparent';
        b.thickness = active ? 1.5 : 0;
      });
      metricsStack.clearControls();
      if (tab === 'Overview') {
        addMetricRow('⏱️', 'Radius', '3,390 km');
        addMetricRow('🌐', 'Surface area', '144.8 million km²');
        addMetricRow('⬇️', 'Gravity', '0.38 g (38% of Earth)');
        addMetricRow('🌡️', 'Avg. temperature', '-125 to 20 °C');
        addMetricRow('🏔️', 'Dominant terrain', 'Valles, craters, volcanoes');
      } else if (tab === 'Terrain') {
        addMetricRow('🏔️', 'Topography', 'Olympus Mons & Valles Marineris');
        addMetricRow('⬆️', 'Max Elevation', '+21.2 km (Olympus Mons)');
        addMetricRow('⬇️', 'Lowest Point', '-8.2 km (Hellas Basin)');
        addMetricRow('〰️', 'Roughness', 'Media-Extrema (Hurst 0.76)');
        addMetricRow('📐', 'Surface Slope', 'Media 6.2° (máx 45°)');
      } else if (tab === 'Geology') {
        addMetricRow('💎', 'Composition', 'Óxidos de hierro, jarosita, basalto');
        addMetricRow('🌋', 'Volcanism', 'Escudos volcánicos gigantes');
        addMetricRow('🧲', 'Magnetic Field', 'Ausente global / Paleomagnetismo');
        addMetricRow('🧊', 'Water Ice', 'Casquetes polares y permafrost');
        addMetricRow('💨', 'Atmosphere', 'CO₂ 95.3% (6.1 mbar)');
      } else if (tab === 'Data') {
        addMetricRow('🚀', 'Key Missions', 'Curiosity, Perseverance, MRO');
        addMetricRow('📍', 'Analog Sites', 'Río Tinto, Teide, Atacama');
        addMetricRow('🎯', 'Similarity Score', '55.1% - 74.2%');
        addMetricRow('📡', 'DEM Resolution', '25 m HiRISE / MOLA / IGN');
        addMetricRow('🐕', 'Rover Operation', 'Unitree Go2 / Perseverance');
      }
    };

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
      b.onPointerClickObservable.add(() => {
        sound.playClick(650);
        setMarsTab(t);
      });
      marsTabButtons[t] = b;
      tabsRow.addControl(b);
    });
    stack.addControl(tabsRow);

    // Inicializar con Overview
    setMarsTab('Overview');
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
    plane.position = new BABYLON.Vector3(0, -0.88, 2.15);
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
    // Rejilla con anchos fijos (antes una fila sin anchos: el título se montaba sobre los botones)
    const topBar = new GUI.Grid();
    topBar.height = '56px';
    topBar.addColumnDefinition(50, true);   // icono
    topBar.addColumnDefinition(1);          // título y sitio
    topBar.addColumnDefinition(460, true);  // botones

    const pinIcon = new GUI.TextBlock();
    pinIcon.text = '📍';
    pinIcon.fontSize = 28;
    topBar.addControl(pinIcon, 0, 0);

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
    cSub.text = 'Cargando modelo de terreno…';
    cSub.color = '#94a3b8';
    cSub.fontSize = 18;
    cSub.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    cSub.height = '20px';
    titleStack.addControl(cSub);
    this.deskSubBlock = cSub;
    topBar.addControl(titleStack, 0, 1);

    // Botones derecha del header (Fit to Area, 3D · r 10 km, Cerrar)
    const rightActions = new GUI.StackPanel();
    rightActions.isVertical = false;
    rightActions.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;

    const bFit = GUI.Button.CreateSimpleButton('btnFitArea', '⛶ Fit to Area');
    bFit.width = '170px';
    bFit.height = '42px';
    bFit.fontSize = 18;
    bFit.cornerRadius = 21;
    bFit.color = '#38bdf8';
    bFit.background = 'rgba(14, 165, 233, 0.2)';
    bFit.thickness = 1;
    bFit.onPointerClickObservable.add(() => { sound.playClick(650); this.callbacks.onFitToArea?.(); });
    rightActions.addControl(bFit);

    const b3D = GUI.Button.CreateSimpleButton('btn3DMode', '3D · r 10 km');
    b3D.onPointerClickObservable.add(() => { sound.playClick(650); this.callbacks.onOpenAnalogs?.(); });
    b3D.width = '170px';
    b3D.height = '42px';
    b3D.fontSize = 18;
    b3D.cornerRadius = 21;
    b3D.color = '#38bdf8';
    b3D.background = 'rgba(14, 165, 233, 0.25)';
    b3D.thickness = 1.5;
    b3D.paddingLeft = '10px';
    rightActions.addControl(b3D);

    const bClose = GUI.Button.CreateSimpleButton('btnDeskClose', '✕');
    bClose.width = '42px';
    bClose.height = '42px';
    bClose.fontSize = 18;
    bClose.cornerRadius = 21;
    bClose.color = '#94a3b8';
    bClose.background = 'rgba(15, 23, 42, 0.7)';
    bClose.thickness = 1;
    bClose.paddingLeft = '10px';
    bClose.onPointerClickObservable.add(() => {
      sound.playClick(500);
      deskBox.isVisible = false;
    });
    rightActions.addControl(bClose);

    topBar.addControl(rightActions, 0, 2);
    mainStack.addControl(topBar);

    // CUERPO DIVIDIDO EN 2 SUB-VENTANAS (Mapa Satelital 2D a la izquierda + DEM 3D a la derecha)
    const splitGrid = new GUI.Grid();
    splitGrid.height = '520px';
    splitGrid.width = '2140px';   // sin ancho fijo medía 2237 px y la mesa (2177 px útiles) recortaba las cifras de la derecha
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

    // Imagen satelital REAL (Esri) del sitio del modelo; la rellena updateDesk()
    const satImg = new GUI.Image('satMapImg');
    satImg.width = '950px';
    satImg.height = '450px';
    satImg.stretch = GUI.Image.STRETCH_FILL;
    mapImgContainer.addControl(satImg);
    this.deskSatImage = satImg;

    // Anillo del radio de exploración REAL con retícula central
    const radarOverlay = new GUI.Ellipse();
    radarOverlay.width = '180px';
    radarOverlay.height = '180px';
    radarOverlay.color = '#22d3ee';
    radarOverlay.thickness = 2.5;
    radarOverlay.background = 'rgba(34, 211, 238, 0.08)';

    const centerCross = new GUI.TextBlock();
    centerCross.text = '+';
    centerCross.color = '#22d3ee';
    centerCross.fontSize = 24;
    centerCross.fontWeight = 'bold';
    radarOverlay.addControl(centerCross);

    mapImgContainer.addControl(radarOverlay);
    this.deskRing = radarOverlay;

    // Botones de zoom sobre el mapa satelital
    const mapZoomStack = new GUI.StackPanel();
    mapZoomStack.isVertical = true;
    mapZoomStack.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    mapZoomStack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    mapZoomStack.paddingRight = '16px';
    mapZoomStack.spacing = 8;

    const bZIn = GUI.Button.CreateSimpleButton('btnDeskMapZIn', '+');
    bZIn.width = '42px';
    bZIn.height = '42px';
    bZIn.cornerRadius = 21;
    bZIn.background = 'rgba(15, 23, 42, 0.85)';
    bZIn.color = '#38bdf8';
    bZIn.fontSize = 26;
    bZIn.thickness = 1;
    mapZoomStack.addControl(bZIn);

    const bZOut = GUI.Button.CreateSimpleButton('btnDeskMapZOut', '−');
    bZOut.width = '42px';
    bZOut.height = '42px';
    bZOut.cornerRadius = 21;
    bZOut.background = 'rgba(15, 23, 42, 0.85)';
    bZOut.color = '#38bdf8';
    bZOut.fontSize = 26;
    bZOut.thickness = 1;
    mapZoomStack.addControl(bZOut);

    mapImgContainer.addControl(mapZoomStack);

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
    dem3DPlane.position = new BABYLON.Vector3(0.42, -0.81, 2.18);
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
    this.deskSimLabel = sLabel;
    sLabel.text = 'Similarity';
    sLabel.color = '#94a3b8';
    sLabel.fontSize = 20;
    sLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    sLabel.height = '26px';
    statsStack.addControl(sLabel);

    const sScore = new GUI.TextBlock();
    this.deskSimValue = sScore;
    sScore.text = '—';
    sScore.color = '#22d3ee';
    sScore.fontSize = 44;
    sScore.fontWeight = 'bold';
    sScore.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    sScore.height = '52px';
    statsStack.addControl(sScore);

    const addStatRow = (label: string, val: string, color = '#f8fafc') => {
      // Rejilla de dos columnas que se adapta al ancho (con anchos fijos el valor se recortaba)
      const row = new GUI.Grid();
      row.height = '42px';
      row.width = '440px';
      row.paddingTop = '6px';
      row.addColumnDefinition(0.4);
      row.addColumnDefinition(0.6);

      const l = new GUI.TextBlock();
      l.text = label;
      l.color = '#94a3b8';
      l.fontSize = 18;
      l.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      row.addControl(l, 0, 0);

      const v = new GUI.TextBlock();
      v.text = val;
      v.color = color;
      v.fontSize = 18;
      v.fontWeight = 'bold';
      v.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;   // a la izquierda: nunca llega al borde
      v.paddingLeft = '8px';
      row.addControl(v, 0, 1);

      statsStack.addControl(row);
      this.deskRows.push(v);
    };

    // Valores reales del modelo (updateDesk); «—» mientras no haya dato
    addStatRow('Elevation', '—');
    addStatRow('Slope (avg.)', '—');
    addStatRow('DEM', '—', '#38bdf8');
    addStatRow('Radius', '—', '#34d399');

    demContainer.addControl(statsStack, 0, 1);
    splitGrid.addControl(rightSubWin, 0, 1);

    // SECCIÓN INFERIOR: "Terrain Comparison" Dock Bar
    const dockBar = new GUI.Rectangle('bottomDockBar');
    dockBar.width = '2140px';   // cabe en la columna de la mesa (2177 px útiles)
    dockBar.height = '135px';
    dockBar.cornerRadius = 18;
    dockBar.background = 'rgba(15, 23, 42, 0.85)';
    dockBar.color = 'rgba(34, 211, 238, 0.35)';
    dockBar.thickness = 1.5;
    dockBar.paddingTop = '16px';

    const dockGrid = new GUI.Grid();
    dockGrid.addColumnDefinition(0.22); // Title
    dockGrid.addColumnDefinition(0.15); // Surface Area
    dockGrid.addColumnDefinition(0.15); // Gravity
    dockGrid.addColumnDefinition(0.16); // Avg. Temp
    dockGrid.addColumnDefinition(0.16); // Terrain Complexity
    dockGrid.addColumnDefinition(0.16); // Action Button
    dockBar.addControl(dockGrid);

    // 1. Título
    const docTitleStack = new GUI.StackPanel();
    docTitleStack.isVertical = true;
    docTitleStack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    docTitleStack.paddingLeft = '20px';

    const dt1 = new GUI.TextBlock();
    dt1.text = '📊 Terrain Comparison';
    dt1.color = '#ffffff';
    dt1.fontSize = 20;
    dt1.fontWeight = 'bold';
    dt1.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    dt1.height = '28px';
    docTitleStack.addControl(dt1);

    const dt2 = new GUI.TextBlock();
    dt2.text = 'Key surface & environment metrics';
    dt2.color = '#94a3b8';
    dt2.fontSize = 15;
    dt2.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    dt2.height = '20px';
    docTitleStack.addControl(dt2);
    dockGrid.addControl(docTitleStack, 0, 0);

    // 2, 3, 4, 5. Métricas científicas idénticas a la imagen
    const addMetricCol = (col: number, label: string, m1: string, m2: string, c2 = '#38bdf8') => {
      const p = new GUI.StackPanel();
      p.isVertical = true;
      p.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;

      const l = new GUI.TextBlock();
      l.text = label;
      l.color = '#94a3b8';
      l.fontSize = 15;
      l.height = '20px';
      p.addControl(l);

      const v1 = new GUI.TextBlock();
      v1.text = m1;
      v1.color = '#cbd5e1';
      v1.fontSize = 16;
      v1.fontWeight = 'bold';
      v1.height = '22px';
      p.addControl(v1);

      const v2 = new GUI.TextBlock();
      v2.text = m2;
      v2.color = c2;
      v2.fontSize = 16;
      v2.fontWeight = 'bold';
      v2.height = '22px';
      p.addControl(v2);

      dockGrid.addControl(p, 0, col);
    };

    addMetricCol(1, 'Surface Area', 'Moon 0.27×', 'Mars 3.82×', '#38bdf8');
    addMetricCol(2, 'Gravity (vs Earth)', 'Moon 0.165×', 'Mars 0.38×', '#38bdf8');
    addMetricCol(3, 'Avg. Temperature', 'Moon -173 ~ 127 °C', 'Mars -125 ~ 20 °C', '#38bdf8');
    addMetricCol(4, 'Terrain Complexity', 'Moon Low – Medium', 'Mars Medium – High', '#34d399');

    // 6. Botón Full Comparison
    const btnFull = GUI.Button.CreateSimpleButton('btnFullCompDesk', '∞ Full Comparison →');
    btnFull.width = '280px';
    btnFull.height = '52px';
    btnFull.fontSize = 19;
    btnFull.fontWeight = 'bold';
    btnFull.cornerRadius = 26;
    btnFull.color = '#38bdf8';
    btnFull.background = 'rgba(14, 165, 233, 0.25)';
    btnFull.thickness = 1.5;
    btnFull.paddingRight = '20px';
    btnFull.onPointerClickObservable.add(() => { sound.playClick(750); this.callbacks.onFullComparison?.(); });
    dockGrid.addControl(btnFull, 0, 4);

    mainStack.addControl(dockBar);

    // Datos reales: el mismo modelo de terreno que la mesa de la web
    this.deskUnsub = terrainModel.subscribe((m) => this.updateDesk(m));
    this.scene.onBeforeRenderObservable.add(() => {
      if (!this.deskModel?.grid || !this.rootNode.isEnabled()) return;
      this.demFrame = (this.demFrame + 1) % 4;        // ~20 fps de giro bastan
      if (this.demFrame === 0) { this.dem3DAngle += 0.02; this.redrawDesk3DDEM(); }
    });
  }

  private demFrame = 0;
  private satSeq = 0;

  /** Rellena la mesa con el modelo de terreno real (o «—» si falta un dato). */
  private async updateDesk(m: TerrainModel | null) {
    this.deskModel = m;
    const loading = terrainModel.state === 'loading';
    if (this.deskSubBlock) {
      this.deskSubBlock.text = m
        ? `${m.siteName}${loading ? ' (recalculando…)' : ''}${m.center && !m.siteName.includes('°') ? ` · ${m.center.lat.toFixed(4)}°, ${m.center.lon.toFixed(4)}°` : ''}`
        : (terrainModel.state === 'error' ? `Sin modelo de terreno (${terrainModel.error})` : 'Cargando modelo de terreno…');
    }
    if (this.deskSimLabel) this.deskSimLabel.text = `Similarity (vs ${bodyName(m?.targetBody ?? null)})`;
    if (this.deskSimValue) this.deskSimValue.text = m?.similarityPct != null ? fmtNum(m.similarityPct, 1, '%') : '—';
    const vals = [elevationText(m), fmtNum(m?.metrics.slopeMean ?? null, 1, '°'), demSourceShort(m), radiusText(m)];
    this.deskRows.forEach((tb, i) => { tb.text = vals[i] ?? '—'; });
    this.redrawDesk3DDEM();

    // Imagen satelital real centrada en el sitio, con el anillo del radio
    const seq = ++this.satSeq;
    if (!m?.center || !this.deskSatImage) return;
    const W = 950, Hh = 450, radius = m.radiusM ?? 100;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = Hh;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#050a14';
    ctx.fillRect(0, 0, W, Hh);
    const mpp = await drawSatellite(ctx, W, Hh, m.center.lat, m.center.lon, zoomForRadius(m.center.lat, radius, Hh));
    if (seq !== this.satSeq) return;
    ctx.font = '20px monospace';
    ctx.fillStyle = 'rgba(2, 6, 23, 0.7)';
    ctx.fillRect(0, Hh - 32, W, 32);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(`${m.center.lat.toFixed(4)}°, ${m.center.lon.toFixed(4)}° · r ${radiusText(m)}`, 12, Hh - 9);
    ctx.fillStyle = '#22d3ee';
    ctx.fillText('Esri World Imagery', W - 230, Hh - 9);
    try { this.deskSatImage.source = cv.toDataURL('image/jpeg', 0.85); } catch { /* lienzo sin CORS: se queda vacío */ }
    if (this.deskRing) {
      const d = Math.max(12, Math.min(440, (2 * radius) / mpp));
      this.deskRing.width = `${d}px`;
      this.deskRing.height = `${d}px`;
    }
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
    const m = this.deskModel;
    ctx.textAlign = 'left';
    if (!m?.grid) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText(terrainModel.state === 'loading' ? 'Cargando DEM…' : 'Sin DEM', 60, H / 2);
      this.desk3DDynamicTex.update();
      return;
    }
    // Rejilla REAL del DEM del modelo (la misma que el «Entorno 3D»), en isométrico
    const exag = drawDemIso(ctx, W - 160, H - 60, m.grid, this.dem3DAngle, { margin: 0.05 });

    // Barra de color con las cotas reales del modelo
    const lo = m.metrics.elevMin, hi = m.metrics.elevMax;
    const barX = W - 100, barY = 80, barH = 500;
    const grad = ctx.createLinearGradient(0, barY, 0, barY + barH);
    grad.addColorStop(0, '#eaf0c8');
    grad.addColorStop(0.35, '#708e66');
    grad.addColorStop(0.7, '#205476');
    grad.addColorStop(1, '#10263c');
    ctx.fillStyle = grad;
    ctx.fillRect(barX, barY, 22, barH);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(barX, barY, 22, barH);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('Elev. (m)', barX - 10, barY - 15);
    if (lo != null && hi != null) {
      ctx.fillText(String(Math.round(hi)), barX + 30, barY + 15);
      ctx.fillText(String(Math.round((lo + hi) / 2)), barX + 30, barY + barH / 2);
      ctx.fillText(String(Math.round(lo)), barX + 30, barY + barH);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(`3D DEM (${demSourceShort(m)})`, 30, 45);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '18px monospace';
    const ex = exag >= 10 ? Math.round(exag) : exag.toFixed(1);
    ctx.fillText(`${m.grid.rows}×${m.grid.cols} pts · ~${Math.round(m.grid.spacingM)} m · vertical ×${ex}`, 30, H - 24);
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
      // En las gafas los paneles quedan FIJOS en la sala (cuelgan del «escenario» XR de
      // earthScene): si siguieran a la cabeza, al acercarte a leer la mesa se alejaría.
      // Se recolocan con A (recentrar) o agarrando con el grip.
      if (this.rootNode.parent) return;
      // Simulador de escritorio (sin gafas): acompaña a la cámara como antes
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
    if (this.orbitObserver) {
      this.scene.onBeforeRenderObservable.remove(this.orbitObserver);
      this.orbitObserver = null;
    }
    this.deskUnsub?.();
    this.deskUnsub = null;
    this.dynamicTextures.forEach(dt => dt.dispose());
    this.dynamicTextures = [];
    this.meshes.forEach(m => m.dispose());
    this.meshes = [];
    this.rootNode.dispose();
    this.pedestalRootNode.dispose();
  }
}
