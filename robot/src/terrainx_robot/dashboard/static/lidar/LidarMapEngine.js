// Origen: visor LiDAR «Bridge» aportado al equipo (2026-11-14). Cambios para el dashboard
// (sin React): imports con extensión .js y la pausa es `engine.paused` en vez de useLidarStore.
import * as THREE from 'three'
import { MAX_FACES, quadIndices } from './voxelMesh.js'

// Mapa LiDAR como la app de Unitree: el robot manda su mapa de los ~6 m que le
// rodean y cada mapa nuevo SUSTITUYE al anterior (como mucho cada 150 ms, igual
// que la app). Se pinta con cubos coloreados por altura con la misma paleta.
//
// Para que la interfaz no se atasque:
//   · La malla la genera un Web Worker; aquí solo se copian sus búferes.
//   · UNA geometría reservada al inicio (MAX_FACES caras, índices fijos): nunca
//     se crea geometría nueva por mapa, solo se sube a la GPU lo que ocupa.
//   · Como mucho un mapa en el worker: si llegan más mientras trabaja, se queda
//     solo el último (los intermedios se descartan, sin colas).
const THROTTLE_MS = 150

// Paleta de la app (textura axisColor4.png): 32 franjas de 32 px, una por capa de
// 5 cm de altura absoluta + 10 (−0,5 m azul … ~1 m rojo). En la app cada franja
// lleva un borde gris (2 px a la izquierda, 1 px arriba y abajo) que pinta las
// aristas de los cubos; aquí las franjas van lisas y las aristas, con el mismo
// gris y grosor, las pinta el shader (EDGE_GLSL).
const SWATCHES = [0x0004ff, 0x002bff, 0x0055ff, 0x007bff, 0x00a6ff, 0x00ccff, 0x00f2ff, 0x00ffe1,
  0x00ffbb, 0x00ff6f, 0x00ff44, 0x00ff15, 0x15ff00, 0x95ff00, 0xbfff00, 0xeeff00, 0xffe100, 0xff9500,
  0xff7700, 0xff5e00, 0xff5100, 0x9500ff, 0xbf00ff, 0xff00c8, 0xff0095, 0xff0077, 0xff0059, 0xff003c,
  0xff003c, 0xff003c, 0xff003c, 0xff003c]

// Aristas de los cubos. Con el borde metido en la textura (como la app), de lejos
// cada vóxel ocupa 2-3 píxeles y las rayas grises se muestrean a saltos: el suelo
// se llena de anillos y ladrillos (muaré) y parece que hay otro mapa encima. Aquí
// se mide la distancia a la arista en píxeles de pantalla: de cerca es la raya gris
// de la app (mínimo 1 px, suavizada) y se desvanece cuando las caras miden menos
// de unos pocos píxeles, que es justo donde salía el muaré.
const EDGE_COLOR = new THREE.Color(0x7a7a7a)   // gris del borde de axisColor4 (lineal)
const EDGE_GLSL = /* glsl */`
#include <map_fragment>
{
  // Coordenadas 0..1 dentro de la cara: u recorre la franja (6/255) y v la cara entera
  vec2 f = vec2(vMapUv.x * (255.0 / 6.0), vMapUv.y);
  vec2 px = max(fwidth(f), vec2(1e-6));                 // un píxel, en caras
  vec2 dist = (0.5 - abs(fract(f) - 0.5)) / px;         // píxeles hasta la arista
  vec2 hw = max(vec2(1.0 / 32.0) / px, 0.5);            // media raya (1 px de 32 por cara), raya entera ≥ 1 px
  vec2 fade = smoothstep(3.0, 8.0, 1.0 / px);           // caras de menos de ~3 px: sin aristas
  vec2 cover = clamp(hw + 0.5 - dist, 0.0, 1.0) * fade;
  diffuseColor.rgb = mix(diffuseColor.rgb,
    vec3(${EDGE_COLOR.r.toFixed(4)}, ${EDGE_COLOR.g.toFixed(4)}, ${EDGE_COLOR.b.toFixed(4)}),
    max(cover.x, cover.y));
}`

function paletteTexture() {
  const c = Object.assign(document.createElement('canvas'), { width: 1360, height: 32 })
  const g = c.getContext('2d')
  SWATCHES.forEach((col, i) => {
    g.fillStyle = `#${col.toString(16).padStart(6, '0')}`
    g.fillRect(i * 32, 0, 32, 32)
  })
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  return tex
}

/** Material de los cubos (paleta de la app + aristas): lo usan el mapa en vivo y el acumulado */
export function voxelMaterial() {
  const material = new THREE.MeshBasicMaterial({ map: paletteTexture(), side: THREE.DoubleSide })
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', EDGE_GLSL)
  }
  return material
}

/** Centros de vóxeles (Float32 x,y,z) → .ply binario (CloudCompare, MeshLab…) con los colores de la app */
export function plyBlob(pts) {
  const n = pts.length / 3
  if (!n) return null
  const header = new TextEncoder().encode(
    'ply\nformat binary_little_endian 1.0\n' +
    `element vertex ${n}\nproperty float x\nproperty float y\nproperty float z\n` +
    'property uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n',
  )
  const body = new DataView(new ArrayBuffer(n * 15))
  for (let i = 0; i < n; i++) {
    const o = i * 15
    const col = paletteColor(pts[i * 3 + 2])
    body.setFloat32(o, pts[i * 3], true); body.setFloat32(o + 4, pts[i * 3 + 1], true); body.setFloat32(o + 8, pts[i * 3 + 2], true)
    body.setUint8(o + 12, col >> 16); body.setUint8(o + 13, (col >> 8) & 255); body.setUint8(o + 14, col & 255)
  }
  return new Blob([header, body.buffer], { type: 'application/octet-stream' })
}

/** Color de la app para el CENTRO de un vóxel a esa altura del mundo (m) */
export function paletteColor(z, resolution = 0.05) {
  const band = Math.min(Math.max(Math.floor(z / resolution - 0.5 + 1e-6) + 10, 0), 30)
  return SWATCHES[band]
}

class LidarMapEngine {
  constructor() {
    const geometry = new THREE.BufferGeometry()
    const pos = new THREE.BufferAttribute(new Uint8Array(MAX_FACES * 12), 3)
    const uv = new THREE.BufferAttribute(new Uint8Array(MAX_FACES * 8), 2, true)
    pos.setUsage(THREE.DynamicDrawUsage)
    uv.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', pos)
    geometry.setAttribute('uv', uv)
    geometry.setIndex(new THREE.BufferAttribute(quadIndices(), 1))
    geometry.setDrawRange(0, 0)
    this.material = voxelMaterial()
    this.mesh = new THREE.Mesh(geometry, this.material)
    this.mesh.frustumCulled = false   // el mapa entero está siempre a la vista
    this.mesh.visible = false

    this.pose = null
    this.floor = null          // m: cara de arriba del suelo (robot, cuadrícula, ruta)
    this.voxels = 0
    this.paused = false        // «Congelar el mapa»: los mapas que llegan se ignoran
    this.busy = false
    this.pending = null
    this.lastSent = 0
    this.timer = null
    this.lastFrameT = 0
    this._exportResolve = null

    this.worker = new Worker(new URL('./voxel.worker.js', import.meta.url), { type: 'module' })
    this.worker.onmessage = ({ data }) => this._onWorker(data)
  }

  /** Mapa de una LidarSource (su buffer pasa a ser nuestro: se transfiere al worker) */
  ingest(frame) {
    this.lastFrameT = performance.now()
    if (this.paused) return
    this.pending = frame                      // si había otro esperando, se descarta
    this._pump()
  }

  setPose(pose) { this.pose = pose }

  _pump() {
    if (this.busy || !this.pending || this.timer) return
    const wait = this.lastSent + THROTTLE_MS - performance.now()
    if (wait > 0) {
      this.timer = setTimeout(() => { this.timer = null; this._pump() }, wait)
      return
    }
    const f = this.pending
    this.pending = null
    this.busy = true
    this.lastSent = performance.now()
    this.worker.postMessage(
      { type: 'frame', buffer: f.buffer, srcSize: f.srcSize, origin: f.origin, resolution: f.resolution },
      [f.buffer],
    )
  }

  _onWorker(msg) {
    if (msg.type === 'export') { this._exportResolve?.(msg.points); this._exportResolve = null; return }
    if (msg.type === 'error') console.warn('LiDAR:', msg.message)
    if (msg.type === 'mesh') {
      const g = this.mesh.geometry
      const pos = g.attributes.position, uv = g.attributes.uv
      pos.array.set(msg.pos, 0)
      uv.array.set(msg.uv, 0)
      pos.clearUpdateRanges(); uv.clearUpdateRanges()
      pos.addUpdateRange(0, msg.faces * 12)
      uv.addUpdateRange(0, msg.faces * 8)
      pos.needsUpdate = uv.needsUpdate = true
      g.setDrawRange(0, msg.faces * 6)
      // Rejilla → mundo: escala = resolución, posición = origen (como la app)
      this.mesh.scale.setScalar(msg.resolution)
      this.mesh.position.set(msg.origin[0], msg.origin[1], msg.origin[2])
      this.mesh.visible = true
      this.floor = msg.floorZ
      this.voxels = msg.voxels
    }
    this.busy = false
    this._pump()
  }

  /** Suelo (m) para apoyar el robot, la cuadrícula, la ruta y los clics */
  floorZ() { return this.floor ?? 0 }

  stats(fps) {
    return { voxels: this.voxels, fps, receiving: performance.now() - this.lastFrameT < 3000 }
  }

  /** Libera la GPU del visor que se cierra (la malla se vuelve a subir al abrirlo) */
  releaseGpu() {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }

  /** Mapa actual en .ply binario (CloudCompare, MeshLab…) con los colores de la app */
  async exportPly() {
    const pts = await new Promise((resolve) => { this._exportResolve = resolve; this.worker.postMessage({ type: 'export' }) })
    return plyBlob(pts)
  }
}

let engine = null
export const getLidarEngine = () => (engine ??= new LidarMapEngine())
