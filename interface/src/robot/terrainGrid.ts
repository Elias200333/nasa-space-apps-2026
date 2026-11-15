/**
 * Rejilla del terreno del modelo 3D que está viendo el usuario (panel «Entorno 3D»).
 *
 * El modelo es un HTML de Plotly generado por data/generate_terrain_3d.py: una superficie con
 * x = longitud (°), y = latitud (°) y z = elevación (m), más el marcador del centro. Aquí se lee
 * ese mismo archivo (el del iframe) y se pasa a METROS alrededor del centro, con la misma
 * conversión que el generador (111 320 m/° en latitud; × cos(lat) en longitud). Así el terreno
 * y la nube del robot comparten escala 1:1 en metros, sin la exageración vertical del Plotly.
 */

export interface TerrainGrid {
  rows: number;
  cols: number;
  /** Este y norte (m) de cada punto respecto al centro, y elevación (m); fila a fila. */
  e: Float64Array;
  n: Float64Array;
  z: Float64Array;
  center: { lat: number; lon: number; elev: number };
  mPerDegLat: number;
  mPerDegLon: number;
  /** Separación media entre puntos de la rejilla (m): la resolución REAL del terreno mostrado. */
  spacingM: number;
  sourceUrl: string;
  name: string;
}

const M_PER_DEG = 111320.0;

/** Saca el array de trazas de `Plotly.newPlot("id", [ ...trazas... ], layout, config)`. */
function extractTraces(html: string): any[] {
  const start = html.indexOf('Plotly.newPlot(');
  if (start < 0) throw new Error('el modelo 3D no es un gráfico de Plotly');
  const open = html.indexOf('[', start);
  let depth = 0, inStr = false, esc = false;
  for (let i = open; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) return JSON.parse(html.slice(open, i + 1));
  }
  throw new Error('no se pudo leer el modelo 3D');
}

/** Valores de Plotly → Float64Array plana + forma. Admite listas, listas de listas y "bdata". */
function decode(v: any): { data: Float64Array; shape: number[] } {
  if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.bdata === 'string') {
    const bin = atob(v.bdata);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ctor: Record<string, any> = {
      f8: Float64Array, f4: Float32Array, i4: Int32Array, u4: Uint32Array,
      i2: Int16Array, u2: Uint16Array, i1: Int8Array, u1: Uint8Array,
    };
    const T = ctor[v.dtype];
    if (!T) throw new Error(`tipo de dato del modelo 3D no soportado: ${v.dtype}`);
    const arr = new T(bytes.buffer);
    const shape = v.shape ? String(v.shape).split(',').map((s: string) => parseInt(s, 10)) : [arr.length];
    return { data: Float64Array.from(arr as ArrayLike<number>), shape };
  }
  if (Array.isArray(v) && Array.isArray(v[0])) {
    return { data: Float64Array.from((v as number[][]).flat()), shape: [v.length, v[0].length] };
  }
  if (Array.isArray(v)) return { data: Float64Array.from(v as number[]), shape: [v.length] };
  throw new Error('datos del modelo 3D no reconocidos');
}

export async function loadTerrainFromPlotly(url: string, name = ''): Promise<TerrainGrid> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`no se pudo cargar el modelo 3D (HTTP ${r.status})`);
  const traces = extractTraces(await r.text());
  const surf = traces.find((t) => t.type === 'surface');
  if (!surf) throw new Error('el modelo 3D no tiene superficie de terreno');
  const z = decode(surf.z);
  if (z.shape.length !== 2) throw new Error('la superficie del terreno no es una rejilla');
  const [rows, cols] = z.shape;
  let lon = decode(surf.x), lat = decode(surf.y);
  // Plotly admite x/y como vectores (columnas/filas): se expanden a rejilla
  if (lon.shape.length === 1) lon = { data: Float64Array.from({ length: rows * cols }, (_, i) => lon.data[i % cols]), shape: [rows, cols] };
  if (lat.shape.length === 1) lat = { data: Float64Array.from({ length: rows * cols }, (_, i) => lat.data[Math.floor(i / cols)]), shape: [rows, cols] };

  const marker = traces.find((t) => t.name === 'Analysis Center Marker');
  const cLon = marker ? decode(marker.x).data[0] : lon.data.reduce((a, b) => a + b, 0) / lon.data.length;
  const cLat = marker ? decode(marker.y).data[0] : lat.data.reduce((a, b) => a + b, 0) / lat.data.length;
  const mPerDegLat = M_PER_DEG;
  const mPerDegLon = M_PER_DEG * Math.cos((cLat * Math.PI) / 180);

  const e = new Float64Array(rows * cols), n = new Float64Array(rows * cols);
  for (let i = 0; i < rows * cols; i++) {
    e[i] = (lon.data[i] - cLon) * mPerDegLon;
    n[i] = (lat.data[i] - cLat) * mPerDegLat;
  }
  const spacingM = (Math.abs(e[cols - 1] - e[0]) / (cols - 1) + Math.abs(n[(rows - 1) * cols] - n[0]) / (rows - 1)) / 2;
  const grid: TerrainGrid = {
    rows, cols, e, n, z: z.data, center: { lat: cLat, lon: cLon, elev: 0 },
    mPerDegLat, mPerDegLon, spacingM, sourceUrl: url, name,
  };
  grid.center.elev = elevationAt(grid, 0, 0);
  return grid;
}

/** Elevación (m) en (este, norte) respecto al centro, interpolada (bilineal) en la rejilla. */
export function elevationAt(g: TerrainGrid, east: number, north: number): number {
  const e0 = g.e[0], e1 = g.e[g.cols - 1], n0 = g.n[0], n1 = g.n[(g.rows - 1) * g.cols];
  const fc = Math.min(Math.max(((east - e0) / (e1 - e0)) * (g.cols - 1), 0), g.cols - 1);
  const fr = Math.min(Math.max(((north - n0) / (n1 - n0)) * (g.rows - 1), 0), g.rows - 1);
  const c0 = Math.min(Math.floor(fc), g.cols - 2), r0 = Math.min(Math.floor(fr), g.rows - 2);
  const tc = fc - c0, tr = fr - r0;
  const at = (r: number, c: number) => g.z[r * g.cols + c];
  return (at(r0, c0) * (1 - tc) + at(r0, c0 + 1) * tc) * (1 - tr) + (at(r0 + 1, c0) * (1 - tc) + at(r0 + 1, c0 + 1) * tc) * tr;
}
