import * as BABYLON from 'babylonjs';

/**
 * TERRAIN-X · WebXR 6DoF Motion Controller Handler (Meta Quest Touch Plus / Pro)
 * NASA Space Apps Challenge 2026
 *
 * Interaction Mapping:
 *  - Primary Trigger: Raycast pointer button click; when targeting the planet, grabs surface rotation.
 *  - Left Thumbstick: Rotates (X) and tilts (Y) the central planetary body.
 *  - Right Thumbstick: Y-axis scales planet zoom; X-axis rotates the entire holographic stage.
 *  - Grip Button (any): Translates and re-positions the entire room-scale stage in physical space.
 *  - Button A: Recenter spatial cockpit directly in front of the operator's current head pose.
 *  - Button B: Toggles spatial holographic panels on/off to declutter the visual field.
 *  - Button X: Resets planet scale and view framing to default planetary coordinates.
 *  - Button Y: Toggles the Unitree Go2 Quadruped Robot teleoperation panel.
 *
 * Teleoperation Overrides:
 *  - When the robot driving mode is active, thumbsticks are diverted to `driveSink()` (vx, vy, yaw)
 *    and enforce a strict 100ms dead-man safety timeout.
 */

export interface Stick { x: number; y: number }

export interface QuestControlHooks {
  /** Root transform node of the entire spatial stage (globe + UI panels), translated by grip/A. */
  stage: BABYLON.TransformNode;
  isPlanetMesh(mesh: BABYLON.AbstractMesh): boolean;
  /** World position center and radius (meters) for sphere raycast alignment. */
  planetCenter(): BABYLON.Vector3;
  planetRadius(): number;
  spinTiltBy(dSpin: number, dTilt: number): void;
  zoomBy(factor: number): void;
  stopAutoRotate(): void;
  recenter(): void;
  togglePanels(): void;
  fitPlanet(): void;
  toggleRobotPanel(): void;
  /** When non-null, thumbstick inputs drive the robot rather than orbiting the planetary sphere. */
  driveSink(): ((left: Stick, right: Stick) => void) | null;
}

const DEAD = 0.15;
const dz = (v: number) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

interface Hand {
  source: BABYLON.WebXRInputSource;
  mc: BABYLON.WebXRAbstractMotionController | null;
  handed: 'left' | 'right' | 'none';
  prev: Record<string, boolean>;
  grabPlanet: { yaw: number; pitch: number } | null;
  grabStage: { ctrl: BABYLON.Vector3; stage: BABYLON.Vector3 } | null;
}

export class QuestControls {
  private hands = new Map<string, Hand>();
  private ray = new BABYLON.Ray(BABYLON.Vector3.Zero(), BABYLON.Vector3.Forward());
  private observer: BABYLON.Nullable<BABYLON.Observer<BABYLON.Scene>> = null;

  constructor(private scene: BABYLON.Scene, private xr: BABYLON.WebXRDefaultExperience, private hooks: QuestControlHooks) {
    xr.input.controllers.forEach((c) => this.add(c));
    xr.input.onControllerAddedObservable.add((c) => this.add(c));
    xr.input.onControllerRemovedObservable.add((c) => this.hands.delete(c.uniqueId));
    this.observer = scene.onBeforeRenderObservable.add(() => this.update());
  }

  dispose() {
    if (this.observer) this.scene.onBeforeRenderObservable.remove(this.observer);
    this.observer = null;
    this.hands.clear();
  }

  private add(source: BABYLON.WebXRInputSource) {
    const hand: Hand = {
      source, mc: null, handed: (source.inputSource.handedness as any) || 'none',
      prev: {}, grabPlanet: null, grabStage: null,
    };
    this.hands.set(source.uniqueId, hand);
    source.onMotionControllerInitObservable.add((mc) => { hand.mc = mc; });
    if (source.motionController) hand.mc = source.motionController;
  }

  // ------------------------------------------------------------------ utilidades
  private pressed(h: Hand, id: string): boolean {
    const c = h.mc?.getComponent(id);
    return !!c && c.pressed;
  }

  /** true solo en el fotograma en que se pulsa (flanco de subida). */
  private edge(h: Hand, id: string, now: boolean): boolean {
    const was = !!h.prev[id];
    h.prev[id] = now;
    return now && !was;
  }

  private stick(h: Hand | undefined): Stick {
    const c = h?.mc?.getComponentOfType(BABYLON.WebXRControllerComponent.THUMBSTICK_TYPE)
      || h?.mc?.getComponentOfType(BABYLON.WebXRControllerComponent.TOUCHPAD_TYPE);
    if (!c) return { x: 0, y: 0 };
    return { x: dz(c.axes.x), y: dz(c.axes.y) };
  }

  /** Dirección del rayo en el marco del holograma (el usuario mira hacia +Z de ese marco). */
  private localAngles(dirWorld: BABYLON.Vector3): { yaw: number; pitch: number } {
    const inv = this.hooks.stage.getWorldMatrix().clone().invert();
    const d = BABYLON.Vector3.TransformNormal(dirWorld, inv).normalize();
    return { yaw: Math.atan2(d.x, d.z), pitch: Math.asin(Math.max(-1, Math.min(1, d.y))) };
  }

  private byHand(which: 'left' | 'right'): Hand | undefined {
    for (const h of this.hands.values()) if (h.handed === which) return h;
    return undefined;
  }

  // ------------------------------------------------------------------ cada fotograma
  private lastT = 0;

  private update() {
    // Tiempo entre fotogramas medido aquí (no depende del bucle del motor); entre 1/120 y 1/20 s
    const now = performance.now();
    const dt = this.lastT ? Math.max(1 / 120, Math.min(0.05, (now - this.lastT) / 1000)) : 1 / 72;
    this.lastT = now;
    const H = this.hooks;

    for (const h of this.hands.values()) {
      if (!h.mc) continue;
      h.source.getWorldPointerRayToRef(this.ray);

      // --- Gatillo: agarrar el planeta si es lo PRIMERO que toca el rayo (no un panel delante)
      const trig = this.pressed(h, 'xr-standard-trigger');
      if (this.edge(h, 'trigger', trig)) {
        const hit = this.scene.pickWithRay(this.ray, (m) => m.isPickable && m.isEnabled() && m.isVisible);
        if (hit?.hit && hit.pickedMesh && H.isPlanetMesh(hit.pickedMesh)) {
          h.grabPlanet = this.localAngles(this.ray.direction);
          H.stopAutoRotate();
        }
      }
      if (!trig) h.grabPlanet = null;
      if (h.grabPlanet) {
        const a = this.localAngles(this.ray.direction);
        // Ganancia distancia/radio: un punto de la superficie se mueve lo mismo que el rayo
        const dist = BABYLON.Vector3.Distance(this.ray.origin, H.planetCenter());
        const gain = Math.max(1, Math.min(6, dist / Math.max(0.05, H.planetRadius())));
        let dYaw = a.yaw - h.grabPlanet.yaw;
        if (dYaw > Math.PI) dYaw -= 2 * Math.PI;
        if (dYaw < -Math.PI) dYaw += 2 * Math.PI;
        const dPitch = a.pitch - h.grabPlanet.pitch;
        // Rayo a la derecha → superficie a la derecha (giro negativo); rayo arriba → superficie arriba
        H.spinTiltBy(-dYaw * gain, dPitch * gain);
        h.grabPlanet = a;
      }

      // --- Grip: agarrar y mover el holograma entero
      const grip = this.pressed(h, 'xr-standard-squeeze');
      const pos = (h.source.grip || h.source.pointer).getAbsolutePosition().clone();
      if (this.edge(h, 'grip', grip)) h.grabStage = { ctrl: pos, stage: H.stage.position.clone() };
      if (!grip) h.grabStage = null;
      if (h.grabStage) H.stage.position.copyFrom(h.grabStage.stage.add(pos.subtract(h.grabStage.ctrl)));

      // --- Botones
      if (this.edge(h, 'a', this.pressed(h, 'a-button'))) H.recenter();
      if (this.edge(h, 'b', this.pressed(h, 'b-button'))) H.togglePanels();
      if (this.edge(h, 'x', this.pressed(h, 'x-button'))) H.fitPlanet();
      if (this.edge(h, 'y', this.pressed(h, 'y-button'))) H.toggleRobotPanel();
    }

    // --- Joysticks
    const left = this.stick(this.byHand('left'));
    const right = this.stick(this.byHand('right'));
    const drive = H.driveSink();
    if (drive) {
      drive(left, right);          // el panel del robot decide (hombre muerto incluido)
      return;
    }
    if (left.x || left.y) {
      H.stopAutoRotate();
      // empujar a la derecha → superficie a la derecha; hacia delante (y < 0) → superficie arriba
      H.spinTiltBy(-left.x * 1.8 * dt, -left.y * 1.2 * dt);
    }
    if (right.y) H.zoomBy(Math.exp(-right.y * 0.9 * dt));
    if (right.x) this.rotateStageAroundHead(-right.x * 1.2 * dt);
  }

  /** Gira el holograma alrededor de la cabeza del usuario (como girar sobre uno mismo). */
  private rotateStageAroundHead(angle: number) {
    const cam = this.xr.baseExperience.camera;
    const head = cam.globalPosition;
    const st = this.hooks.stage;
    const rel = st.position.subtract(head);
    const c = Math.cos(angle), s = Math.sin(angle);
    st.position.x = head.x + rel.x * c + rel.z * s;
    st.position.z = head.z - rel.x * s + rel.z * c;
    st.rotation.y += angle;
  }
}
