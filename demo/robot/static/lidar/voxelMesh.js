// Origen: visor LiDAR «Bridge» aportado al equipo (2026-11-14). Copiado sin cambios.
// Malla de cubos del mapa de vóxeles del Go2, igual que la app de Unitree
// (comprobado cara a cara contra libvoxel.wasm, su decodificador, con mapas reales).
//
// Entrada: la rejilla de ocupación por bits ya descomprimida (128 × 128 × capas):
//   byte i → z = i >> 11, y = (i & 2047) >> 4, x = (i & 15)·8 + bit (MSB primero)
// Salida, por cada cara de un vóxel que da a un hueco (las interiores no se ven):
//   · 4 vértices en coordenadas de la rejilla (Uint8, 0…128): el mundo es
//     origin + vértice × resolution (se aplica en la GPU con escala y posición)
//   · 4 uvs (Uint8, normalizados): u = 6·franja … 6·franja + 6, v = 0 … 255,
//     franja = capa absoluta (capa + floor(origin.z / resolution)) + 10, de 0 a 30.
//     Cada franja es un color de la textura de la app, con su borde gris (aristas).
//   · índices: 2 triángulos por cara [0, 1, 2, 2, 1, 3] (fijos, se preparan una vez)

export const MAX_FACES = 240_000   // como la app (su búfer de libvoxel)

/**
 * @param {Uint8Array} bits  rejilla descomprimida
 * @param {number} zNorm     floor(origin.z / resolution)
 * @param {Uint8Array} pos   salida: MAX_FACES · 12
 * @param {Uint8Array} uv    salida: MAX_FACES · 8
 * @returns {{ faces: number, voxels: number, floorLayer: number }}
 */
export function buildVoxelMesh(bits, zNorm, pos, uv) {
  const layers = bits.length >> 11
  const occ = (x, y, z) =>
    x >= 0 && x < 128 && y >= 0 && y < 128 && z >= 0 && z < layers &&
    (bits[(z << 11) | (y << 4) | (x >> 3)] & (128 >> (x & 7))) !== 0
  const hist = new Uint32Array(layers)
  let f = 0
  let voxels = 0

  // Una cara: vértices (a0,b0) (a0,b1) (a1,b0) (a1,b1); u recorre «a», v recorre «b»
  const quad = (x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3, u0, u1) => {
    if (f >= MAX_FACES) return
    const p = f * 12, t = f * 8
    pos[p] = x0; pos[p + 1] = y0; pos[p + 2] = z0
    pos[p + 3] = x1; pos[p + 4] = y1; pos[p + 5] = z1
    pos[p + 6] = x2; pos[p + 7] = y2; pos[p + 8] = z2
    pos[p + 9] = x3; pos[p + 10] = y3; pos[p + 11] = z3
    uv[t] = u0; uv[t + 1] = 0
    uv[t + 2] = u0; uv[t + 3] = 255
    uv[t + 4] = u1; uv[t + 5] = 0
    uv[t + 6] = u1; uv[t + 7] = 255
    f++
  }

  for (let i = 0; i < bits.length; i++) {
    const b = bits[i]
    if (b === 0) continue
    const z = i >> 11, y = (i & 2047) >> 4, x0 = (i & 15) << 3
    for (let bit = 0; bit < 8; bit++) {
      if (!(b & (128 >> bit))) continue
      const x = x0 + bit
      voxels++
      hist[z]++
      const band = Math.min(Math.max(z + zNorm + 10, 0), 30)
      const u0 = band * 6, u1 = u0 + 6
      // Caras verticales: u sube con la altura; caras horizontales: u recorre x
      if (!occ(x - 1, y, z)) quad(x, y, z, x, y + 1, z, x, y, z + 1, x, y + 1, z + 1, u0, u1)
      if (!occ(x + 1, y, z)) quad(x + 1, y, z, x + 1, y + 1, z, x + 1, y, z + 1, x + 1, y + 1, z + 1, u0, u1)
      if (!occ(x, y - 1, z)) quad(x, y, z, x + 1, y, z, x, y, z + 1, x + 1, y, z + 1, u0, u1)
      if (!occ(x, y + 1, z)) quad(x, y + 1, z, x + 1, y + 1, z, x, y + 1, z + 1, x + 1, y + 1, z + 1, u0, u1)
      if (!occ(x, y, z - 1)) quad(x, y, z, x, y + 1, z, x + 1, y, z, x + 1, y + 1, z, u0, u1)
      if (!occ(x, y, z + 1)) quad(x, y, z + 1, x, y + 1, z + 1, x + 1, y, z + 1, x + 1, y + 1, z + 1, u0, u1)
    }
  }

  // Suelo = la capa más poblada de la mitad baja (para apoyar el robot y la ruta)
  let half = 0, acc = 0
  for (; half < layers; half++) { acc += hist[half]; if (acc >= voxels / 2) break }
  let floorLayer = 0
  for (let k = 0; k <= Math.min(half, layers - 1); k++) if (hist[k] > hist[floorLayer]) floorLayer = k
  return { faces: f, voxels, floorLayer }
}

/** Índices fijos de MAX_FACES caras (2 triángulos cada una) */
export function quadIndices(maxFaces = MAX_FACES) {
  const idx = new Uint32Array(maxFaces * 6)
  for (let q = 0, v = 0, i = 0; q < maxFaces; q++, v += 4, i += 6) {
    idx[i] = v; idx[i + 1] = v + 1; idx[i + 2] = v + 2
    idx[i + 3] = v + 2; idx[i + 4] = v + 1; idx[i + 5] = v + 3
  }
  return idx
}

/** Centros de los vóxeles ocupados, en metros del mundo (para exportar) */
export function voxelCenters(bits, origin, res) {
  const out = []
  for (let i = 0; i < bits.length; i++) {
    const b = bits[i]
    if (b === 0) continue
    const z = i >> 11, y = (i & 2047) >> 4, x0 = (i & 15) << 3
    for (let bit = 0; bit < 8; bit++) {
      if (b & (128 >> bit)) {
        out.push(origin[0] + (x0 + bit + 0.5) * res, origin[1] + (y + 0.5) * res, origin[2] + (z + 0.5) * res)
      }
    }
  }
  return new Float32Array(out)
}
