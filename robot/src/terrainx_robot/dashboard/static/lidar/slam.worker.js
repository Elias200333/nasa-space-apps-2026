// Origen: visor LiDAR «Bridge» aportado al equipo (2026-11-14). Copiado sin cambios
// (aquí el «Bridge» es el dashboard: terrainx_robot/lidar/slam_map.py).
// Web Worker del mapa SLAM ACUMULADO: cada trozo que manda el Bridge (128 × 128 vóxeles ×
// 64 capas, misma rejilla de bits que el mapa del perro) se descomprime y se convierte en su
// malla de cubos con el mismo código que el mapa en vivo (mismos colores). Se guarda la
// rejilla de cada trozo para poder exportar el mapa entero.
//
// Entrada:  { type: 'chunk', key, buffer, srcSize, origin, resolution }   (buffer transferido;
//             srcSize 0 = el trozo se ha quedado vacío)
//           { type: 'clear' } · { type: 'export' }
// Salida:   { type: 'mesh', key, epoch, pos, uv, faces, voxels, origin, resolution, floorZ }
//           { type: 'export', points }
import { lz4DecompressBlock } from './lz4.js'
import { buildVoxelMesh, voxelCenters, MAX_FACES } from './voxelMesh.js'

const pos = new Uint8Array(MAX_FACES * 12)
const uv = new Uint8Array(MAX_FACES * 8)
const chunks = new Map()   // key → { bits, origin, resolution }

self.onmessage = ({ data: msg }) => {
  try {
    if (msg.type === 'chunk') {
      const { key, epoch, origin, resolution } = msg
      if (!msg.srcSize) {
        chunks.delete(key)
        self.postMessage({ type: 'mesh', key, epoch, faces: 0, voxels: 0 })
        return
      }
      const bits = lz4DecompressBlock(new Uint8Array(msg.buffer), msg.srcSize)
      const r = buildVoxelMesh(bits, Math.floor(origin[2] / resolution), pos, uv)
      chunks.set(key, { bits, origin, resolution })
      const p = pos.slice(0, r.faces * 12)
      const t = uv.slice(0, r.faces * 8)
      self.postMessage({
        type: 'mesh', key, epoch, pos: p, uv: t, faces: r.faces, voxels: r.voxels, origin, resolution,
        floorZ: origin[2] + (r.floorLayer + 1) * resolution,   // cara de arriba de los vóxeles del suelo
      }, [p.buffer, t.buffer])
    } else if (msg.type === 'clear') {
      chunks.clear()
    } else if (msg.type === 'export') {
      const parts = [...chunks.values()].map((c) => voxelCenters(c.bits, c.origin, c.resolution))
      const points = new Float32Array(parts.reduce((n, a) => n + a.length, 0))
      let o = 0
      for (const a of parts) { points.set(a, o); o += a.length }
      self.postMessage({ type: 'export', points }, [points.buffer])
    }
  } catch (e) {
    self.postMessage({ type: 'error', message: String(e?.message || e) })
  }
}
