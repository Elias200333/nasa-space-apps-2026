import * as BABYLON from 'babylonjs';
import * as GUI from 'babylonjs-gui';
import { BridgeError, RobotBridge } from '../robot/robotBridge';
import { elevationAt } from '../robot/terrainGrid';
import { terrainModel } from '../data/terrainModel';
import { button, column, createPanel, placeInFront, row, setEnabled, styleButton, text, XRPanel } from './xrPanelKit';
import type { Stick } from './questControls';

/**
 * Panel de la unidad terrestre (Go2) en las gafas: el mismo flujo que «Mapear zona subterránea» de
 * la web (robotMission.ts), con las MISMAS seguridades que la página de misión del robot:
 *   · «drive» solo mientras un joystick está inclinado, cada 100 ms (señal de hombre muerto del
 *     servidor), y «stop» al soltarlo, al salir del modo conducir, al cerrar el panel o la sesión;
 *   · el servidor recorta la velocidad a sus topes y solo acepta su lista blanca de órdenes;
 *   · desde las gafas (otro equipo) el robot exige el código de emparejamiento de 6 cifras.
 * Velocidad fija «lenta» (0,3 m/s · 0,25 m/s · 0,5 rad/s), la de inicio de misión de la web.
 */

const SPEED = { vx: 0.3, vy: 0.25, yaw: 0.5 };
type Phase = 'idle' | 'pairing' | 'connecting' | 'live' | 'finishing' | 'finished' | 'integrated';

export class XRRobotPanel {
  private bridge = new RobotBridge();
  private panel: XRPanel | null = null;
  private camMesh: BABYLON.Mesh | null = null;
  private camTex: BABYLON.DynamicTexture | null = null;
  private lidarMesh: BABYLON.Mesh | null = null;
  private lidarTex: BABYLON.DynamicTexture | null = null;
  private img: HTMLImageElement | null = null;
  private ws: WebSocket | null = null;
  private timers: number[] = [];

  private phase: Phase = 'idle';
  private driving = false;
  private controlOK = false;
  private moving = false;
  private sticks: { left: Stick; right: Stick } = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
  private connectedByUs = false;
  private code = '';
  private scanId = '';
  private cloudInfo = '';
  private depthM = 0;
  private headingDeg = 0;
  private lastStatus: any = null;

  // controles
  private statusTxt!: GUI.TextBlock;
  private infoTxt!: GUI.TextBlock;
  private actions!: GUI.StackPanel;
  private extraControls!: GUI.StackPanel;
  private keypad!: GUI.Grid;
  private codeTxt!: GUI.TextBlock;
  private pressedKeys = new Set<string>();

  constructor(private scene: BABYLON.Scene, private camera: () => BABYLON.Camera) {}

  isOpen() { return !!this.panel; }

  /** Lo llama QuestControls: con «Conducir» activo los joysticks vienen aquí (si no, null). */
  driveSink(): ((l: Stick, r: Stick) => void) | null {
    if (!this.panel || !this.driving) return null;
    return (left, right) => { this.sticks = { left, right }; this.sticksAt = performance.now(); };
  }

  /** Si las gafas dejan de pintar (quitártelas, pausa de la sesión) no llegan joysticks: se para. */
  private sticksAt = 0;
  private onHidden = () => { if (document.hidden) this.stopDriving(); };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.panel || !this.driving) return;
    const k = e.code;
    if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k)) {
      e.preventDefault();
      this.pressedKeys.add(k);
      this.updateKeyboardSticks();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (!this.panel) return;
    const k = e.code;
    if (this.pressedKeys.has(k)) {
      this.pressedKeys.delete(k);
      if (this.driving) {
        this.updateKeyboardSticks();
      }
    }
  };

  private updateKeyboardSticks() {
    if (!this.driving) return;
    if (this.pressedKeys.has('Space')) {
      this.stopDriving();
      return;
    }
    let vy = 0; // joystick left y: -1 adelante, +1 atrás
    let vx = 0; // joystick left x: -1 izq, +1 der
    let yaw = 0; // joystick right x: -1 girar izq, +1 girar der

    if (this.pressedKeys.has('KeyW') || this.pressedKeys.has('ArrowUp')) vy -= 1.0;
    if (this.pressedKeys.has('KeyS') || this.pressedKeys.has('ArrowDown')) vy += 1.0;
    if (this.pressedKeys.has('KeyQ')) vx -= 1.0;
    if (this.pressedKeys.has('KeyE')) vx += 1.0;
    if (this.pressedKeys.has('KeyA') || this.pressedKeys.has('ArrowLeft')) yaw -= 1.0;
    if (this.pressedKeys.has('KeyD') || this.pressedKeys.has('ArrowRight')) yaw += 1.0;

    this.sticks = {
      left: { x: vx, y: vy },
      right: { x: yaw, y: 0 },
    };
    this.sticksAt = performance.now();
  }

  toggle() { if (this.panel) this.close(); else this.open(); }

  open() {
    if (this.panel) return;
    const p = createPanel(this.scene, 'xrRobotPanel', 1.5, 1.2, null);
    this.panel = p;
    placeInFront(p.mesh, this.camera(), 1.35, 0.7, -0.05);

    const col = column(8);
    col.width = '1440px';
    col.paddingTop = '18px';
    col.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    p.root.addControl(col);

    const head = new GUI.Grid();
    head.height = '80px';
    head.addColumnDefinition(1);
    head.addColumnDefinition(110, true);
    const title = text('Unidad terrestre · Go2 — Mapear zona subterránea', 34, '#ffffff', true);
    title.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.paddingLeft = '24px';
    head.addControl(title, 0, 0);
    head.addControl(button('✕', () => this.close(), { width: '90px', height: '72px', kind: 'ghost' }), 0, 1);
    col.addControl(head);

    this.statusTxt = text('—', 24, '#94a3b8');
    this.statusTxt.height = '40px';
    this.statusTxt.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.statusTxt.paddingLeft = '24px';
    col.addControl(this.statusTxt);

    // hueco para la cámara y el LiDAR (son mallas aparte delante del panel: más nítidas que la GUI)
    const spacer = new GUI.Rectangle();
    spacer.height = '540px';
    spacer.thickness = 0;
    col.addControl(spacer);

    this.infoTxt = text('', 23, '#fde68a');
    this.infoTxt.height = '96px';
    this.infoTxt.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.infoTxt.paddingLeft = '24px';
    this.infoTxt.paddingRight = '24px';
    col.addControl(this.infoTxt);

    this.actions = row(14);
    this.actions.height = '90px';
    col.addControl(this.actions);

    this.extraControls = column(8);
    col.addControl(this.extraControls);

    // Teclado del código de emparejamiento (encima de la zona de cámara)
    this.keypad = new GUI.Grid();
    this.keypad.width = '620px';
    this.keypad.height = '520px';
    this.keypad.top = '40px';
    for (let i = 0; i < 3; i++) this.keypad.addColumnDefinition(1 / 3);
    for (let i = 0; i < 5; i++) this.keypad.addRowDefinition(1 / 5);
    this.codeTxt = text('······', 52, '#22d3ee', true);
    this.keypad.addControl(this.codeTxt, 0, 1);
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'];
    keys.forEach((k, i) => {
      const b = button(k, () => this.key(k), { width: '180px', height: '86px', size: 34, kind: k === 'OK' ? 'primary' : 'normal' });
      this.keypad.addControl(b, 1 + Math.floor(i / 3), i % 3);
    });
    this.keypad.isVisible = false;
    p.root.addControl(this.keypad);

    this.createViews(p.mesh);
    this.render();
    this.refresh();
    this.timers.push(window.setInterval(() => this.refresh(), 1000));
    this.timers.push(window.setInterval(() => this.driveTick(), 100));
    this.timers.push(window.setInterval(() => this.drawCamera(), 150));
    this.timers.push(window.setInterval(() => this.pollLidar(), 700));
    document.addEventListener('visibilitychange', this.onHidden);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  close() {
    this.stopDriving();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.pressedKeys.clear();
    document.removeEventListener('visibilitychange', this.onHidden);
    this.timers.forEach((t) => clearInterval(t));
    this.timers = [];
    try { this.ws?.close(); } catch { /* nada */ }
    this.ws = null;
    if (this.img) { this.img.removeAttribute('src'); this.img.remove(); this.img = null; }
    this.camTex?.dispose(); this.camMesh?.dispose();
    this.lidarTex?.dispose(); this.lidarMesh?.dispose();
    this.camTex = this.lidarTex = null;
    this.camMesh = this.lidarMesh = null;
    this.panel?.dispose();
    this.panel = null;
  }

  // ------------------------------------------------------------------ vistas: cámara y LiDAR
  private createViews(parent: BABYLON.Mesh) {
    const mk = (name: string, w: number, h: number, x: number) => {
      const m = BABYLON.MeshBuilder.CreatePlane(name, { width: w, height: h }, this.scene);
      m.parent = parent;
      // en el hueco reservado bajo el estado (y = +0,18 m) y un pelo por delante del panel
      m.position.set(x, 0.18, -0.005);
      const tex = new BABYLON.DynamicTexture(`${name}Tex`, { width: 640, height: Math.round((640 * h) / w) }, this.scene, true);
      const mat = new BABYLON.StandardMaterial(`${name}Mat`, this.scene);
      mat.diffuseTexture = tex;
      mat.emissiveTexture = tex;
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      m.material = mat;
      m.isPickable = false;
      return { m, tex };
    };
    const cam = mk('xrRobotCam', 0.82, 0.46, -0.32);
    const lid = mk('xrRobotLidar', 0.5, 0.46, 0.38);
    this.camMesh = cam.m; this.camTex = cam.tex;
    this.lidarMesh = lid.m; this.lidarTex = lid.tex;
    this.blank(this.camTex, 'Cámara del Go2: sin conexión');
    this.blank(this.lidarTex, 'LiDAR: sin datos');
  }

  private blank(tex: BABYLON.DynamicTexture | null, msg: string) {
    if (!tex) return;
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    const { width: w, height: h } = tex.getSize();
    ctx.fillStyle = '#050a14';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(msg, w / 2, h / 2);
    tex.update();
  }

  private drawCamera() {
    const tex = this.camTex;
    if (!tex) return;
    const connected = !!this.lastStatus?.connected;
    if (connected && !this.img) {
      this.img = document.createElement('img');
      this.img.style.display = 'none';
      document.body.appendChild(this.img);
      this.img.src = this.bridge.url('/video/stream');
    }
    if (!connected && this.img) { this.img.removeAttribute('src'); this.img.remove(); this.img = null; }
    if (!this.img || !this.img.naturalWidth) {
      this.blank(tex, connected ? 'Esperando vídeo del Go2…' : 'Cámara del Go2: sin conexión');
      return;
    }
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    const { width: w, height: h } = tex.getSize();
    try {
      ctx.drawImage(this.img, 0, 0, w, h);
      ctx.fillStyle = 'rgba(2, 6, 23, 0.6)';
      ctx.fillRect(0, h - 30, w, 30);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '18px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`cámara Go2 · ${this.driving ? 'CONDUCIENDO' : 'vista'}`, 10, h - 9);
      tex.update();
    } catch { /* fotograma a medias */ }
  }

  private async pollLidar() {
    const tex = this.lidarTex;
    if (!tex || !this.lastStatus?.connected) return;
    let d: any;
    try {
      const r = await fetch(this.bridge.url('/api/lidar'));
      if (!r.ok) return;
      d = await r.json();
    } catch { return; }
    if (!this.lidarTex || !d?.available || !Array.isArray(d.points) || d.points.length < 3) {
      this.blank(this.lidarTex, 'LiDAR: sin datos');
      return;
    }
    const pts: number[] = d.points;
    const n = Math.floor(pts.length / 3);
    let cx = 0, cy = 0, zMin = Infinity, zMax = -Infinity;
    for (let i = 0; i < n; i++) { cx += pts[3 * i]; cy += pts[3 * i + 1]; zMin = Math.min(zMin, pts[3 * i + 2]); zMax = Math.max(zMax, pts[3 * i + 2]); }
    cx /= n; cy /= n;
    let ext = 0.5;
    for (let i = 0; i < n; i++) ext = Math.max(ext, Math.abs(pts[3 * i] - cx), Math.abs(pts[3 * i + 1] - cy));
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    const { width: w, height: h } = tex.getSize();
    ctx.fillStyle = '#050a14';
    ctx.fillRect(0, 0, w, h);
    const s = (Math.min(w, h) * 0.45) / ext;
    const zr = Math.max(zMax - zMin, 0.01);
    for (let i = 0; i < n; i++) {
      const t = (pts[3 * i + 2] - zMin) / zr;
      ctx.fillStyle = `hsl(${Math.round(220 - t * 200)}, 90%, ${45 + t * 20}%)`;
      // planta: x del robot hacia arriba, y hacia la izquierda
      ctx.fillRect(w / 2 - (pts[3 * i + 1] - cy) * s - 1, h / 2 - (pts[3 * i] - cx) * s - 1, 2, 2);
    }
    ctx.fillStyle = 'rgba(2, 6, 23, 0.6)';
    ctx.fillRect(0, h - 56, w, 56);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '17px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`LiDAR · último mapa (planta)`, 10, h - 34);
    ctx.fillText(`${d.shown ?? n} de ${d.point_count ?? n} pts · ${(2 * ext).toFixed(1)} m`, 10, h - 12);
    tex.update();
  }

  // ------------------------------------------------------------------ estado y botones
  private async refresh() {
    try {
      this.lastStatus = await this.bridge.status();
      this.controlOK = !!this.lastStatus.control_available;
    } catch (e) {
      const err = e as BridgeError;
      this.lastStatus = null;
      this.controlOK = false;
      if (err.code === 'pairing_required' && this.phase !== 'pairing') { this.phase = 'pairing'; this.code = ''; }
    }
    if (!this.controlOK && this.driving) this.stopDriving();
    this.render();
  }

  private render() {
    if (!this.panel) return;
    const s = this.lastStatus;
    const batt = s?.robot_details?.battery?.soc_pct;
    this.statusTxt.text = s
      ? `${s.connected ? '● conectada' : '○ desconectada'} · batería ${batt == null ? '—' : Math.round(batt) + ' %'} · ${this.controlOK ? 'control disponible' : 'sin control'}${this.driving ? ' · CONDUCIENDO (suelta los joysticks para parar)' : ''}`
      : (this.phase === 'pairing' ? 'El robot pide el código de emparejamiento' : 'Sin respuesta del backend del robot');
    this.statusTxt.color = this.driving ? '#fbbf24' : (s?.connected ? '#34d399' : '#94a3b8');

    this.keypad.isVisible = this.phase === 'pairing';
    if (this.camMesh) this.camMesh.setEnabled(this.phase !== 'pairing');
    if (this.lidarMesh) this.lidarMesh.setEnabled(this.phase !== 'pairing');
    this.codeTxt.text = (this.code + '······').slice(0, 6).split('').join(' ');

    const a = this.actions;
    a.clearControls();
    this.extraControls.clearControls();
    const add = (b: GUI.Button) => a.addControl(b);
    if (this.phase === 'idle' || this.phase === 'integrated') {
      add(button(this.phase === 'integrated' ? 'Mapear otra zona' : 'Conectar y empezar recorrido', () => this.start(), { width: '520px', kind: 'primary' }));
      if (s?.connected) add(button('Desconectar', () => this.disconnect(), { width: '260px' }));
    } else if (this.phase === 'connecting' || this.phase === 'finishing') {
      add(button(this.phase === 'connecting' ? 'Conectando…' : 'Guardando el recorrido…', () => { /* espera */ }, { width: '520px', kind: 'ghost' }));
    } else if (this.phase === 'live') {
      const drv = button(this.driving ? 'Conducir: SÍ' : 'Conducir: NO', () => this.toggleDriving(), { width: '300px', kind: this.driving ? 'primary' : 'normal' });
      setEnabled(drv, this.controlOK);
      add(drv);
      add(button('■ Parar', () => this.stopDriving(), { width: '200px', kind: 'danger' }));
      add(button('Terminar recorrido', () => this.finish(), { width: '340px', kind: 'primary' }));

      // Si la conducción está activa, añadimos controles táctiles / virtuales WASD y de postura
      if (this.driving) {
        const driveRow = row(10);
        driveRow.height = '64px';

        const mkPressBtn = (label: string, vy: number, vx: number, yaw: number, w = '190px') => {
          const b = button(label, () => {}, { width: w, height: '58px', size: 20 });
          b.onPointerDownObservable.add(() => {
            this.sticks = { left: { x: vx, y: vy }, right: { x: yaw, y: 0 } };
            this.sticksAt = performance.now();
          });
          const clear = () => {
            this.sticks = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
            this.sticksAt = performance.now();
          };
          b.onPointerUpObservable.add(clear);
          b.onPointerOutObservable.add(clear);
          return b;
        };

        driveRow.addControl(mkPressBtn('▲ W Avanzar', -1.0, 0, 0));
        driveRow.addControl(mkPressBtn('▼ S Retroceder', 1.0, 0, 0));
        driveRow.addControl(mkPressBtn('◄ A Girar Izq', 0, 0, -1.0));
        driveRow.addControl(mkPressBtn('► D Girar Der', 0, 0, 1.0));
        driveRow.addControl(mkPressBtn('◀ Q Lateral', 0, -1.0, 0, '160px'));
        driveRow.addControl(mkPressBtn('▶ E Lateral', 0, 1.0, 0, '160px'));
        this.extraControls.addControl(driveRow);

        const postureRow = row(10);
        postureRow.height = '52px';
        const mkPostureBtn = (label: string, cmd: string) => {
          return button(label, () => this.sendPosture(cmd), { width: '220px', height: '46px', size: 18 });
        };
        postureRow.addControl(mkPostureBtn('🐕 Levantar', 'StandUp'));
        postureRow.addControl(mkPostureBtn('🐕 Sentar', 'StandDown'));
        postureRow.addControl(mkPostureBtn('🐕 Equilibrio', 'BalanceStand'));
        postureRow.addControl(mkPostureBtn('🐕 Amortiguar', 'Damp'));
        this.extraControls.addControl(postureRow);
      }
    } else if (this.phase === 'finished') {
      add(button('Prof. −', () => { this.depthM = Math.max(0, this.depthM - 1); this.render(); }, { width: '160px' }));
      add(button('Prof. +', () => { this.depthM = Math.min(60, this.depthM + 1); this.render(); }, { width: '160px' }));
      add(button('Rumbo −', () => { this.headingDeg = (this.headingDeg + 345) % 360; this.render(); }, { width: '170px' }));
      add(button('Rumbo +', () => { this.headingDeg = (this.headingDeg + 15) % 360; this.render(); }, { width: '170px' }));
      add(button('Integrar en el mapa 3D', () => this.integrate(), { width: '420px', kind: 'primary' }));
    }

    const help: Record<Phase, string> = {
      idle: 'Conecta el Go2 y empieza un recorrido. Luego activa «Conducir»: joystick IZQ. o W/S = avanzar / lateral, joystick DER. o A/D = girar. Al soltar se para (hombre muerto).',
      pairing: 'Escribe el código de 6 cifras que muestra la consola del robot (python -m terrainx_robot dashboard) o su panel «Diagnóstico».',
      connecting: 'Conectando a la unidad terrestre (hasta 30 s) y esperando su posición…',
      live: this.driving ? 'CONDUCIENDO (teclas W/A/S/D/Q/E, joysticks o botones táctiles). Suelta para parar (hombre muerto).' : 'Recorrido en marcha: el mapa LiDAR se va acumulando. Activa «Conducir» para mover el robot.',
      finishing: 'Guardando el mapa (PLY + GLB + coordenadas, SHA-256)…',
      finished: `${this.cloudInfo}  Anclaje DECLARADO en el centro del modelo de terreno: profundidad ${this.depthM} m · rumbo ${this.headingDeg}° (el robot no tiene GPS ni brújula).`,
      integrated: 'Cueva integrada en el mapa 3D (aparece en el «Entorno 3D» de la web). La unidad sigue conectada para mapear otra.',
    };
    if (!this.infoTxt.text.startsWith('⚠')) this.infoTxt.text = help[this.phase];
  }

  private note(msg: string) {
    this.infoTxt.text = msg ? `⚠ ${msg}` : '';
    if (!msg) this.render();
  }

  private key(k: string) {
    if (k === '⌫') this.code = this.code.slice(0, -1);
    else if (k === 'OK') {
      if (!/^\d{6}$/.test(this.code)) { this.note('El código tiene 6 cifras.'); return; }
      this.bridge.setCode(this.code);
      this.phase = 'idle';
      this.note('');
      this.start();
      return;
    } else if (this.code.length < 6) this.code += k;
    this.render();
  }

  // ------------------------------------------------------------------ misión
  private async start() {
    this.note('');
    this.phase = 'connecting';
    this.render();
    try {
      const hello = await this.bridge.hello();
      if (hello.pairing_required && !this.bridge.hasCode()) { this.phase = 'pairing'; this.code = ''; this.render(); return; }
      const st = await this.bridge.status();
      if (!st.connected) { await this.bridge.connect(); this.connectedByUs = true; }
      const m = terrainModel.current;
      const site = m?.center ? { name: m.siteName, lat: m.center.lat, lon: m.center.lon } : {};
      for (let i = 0; ; i++) {
        try { await this.bridge.missionStart(site); break; } catch (e) {
          if (!(e instanceof BridgeError) || e.code !== 'pose_not_ready' || i >= 15) throw e;
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      this.openControl();
      this.phase = 'live';
    } catch (e) {
      const err = e as BridgeError;
      if (err.code === 'pairing_required') {
        this.bridge.setCode('');
        this.phase = 'pairing';
        this.code = '';
        this.render();
        this.note('Código de emparejamiento no válido (tras 10 fallos el robot bloquea 60 s).');
        return;
      }
      this.phase = 'idle';
      this.render();
      this.note(`No se pudo conectar: ${[err.message, err.hint].filter(Boolean).join(' — ')}`);
      return;
    }
    this.render();
  }

  private async finish() {
    this.stopDriving();
    this.phase = 'finishing';
    this.render();
    try {
      const r = await this.bridge.missionFinish();
      this.scanId = r.scan.id;
      const c = await this.bridge.missionCloud(this.scanId);
      const ext = c.extent_local_m;
      const size = ext.max.map((v: number, i: number) => (v - ext.min[i]).toFixed(1)).join(' × ');
      this.cloudInfo = `Recorrido guardado: ${c.count.toLocaleString('es-ES')} cubos de ${c.cube_size_m * 100} cm · ${size} m (nube DERIVADA, sin cierre de bucles).`;
      this.phase = 'finished';
    } catch (e) {
      const err = e as BridgeError;
      this.phase = 'live';
      this.render();
      this.note(`No se pudo guardar el recorrido: ${err.message}${err.hint ? ' — ' + err.hint : ''}`);
      return;
    }
    this.render();
  }

  private async integrate() {
    const m = terrainModel.current;
    if (!m?.center || !this.scanId) { this.note('No hay modelo de terreno cargado donde colocar la cueva.'); return; }
    try {
      const surface = m.grid ? elevationAt(m.grid, 0, 0) : (m.metrics.elevMean ?? 0);
      await this.bridge.createCave({
        scan_id: this.scanId, lat: m.center.lat, lon: m.center.lon, surface_elev_m: surface,
        heading_deg: this.headingDeg, depth_m: this.depthM,
        site: { name: m.siteName, lat: m.center.lat, lon: m.center.lon }, terrain_source: m.htmlUrl,
      });
      this.phase = 'integrated';
      this.note('');
    } catch (e) {
      const err = e as BridgeError;
      this.note(`No se pudo integrar la cueva: ${err.message}${err.hint ? ' — ' + err.hint : ''}`);
    }
  }

  private async disconnect() {
    this.stopDriving();
    try { await this.bridge.disconnect(); } catch { /* nada */ }
    this.connectedByUs = false;
    this.refresh();
  }

  // ------------------------------------------------------------------ conducción (hombre muerto)
  private openControl() {
    if (this.ws && this.ws.readyState <= 1) return;
    const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    const sock = new WebSocket(proto + location.host + this.bridge.url('/ws/control'));
    sock.onclose = () => {
      if (this.ws === sock) this.ws = null;
      if (this.driving) this.stopDriving();
      if (this.panel && this.phase === 'live') setTimeout(() => this.openControl(), 1000);
    };
    this.ws = sock;
  }

  private send(msg: object) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  private sendPosture(command: string) {
    this.openControl();
    this.send({ type: 'posture', command });
  }

  private toggleDriving() {
    if (this.driving) { this.stopDriving(); return; }
    if (!this.controlOK) { this.note('El robot no da control ahora mismo.'); return; }
    this.openControl();
    this.driving = true;
    this.render();
  }

  private stopDriving() {
    const was = this.driving || this.moving;
    this.driving = false;
    this.moving = false;
    this.sticks = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
    if (was) this.send({ type: 'stop' });
    if (this.panel) this.render();
  }

  /** Cada 100 ms: con un joystick inclinado manda «drive»; al soltarlo, «stop». */
  private driveTick() {
    if (!this.driving) return;
    const fresh = performance.now() - this.sticksAt < 250;
    const { left, right } = fresh ? this.sticks : { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
    const vx = -left.y * SPEED.vx;        // joystick hacia delante (y < 0) → avanzar
    const vy = -left.x * SPEED.vy;        // a la derecha → desplazarse a la derecha (y del robot = izquierda)
    const yaw = -right.x * SPEED.yaw;     // a la derecha → girar a la derecha
    const active = Math.abs(vx) > 0.01 || Math.abs(vy) > 0.01 || Math.abs(yaw) > 0.01;
    if (active) {
      this.moving = true;
      this.send({ type: 'drive', vx, vy, yaw });
    } else if (this.moving) {
      this.moving = false;
      this.send({ type: 'stop' });
    }
  }
}
