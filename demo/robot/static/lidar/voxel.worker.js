// Origen: visor LiDAR «Bridge» aportado al equipo (2026-11-14). Copiado sin cambios.
// Web Worker del mapa LiDAR: descomprime cada mapa del robot y genera su malla
// de cubos (como la app de Unitree) FUERA del hilo de la interfaz. Devuelve los
// búferes por transferencia (sin copiar).
//
// Entrada:  { type: 'frame', buffer, srcSize, origin, resolution }   (buffer transferido)
//           { type: 'export' }   → centros de los vóxeles del último mapa
// Salida:   { type: 'mesh', pos, uv, faces, voxels, origin, resolution, floorZ, ms }
//           { type: 'export', points }
import { lz4DecompressBlock } from './lz4.js'
import { buildVoxelMesh, voxelCenters, MAX_FACES } from './voxelMesh.js'

const pos = new Uint8Array(MAX_FACES * 12)
const uv = new Uint8Array(MAX_FACES * 8)
let last = null

self.onmessage = ({ data: msg }) => {
  try {
    if (msg.type === 'frame') {
      const t0 = performance.now()
      const bits = lz4DecompressBlock(new Uint8Array(msg.buffer), msg.srcSize)
      const { origin, resolution } = msg
      const r = buildVoxelMesh(bits, Math.floor(origin[2] / resolution), pos, uv)
      last = { bits, origin, resolution }
      const p = pos.slice(0, r.faces * 12)
      const t = uv.slice(0, r.faces * 8)
      self.postMessage({
        type: 'mesh', pos: p, uv: t, faces: r.faces, voxels: r.voxels, origin, resolution,
        floorZ: origin[2] + (r.floorLayer + 1) * resolution,   // cara de arriba de los vóxeles del suelo
        ms: performance.now() - t0,
      }, [p.buffer, t.buffer])
    } else if (msg.type === 'export') {
      const points = last ? voxelCenters(last.bits, last.origin, last.resolution) : new Float32Array(0)
      self.postMessage({ type: 'export', points }, [points.buffer])
    }
  } catch (e) {
    self.postMessage({ type: 'error', message: String(e?.message || e) })
  }
}
