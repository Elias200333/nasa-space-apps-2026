// Origen: visor LiDAR «Bridge» aportado al equipo (2026-11-14). Copiado sin cambios.
// Descompresor de bloques LZ4 (el formato de rt/utlidar/voxel_map_compressed).
// Sin dependencias; se usa dentro del Web Worker.
// Formato: secuencias [token][literales][offset 2 B][longitud extra] — ver
// https://github.com/lz4/lz4/blob/dev/doc/lz4_Block_format.md

export function lz4DecompressBlock(src, dstSize) {
  const dst = new Uint8Array(dstSize)
  const n = src.length
  let si = 0
  let di = 0

  while (si < n) {
    const token = src[si++]

    // Literales
    let lit = token >>> 4
    if (lit === 15) {
      let b
      do { b = src[si++]; lit += b } while (b === 255 && si < n)
    }
    if (si + lit > n || di + lit > dstSize) throw new Error('lz4: datos corruptos (literales)')
    dst.set(src.subarray(si, si + lit), di)
    si += lit
    di += lit
    if (si >= n) break                       // la última secuencia solo lleva literales

    // Copia desde lo ya descomprimido
    const offset = src[si] | (src[si + 1] << 8)
    si += 2
    if (offset === 0 || offset > di) throw new Error('lz4: datos corruptos (offset)')
    let len = token & 15
    if (len === 15) {
      let b
      do { b = src[si++]; len += b } while (b === 255 && si < n)
    }
    len += 4
    if (di + len > dstSize) throw new Error('lz4: datos corruptos (longitud)')
    let from = di - offset
    if (offset >= len) {
      dst.copyWithin(di, from, from + len)
      di += len
    } else {
      // Solapada (patrón que se repite): byte a byte
      for (let end = di + len; di < end;) dst[di++] = dst[from++]
    }
  }

  if (di !== dstSize) throw new Error(`lz4: tamaño ${di} ≠ ${dstSize}`)
  return dst
}
