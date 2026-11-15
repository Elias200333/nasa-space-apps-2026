import * as BABYLON from 'babylonjs';
import type { MissionCloud } from './robotBridge';
import { elevationAt, TerrainGrid } from './terrainGrid';

/**
 * Vista 3D de la nube del recorrido y del mapa combinado (terreno + zona subterránea).
 *
 * TODO en metros y a escala 1:1 en los tres ejes (sin la exageración vertical del Plotly):
 *   Babylon X = este, Y = arriba, Z = norte (origen = centro del modelo 3D a su cota).
 * La nube llega en el marco local de la misión (x adelante, y izquierda, z arriba; origen = robot
 * al empezar). Se coloca con un anclaje DECLARADO por el operador: desplazamiento este/norte
 * desde el centro, rumbo (hacia dónde miraba el robot al empezar, en grados desde el norte en
 * sentido horario) y profundidad bajo la superficie. El punto de partida (el suelo bajo el robot,
 * estimado) se apoya en la superficie del terreno y se baja la profundidad indicada.
 * Cada cubo mide lo que mide el vóxel del LiDAR (5 cm): misma escala que el terreno.
 */

export interface Placement {
  headingDeg: number;
  depthM: number;
  offsetE: number;
  offsetN: number;
}

const RAMP: [number, number, number][] = [
  [0.15, 0.25, 0.85], [0.1, 0.75, 0.95], [0.2, 0.85, 0.35], [0.95, 0.85, 0.2], [0.95, 0.35, 0.2],
];

function ramp(t: number): [number, number, number] {
  const x = Math.min(Math.max(t, 0), 1) * (RAMP.length - 1);
  const i = Math.min(Math.floor(x), RAMP.length - 2), f = x - i;
  const a = RAMP[i], b = RAMP[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export class FusionView {
  private engine: BABYLON.Engine;
  private scene: BABYLON.Scene;
  private camera: BABYLON.ArcRotateCamera;
  private scanRoot: BABYLON.TransformNode;
  private scanMesh: BABYLON.Mesh | null = null;
  private terrainMesh: BABYLON.Mesh | null = null;
  private terrainWire: BABYLON.Mesh | null = null;
  private anchorLine: BABYLON.LinesMesh | null = null;
  private xr: BABYLON.WebXRDefaultExperience | null = null;
  private cloud: MissionCloud | null = null;
  private terrain: TerrainGrid | null = null;
  private placement: Placement = { headingDeg: 0, depthM: 0, offsetE: 0, offsetN: 0 };
  private terrainAlpha = 0.45;
  private zoneM = 60;
  private onResize = () => this.engine.resize();

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0.027, 0.043, 0.078, 1);
    this.camera = new BABYLON.ArcRotateCamera('fusionCam', -Math.PI / 2.4, 1.05, 12, BABYLON.Vector3.Zero(), this.scene);
    this.camera.attachControl(canvas, true);
    this.camera.wheelDeltaPercentage = 0.02;
    this.camera.minZ = 0.05;
    this.camera.maxZ = 20000;
    this.camera.lowerRadiusLimit = 0.5;
    const light = new BABYLON.HemisphericLight('fusionLight', new BABYLON.Vector3(0.3, 1, 0.2), this.scene);
    light.intensity = 0.95;
    light.groundColor = new BABYLON.Color3(0.3, 0.32, 0.38);
    this.scanRoot = new BABYLON.TransformNode('scanRoot', this.scene);
    this.engine.runRenderLoop(() => this.scene.render());
    window.addEventListener('resize', this.onResize);
  }

  resize() { this.engine.resize(); }

  /** Nube del recorrido: un cubo de cube_size_m por punto, coloreado por altura. */
  setScan(cloud: MissionCloud) {
    this.cloud = cloud;
    this.scanMesh?.dispose();
    const size = cloud.cube_size_m || 0.05;
    const box = BABYLON.MeshBuilder.CreateBox('scanCube', { size }, this.scene);
    const mat = new BABYLON.StandardMaterial('scanMat', this.scene);
    mat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    box.material = mat;
    box.parent = this.scanRoot;
    const n = cloud.points.length;
    const floor = cloud.floor_z_local_m ?? 0;
    let zmin = Infinity, zmax = -Infinity;
    for (const p of cloud.points) { zmin = Math.min(zmin, p[2]); zmax = Math.max(zmax, p[2]); }
    const span = Math.max(zmax - zmin, 1e-6);
    const mats = new Float32Array(16 * n), cols = new Float32Array(4 * n);
    for (let i = 0; i < n; i++) {
      const [x, y, z] = cloud.points[i];
      // marco de la misión (x adelante, y izquierda, z arriba) → Babylon con rumbo 0 (adelante = norte)
      mats.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -y, z - floor, x, 1], 16 * i);
      const [r, g, b] = ramp((z - zmin) / span);
      cols.set([r, g, b, 1], 4 * i);
    }
    box.thinInstanceSetBuffer('matrix', mats, 16, true);
    box.thinInstanceSetBuffer('color', cols, 4, true);
    box.thinInstanceRefreshBoundingInfo(false);
    this.scanMesh = box;
    this.applyPlacement();
  }

  /** Terreno del modelo 3D (o null en la vista previa, solo la nube). */
  setTerrain(grid: TerrainGrid | null) {
    this.terrain = grid;
    this.buildTerrain();
    this.applyPlacement();
  }

  setPlacement(p: Partial<Placement>) {
    const moved = (p.offsetE !== undefined && p.offsetE !== this.placement.offsetE)
      || (p.offsetN !== undefined && p.offsetN !== this.placement.offsetN);
    this.placement = { ...this.placement, ...p };
    if (moved) this.buildTerrain();
    this.applyPlacement();
  }

  getPlacement(): Placement { return { ...this.placement }; }

  setTerrainAlpha(a: number) {
    this.terrainAlpha = a;
    if (this.terrainMesh?.material) this.terrainMesh.material.alpha = a;
  }

  /** Medio lado de la zona de terreno que se dibuja alrededor del anclaje (m); 0 = todo el modelo. */
  setZone(halfM: number) {
    this.zoneM = halfM;
    this.buildTerrain();
    const g = this.terrain;
    if (halfM <= 0 && g) {
      const half = Math.max(g.e[g.cols - 1] - g.e[0], g.n[(g.rows - 1) * g.cols] - g.n[0]) / 2;
      this.camera.target = new BABYLON.Vector3(this.placement.offsetE, this.surfaceAtAnchor(), this.placement.offsetN);
      this.camera.beta = 0.9;
      this.camera.radius = half * 2.2;
    } else {
      this.frameFusion();
    }
  }

  private surfaceAtAnchor(): number {
    if (!this.terrain) return 0;
    return elevationAt(this.terrain, this.placement.offsetE, this.placement.offsetN) - this.terrain.center.elev;
  }

  private applyPlacement() {
    const { headingDeg, depthM, offsetE, offsetN } = this.placement;
    this.scanRoot.rotation.y = (headingDeg * Math.PI) / 180;      // Babylon RotationY = giro horario visto desde arriba
    const top = this.surfaceAtAnchor();
    this.scanRoot.position.set(this.terrain ? offsetE : 0, this.terrain ? top - depthM : 0, this.terrain ? offsetN : 0);
    this.anchorLine?.dispose();
    this.anchorLine = null;
    if (this.terrain) {
      this.anchorLine = BABYLON.MeshBuilder.CreateLines('anchor', {
        points: [new BABYLON.Vector3(offsetE, top + 3, offsetN), new BABYLON.Vector3(offsetE, top - depthM, offsetN)],
      }, this.scene);
      this.anchorLine.color = new BABYLON.Color3(0.22, 0.74, 0.97);
    }
  }

  private buildTerrain() {
    this.terrainWire?.dispose();
    this.terrainMesh?.dispose();
    this.terrainWire = null;
    this.terrainMesh = null;
    const g = this.terrain;
    if (!g) return;
    const eMin = g.e[0], eMax = g.e[g.cols - 1], nMin = g.n[0], nMax = g.n[(g.rows - 1) * g.cols];
    const whole = this.zoneM <= 0;
    const cx = whole ? (eMin + eMax) / 2 : this.placement.offsetE;
    const cy = whole ? (nMin + nMax) / 2 : this.placement.offsetN;
    const half = whole ? Math.max(eMax - eMin, nMax - nMin) / 2 : this.zoneM;
    const N = Math.min(121, Math.max(2, Math.round((2 * half) / Math.max(half / 60, 0.5)) + 1));
    const step = (2 * half) / (N - 1);
    const positions: number[] = [], colors: number[] = [], indices: number[] = [];
    let zlo = Infinity, zhi = -Infinity;
    const ys: number[] = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const e = Math.min(Math.max(cx - half + c * step, eMin), eMax);
        const nn = Math.min(Math.max(cy - half + r * step, nMin), nMax);
        const y = elevationAt(g, e, nn) - g.center.elev;
        positions.push(e, y, nn);
        ys.push(y);
        zlo = Math.min(zlo, y); zhi = Math.max(zhi, y);
      }
    }
    const earth: [number, number, number][] = [[0.36, 0.55, 0.32], [0.62, 0.52, 0.34], [0.8, 0.72, 0.56], [0.93, 0.91, 0.86]];
    for (const y of ys) {                                      // paleta tipo «earth»: verde → marrón → claro
      const t = Math.min(Math.max((y - zlo) / Math.max(zhi - zlo, 1e-6), 0), 1) * (earth.length - 1);
      const i = Math.min(Math.floor(t), earth.length - 2), f = t - i, a = earth[i], b = earth[i + 1];
      colors.push(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, 1);
    }
    for (let r = 0; r < N - 1; r++) {
      for (let c = 0; c < N - 1; c++) {
        const a = r * N + c, b = a + 1, d = a + N, e2 = d + 1;
        indices.push(a, d, b, b, d, e2);
      }
    }
    const normals: number[] = [];
    BABYLON.VertexData.ComputeNormals(positions, indices, normals);
    const vd = new BABYLON.VertexData();
    vd.positions = positions; vd.indices = indices; vd.normals = normals; vd.colors = colors;
    const mesh = new BABYLON.Mesh('terrain', this.scene);
    vd.applyToMesh(mesh);
    const mat = new BABYLON.StandardMaterial('terrainMat', this.scene);
    mat.backFaceCulling = false;
    mat.alpha = this.terrainAlpha;
    mat.specularColor = new BABYLON.Color3(0.02, 0.02, 0.02);
    mat.emissiveColor = new BABYLON.Color3(0.28, 0.28, 0.28);   // que se lea sobre el fondo oscuro
    mesh.material = mat;
    this.terrainMesh = mesh;
    // malla de líneas de la rejilla dibujada: da la escala y deja ver la nube por debajo
    const wire = mesh.clone('terrainWire');
    const wmat = new BABYLON.StandardMaterial('terrainWireMat', this.scene);
    wmat.wireframe = true;
    wmat.disableLighting = true;
    wmat.emissiveColor = new BABYLON.Color3(0.13, 0.83, 0.93);
    wmat.alpha = 0.16;
    wire.material = wmat;
    wire.isPickable = false;
    this.terrainWire = wire;
  }

  private scanSphere(): { center: BABYLON.Vector3; r: number } | null {
    if (!this.scanMesh) return null;
    this.scanRoot.computeWorldMatrix(true);
    this.scanMesh.computeWorldMatrix(true);
    const s = this.scanMesh.getBoundingInfo().boundingSphere;
    return { center: s.centerWorld.clone(), r: s.radiusWorld };
  }

  /** Encuadra la nube. Con terreno, la cámara queda POR ENCIMA de la superficie y mira la nube
   *  a través del terreno semitransparente. */
  frame() {
    const s = this.scanSphere();
    if (!s) return;
    this.camera.target = s.center;
    this.camera.beta = 0.8;
    this.camera.radius = Math.max(s.r * 2.4, 3);
    this.keepCameraAboveTerrain();
  }

  /** Aleja la cámara (misma dirección) hasta que quede ≥ 3 m por encima del terreno que tiene debajo. */
  private keepCameraAboveTerrain() {
    const g = this.terrain;
    if (!g) return;
    const cam = this.camera;
    for (let i = 0; i < 40; i++) {
      const sb = Math.sin(cam.beta), x = cam.target.x + cam.radius * Math.cos(cam.alpha) * sb;
      const z = cam.target.z + cam.radius * Math.sin(cam.alpha) * sb, y = cam.target.y + cam.radius * Math.cos(cam.beta);
      if (y > elevationAt(g, x, z) - g.center.elev + 3) return;
      cam.radius *= 1.15;
    }
  }

  /** Vista combinada: la superficie en el anclaje y la nube debajo, con la cámara por encima. */
  frameFusion() {
    const s = this.scanSphere();
    if (!s || !this.terrain) { this.frame(); return; }
    const top = this.surfaceAtAnchor();
    this.camera.target = new BABYLON.Vector3(this.placement.offsetE, (top + s.center.y) / 2, this.placement.offsetN);
    this.camera.beta = 0.9;
    this.camera.radius = Math.max(s.r * 3, this.placement.depthM * 2.2 + 12, 18);
    this.keepCameraAboveTerrain();
  }

  static async xrSupported(): Promise<boolean> {
    const xr = (navigator as any).xr;
    if (!xr || !window.isSecureContext) return false;
    try { return await xr.isSessionSupported('immersive-vr'); } catch { return false; }
  }

  /** Entra en realidad virtual: la nube y el terreno a tamaño real alrededor del usuario. */
  async enterVR() {
    if (!this.xr) {
      this.xr = await this.scene.createDefaultXRExperienceAsync({
        floorMeshes: this.terrainMesh ? [this.terrainMesh] : [],
        disableDefaultUI: true,
      });
    }
    await this.xr.baseExperience.enterXRAsync('immersive-vr', 'local-floor');
  }

  /** Mapa combinado para descargar: cubos en metros este/norte/cota absoluta + procedencia. */
  exportCombined(extra: Record<string, unknown>) {
    const cloud = this.cloud, g = this.terrain;
    if (!cloud || !g) throw new Error('falta la nube o el terreno');
    const { headingDeg, depthM, offsetE, offsetN } = this.placement;
    const th = (headingDeg * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
    const floor = cloud.floor_z_local_m ?? 0;
    const base = this.surfaceAtAnchor() - depthM + g.center.elev;
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    const points = cloud.points.map(([x, y, z]) => {
      const X0 = -y, Z0 = x;                                     // rumbo 0: adelante = norte
      return [r3(offsetE + X0 * c + Z0 * s), r3(offsetN - X0 * s + Z0 * c), r3(base + z - floor)];
    });
    const surface = { rows: g.rows, cols: g.cols, east_m: Array.from(g.e, r3), north_m: Array.from(g.n, r3), elevation_m: Array.from(g.z, r3) };
    return {
      type: 'terrainx.mapa_combinado',
      version: 1,
      created_utc: new Date().toISOString(),
      ...extra,
      frame: 'este/norte en m desde el centro del modelo 3D; cota absoluta en m (la del modelo de elevación)',
      center: g.center,
      anchor: { offset_east_m: offsetE, offset_north_m: offsetN, heading_deg: headingDeg, depth_m: depthM,
        declared_by: 'operador (el robot no tiene GPS ni brújula)' },
      scale: '1:1 en metros: la nube conserva las distancias del LiDAR (unidad m asumida, sin verificar con cinta)',
      surface: { source: g.sourceUrl, resolution_m: r3(g.spacingM), evidence: 'modelo de elevación del sitio (data/)', ...surface },
      subsurface: { scan_id: cloud.scan_id, mission_id: cloud.mission_id, evidence_class: cloud.evidence_class,
        cube_size_m: cloud.cube_size_m, count: points.length, points_enu_m: points },
      caveats: [
        'DEMOSTRACIÓN: la posición de la zona subterránea la declara el operador; no está georreferenciada.',
        `El terreno tiene la resolución del modelo 3D (~${Math.round(g.spacingM)} m entre puntos); la nube del robot, cubos de ${cloud.cube_size_m} m.`,
        'La nube es DERIVADA (mapa acumulado del Go2, sin cierre de bucles).',
      ],
    };
  }

  dispose() {
    window.removeEventListener('resize', this.onResize);
    this.terrainWire?.dispose();
    try { this.xr?.dispose(); } catch { /* nada */ }
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}
