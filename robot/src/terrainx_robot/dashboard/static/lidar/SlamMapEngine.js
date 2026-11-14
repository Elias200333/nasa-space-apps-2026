// Origen: visor LiDAR «Bridge» aportado al equipo (2026-11-14). Único cambio: imports con
// extensión .js. Aquí el «Bridge» es el dashboard (terrainx_robot/lidar/slam_map.py).
import * as THREE from 'three'
import { MAX_FACES, quadIndices } from './voxelMesh.js'
import { voxelMaterial, plyBlob } from './LidarMapEngine.js'

// Mapa SLAM ACUMULADO (Bridge: services/slam_service.py). El Bridge junta los mapas del perro
// en un mapa del mundo por trozos de 6,4 × 6,4 m y manda los que cambian (como mucho uno por
// segundo, con la misma rejilla de bits que el mapa del perro). Aquí cada trozo es una malla
// (el Web Worker la genera con el mismo código y los mismos colores que el mapa en vivo); los
// que no cambian no se tocan.
//   · Si llega un trozo de otro mapa (epoch: «Borrar mapa» en otra pantalla), se tira todo.
//   · Como mucho un trozo en el worker; mientras trabaja, de cada trozo se queda el último.
class SlamMapEngine {
  constructor() {
    this.group = new THREE.Group()
    this.group.visible = false
    this.material = voxelMaterial()
    // Índices de las caras: los mismos números para todas las mallas (se comparte el array),
    // pero cada una con su atributo: al quitar un trozo, three borra su búfer de la GPU
    this.indices = quadIndices()
    this.chunks = new Map()      // key → { mesh, cap, voxels, floorZ, x0, y0, size }
    this.epoch = null
    this.queue = new Map()       // key → trozo esperando al worker
    this.busy = false
    this.paused = false
    this.lastInfoT = 0
    this._exportResolve = null
    this.worker = new Worker(new URL('./slam.worker.js', import.meta.url), { type: 'module' })
    this.worker.onmessage = ({ data }) => this._onWorker(data)
  }

  /** SLAM_INFO del Bridge (cada segundo mientras llegan mapas) */
  setInfo(info) {
    if (!info) return
    this.lastInfoT = performance.now()
    if (info.epoch !== this.epoch) this.clear(info.epoch)
  }

  /** Un trozo (mensaje binario SLAM_CHUNK); su buffer pasa al worker */
  ingest(head, payload) {
    if (this.paused) return
    if (head.epoch !== this.epoch) this.clear(head.epoch)
    this.queue.set(head.key, { head, payload })
    this._pump()
  }

  /** Todo fuera (mapa borrado, o se vuelve a pedir entero al abrir el visor) */
  clear(epoch = this.epoch) {
    this.epoch = epoch
    this.queue.clear()
    for (const c of this.chunks.values()) {
      this.group.remove(c.mesh)
      c.mesh.geometry.dispose()
    }
    this.chunks.clear()
    this.worker.postMessage({ type: 'clear' })
  }

  _pump() {
    if (this.busy || !this.queue.size) return
    const [key, { head, payload }] = this.queue.entries().next().value
    this.queue.delete(key)
    this.busy = true
    this.worker.postMessage({ type: 'chunk', key, epoch: head.epoch, buffer: payload, srcSize: head.src_size,
      origin: head.origin, resolution: head.resolution }, [payload])
  }

  _onWorker(msg) {
    if (msg.type === 'export') { this._exportResolve?.(msg.points); this._exportResolve = null; return }
    if (msg.type === 'error') console.warn('Mapa SLAM:', msg.message)
    if (msg.type === 'mesh' && msg.epoch === this.epoch) this._setChunk(msg)   // (de un mapa ya borrado: fuera)
    this.busy = false
    this._pump()
  }

  _setChunk(msg) {
    let c = this.chunks.get(msg.key)
    if (!msg.faces) {                                  // trozo vacío: fuera
      if (c) { this.group.remove(c.mesh); c.mesh.geometry.dispose(); this.chunks.delete(msg.key) }
      return
    }
    if (!c || c.cap < msg.faces) {                     // búferes con margen: no se rehacen en cada cambio
      const cap = Math.min(MAX_FACES, Math.ceil(msg.faces * 1.3) + 2048)
      const g = new THREE.BufferGeometry()
      const pos = new THREE.BufferAttribute(new Uint8Array(cap * 12), 3)
      const uv = new THREE.BufferAttribute(new Uint8Array(cap * 8), 2, true)
      pos.setUsage(THREE.DynamicDrawUsage)
      uv.setUsage(THREE.DynamicDrawUsage)
      g.setAttribute('position', pos)
      g.setAttribute('uv', uv)
      g.setIndex(new THREE.BufferAttribute(this.indices.subarray(0, cap * 6), 1))
      if (c) { this.group.remove(c.mesh); c.mesh.geometry.dispose() }
      const mesh = new THREE.Mesh(g, this.material)
      mesh.frustumCulled = false
      this.group.add(mesh)
      c = { mesh, cap }
      this.chunks.set(msg.key, c)
    }
    const g = c.mesh.geometry
    const pos = g.attributes.position, uv = g.attributes.uv
    pos.array.set(msg.pos, 0)
    uv.array.set(msg.uv, 0)
    pos.clearUpdateRanges(); uv.clearUpdateRanges()
    pos.addUpdateRange(0, msg.faces * 12)
    uv.addUpdateRange(0, msg.faces * 8)
    pos.needsUpdate = uv.needsUpdate = true
    g.setDrawRange(0, msg.faces * 6)
    // Rejilla → mundo: escala = resolución, posición = esquina del trozo (como el mapa en vivo)
    c.mesh.scale.setScalar(msg.resolution)
    c.mesh.position.set(msg.origin[0], msg.origin[1], msg.origin[2])
    Object.assign(c, { voxels: msg.voxels, floorZ: msg.floorZ, x0: msg.origin[0], y0: msg.origin[1],
                       size: 128 * msg.resolution })
  }

  /** Suelo (m) bajo el robot: el del trozo en el que está (el robot, la cuadrícula, la ruta y los clics) */
  floorZ(pose) {
    let best = null
    for (const c of this.chunks.values()) {
      const inside = pose && pose.x >= c.x0 && pose.x < c.x0 + c.size && pose.y >= c.y0 && pose.y < c.y0 + c.size
      if (inside && (!best || c.voxels > best.voxels)) best = c
    }
    if (best) this._floor = best.floorZ
    return this._floor ?? 0
  }

  get voxels() {
    let n = 0
    for (const c of this.chunks.values()) n += c.voxels
    return n
  }

  stats(fps) {
    return { voxels: this.voxels, fps, receiving: performance.now() - this.lastInfoT < 3000 }
  }

  /** Libera la GPU del visor que se cierra (las mallas se vuelven a subir al abrirlo) */
  releaseGpu() {
    for (const c of this.chunks.values()) c.mesh.geometry.dispose()
    this.material.dispose()
  }

  /** Mapa acumulado entero en .ply binario */
  async exportPly() {
    const pts = await new Promise((resolve) => { this._exportResolve = resolve; this.worker.postMessage({ type: 'export' }) })
    return plyBlob(pts)
  }
}

let engine = null
export const getSlamEngine = () => (engine ??= new SlamMapEngine())
