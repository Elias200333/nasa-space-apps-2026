import * as BABYLON from 'babylonjs';
import * as GUI from 'babylonjs-gui';
import { sound } from '../audio';

/**
 * Piezas comunes de los paneles flotantes de las gafas (mismo estilo que xrSpatialUI.ts):
 * un plano con una textura GUI, fondo azul noche, borde cian y botones grandes para el rayo.
 * Escala: PX_PER_M píxeles de la textura por metro de panel.
 */
export const PX_PER_M = 1000;

export interface XRPanel {
  mesh: BABYLON.Mesh;
  adt: GUI.AdvancedDynamicTexture;
  root: GUI.Rectangle;
  dispose(): void;
}

export function createPanel(scene: BABYLON.Scene, name: string, widthM: number, heightM: number,
  parent: BABYLON.Node | null): XRPanel {
  const mesh = BABYLON.MeshBuilder.CreatePlane(name, { width: widthM, height: heightM }, scene);
  mesh.parent = parent;
  const w = Math.round(widthM * PX_PER_M), h = Math.round(heightM * PX_PER_M);
  const adt = GUI.AdvancedDynamicTexture.CreateForMesh(mesh, w, h, true);
  const mat = mesh.material as BABYLON.StandardMaterial;
  if (mat) { mat.backFaceCulling = false; mat.disableLighting = true; }
  const root = new GUI.Rectangle(`${name}Root`);
  root.width = `${w - 10}px`;
  root.height = `${h - 10}px`;
  root.cornerRadius = 26;
  root.color = 'rgba(34, 211, 238, 0.55)';
  root.thickness = 2;
  root.background = 'rgba(6, 12, 24, 0.94)';
  adt.addControl(root);
  return { mesh, adt, root, dispose: () => { adt.dispose(); mesh.dispose(); } };
}

export function text(t: string, size = 26, color = '#e2e8f0', bold = false): GUI.TextBlock {
  const tb = new GUI.TextBlock();
  tb.text = t;
  tb.fontSize = size;
  tb.color = color;
  tb.fontWeight = bold ? 'bold' : 'normal';
  tb.textWrapping = true;
  tb.resizeToFit = false;
  return tb;
}

export type ButtonKind = 'normal' | 'primary' | 'danger' | 'ghost';

export function button(label: string, onClick: () => void, opts: { width?: string; height?: string; kind?: ButtonKind; size?: number } = {}): GUI.Button {
  const b = GUI.Button.CreateSimpleButton(`btn_${label}_${Math.random().toString(36).slice(2, 7)}`, label);
  b.width = opts.width || '260px';
  b.height = opts.height || '74px';
  b.cornerRadius = 18;
  b.fontSize = opts.size || 26;
  b.fontWeight = 'bold';
  b.thickness = 2;
  styleButton(b, opts.kind || 'normal');
  b.onPointerClickObservable.add(() => {
    if (!b.isEnabled) return;
    sound.playClick(700);
    onClick();
  });
  return b;
}

export function styleButton(b: GUI.Button, kind: ButtonKind) {
  const s = {
    normal: ['rgba(30, 41, 59, 0.9)', 'rgba(56, 189, 248, 0.6)', '#e2e8f0'],
    primary: ['rgba(8, 145, 178, 0.95)', '#22d3ee', '#ffffff'],
    danger: ['rgba(127, 29, 29, 0.85)', '#f87171', '#fee2e2'],
    ghost: ['rgba(15, 23, 42, 0.6)', 'rgba(148, 163, 184, 0.4)', '#94a3b8'],
  }[kind];
  b.background = s[0];
  b.color = s[1];
  if (b.textBlock) b.textBlock.color = s[2];
}

export function setEnabled(b: GUI.Control, on: boolean) {
  b.isEnabled = on;
  b.alpha = on ? 1 : 0.4;
}

export function row(gapPx = 14): GUI.StackPanel {
  const r = new GUI.StackPanel();
  r.isVertical = false;
  r.spacing = gapPx;
  r.height = '84px';
  return r;
}

export function column(gapPx = 10): GUI.StackPanel {
  const c = new GUI.StackPanel();
  c.isVertical = true;
  c.spacing = gapPx;
  return c;
}

/** Coloca `mesh` delante de la cabeza (a `dist` m, con desplazamiento lateral/vertical) mirándola. */
export function placeInFront(mesh: BABYLON.TransformNode, camera: BABYLON.Camera, dist: number, side = 0, up = 0) {
  const cam = camera.globalPosition;
  const fwd = camera.getForwardRay().direction.clone();
  fwd.y = 0;
  if (fwd.lengthSquared() < 1e-6) fwd.set(0, 0, 1);
  fwd.normalize();
  const rightV = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), fwd).normalize();
  const target = cam.add(fwd.scale(dist)).add(rightV.scale(side)).add(new BABYLON.Vector3(0, up, 0));
  mesh.parent = null;
  mesh.position.copyFrom(target);
  // un plano de Babylon muestra su cara por -Z: se orienta con +Z alejándose del usuario
  mesh.rotation.set(0, Math.atan2(target.x - cam.x, target.z - cam.z), 0);
}
