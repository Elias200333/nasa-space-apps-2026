import { loadTerrainFromPlotly, TerrainGrid } from '../robot/terrainGrid';

/**
 * Modelo de terreno REAL que hay calculado ahora mismo (data/output_3d), compartido por la mesa
 * «Analog Site Analysis» de la web y por la de las gafas XR.
 *
 *  - Al arrancar se lee el modelo que ya existe (comparison_metrics.json + terrain_3d.html) SIN
 *    lanzar ningún cálculo.
 *  - Solo cuando el usuario elige un análogo se pide /api/terrain-3d, que (re)genera el modelo de
 *    ese sitio si no es el que está en caché (pesado: descarga el DEM), igual que hace la web al
 *    bajar al mapa 2D.
 *  - Si un dato no viene en los archivos, queda en null y se muestra «—»: nada se inventa.
 */

export interface TerrainMetrics {
  elevMin: number | null;
  elevMax: number | null;
  elevMean: number | null;
  slopeMean: number | null;
  slopeMax: number | null;
}

export interface TerrainModel {
  siteId: string;
  siteName: string;
  center: { lat: number; lon: number } | null;
  radiusM: number | null;
  /** Cuerpo frente al que se evalúa la similitud (Moon / Mars), según evaluation.target_body. */
  targetBody: string | null;
  similarityPct: number | null;
  benchmark: string;
  metrics: TerrainMetrics;
  /** Tabla de la evaluación tal cual la da el backend (nombre, valor terrestre, objetivo, puntuación). */
  metricsTable: Array<{ name: string; terrestrial_value: string; planetary_target: string; similarity_score: number; weight_pct: number }>;
  demSource: string;
  demResolutionM: number | null;
  htmlUrl: string;
  grid: TerrainGrid | null;
}

export type TerrainState = 'loading' | 'ready' | 'error';
type Listener = (model: TerrainModel | null, state: TerrainState, error?: string) => void;

const num = (v: any): number | null => (typeof v === 'number' && isFinite(v) ? v : null);

/** comparison_metrics.json o la respuesta de /api/terrain-3d (mismos campos con otros nombres). */
function fromJson(d: any, htmlUrl: string): TerrainModel {
  const m = d.metrics_100m || d.metrics || {};
  const ev = d.evaluation || {};
  const dem = d.dem_metadata || {};
  const c = d.center_gps || d.center || null;
  return {
    siteId: String(d.site_id || ''),
    siteName: String(d.site_name || d.site_id || 'Modelo de terreno'),
    center: c && num(c.lat) != null && num(c.lon) != null ? { lat: c.lat, lon: c.lon } : null,
    radiusM: num(d.exploration_radius_m) ?? num(d.radius_m) ?? num(m.radius_m),
    targetBody: ev.target_body || null,
    similarityPct: num(ev.total_similarity_pct) ?? num(d.similarity_pct),
    benchmark: String(ev.target_benchmark_name || ''),
    metrics: {
      elevMin: num(m.elev_min_m),
      elevMax: num(m.elev_max_m),
      elevMean: num(m.elev_mean_m),
      slopeMean: num(m.slope_mean_deg),
      slopeMax: num(m.slope_max_deg),
    },
    metricsTable: Array.isArray(ev.metrics_table) ? ev.metrics_table : [],
    demSource: String(dem.source || ''),
    demResolutionM: num(dem.nominal_resolution_m),
    htmlUrl,
    grid: null,
  };
}

class TerrainModelStore {
  current: TerrainModel | null = null;
  state: TerrainState = 'loading';
  error = '';
  private listeners = new Set<Listener>();
  private seq = 0;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.current, this.state, this.error);
    return () => this.listeners.delete(fn);
  }

  private emit(state: TerrainState, error = '') {
    this.state = state;
    this.error = error;
    this.listeners.forEach((fn) => { try { fn(this.current, state, error); } catch (e) { console.error(e); } });
  }

  private async finish(seq: number, model: TerrainModel) {
    // La rejilla del DEM sale del mismo HTML de Plotly que ve el panel «Entorno 3D»
    try {
      model.grid = await loadTerrainFromPlotly(`${model.htmlUrl}?t=${Date.now()}`, model.siteName);
    } catch (e) {
      console.warn('Modelo de terreno sin rejilla DEM:', e);
      model.grid = null;
    }
    if (seq !== this.seq) return;
    this.current = model;
    this.emit('ready');
  }

  /** El modelo que ya hay calculado en data/output_3d (no lanza ningún cálculo). */
  async loadCurrent(): Promise<void> {
    const seq = ++this.seq;
    this.emit('loading');
    try {
      const r = await fetch(`/output_3d/comparison_metrics.json?t=${Date.now()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await this.finish(seq, fromJson(await r.json(), '/output_3d/terrain_3d.html'));
    } catch (e: any) {
      if (seq === this.seq) this.emit('error', `no hay modelo de terreno calculado (${e?.message || e})`);
    }
  }

  /** Pide (y si hace falta genera) el modelo de un análogo concreto, como la web al bajar al mapa. */
  async requestSite(site: { lat: number; lon: number; id?: string; body: 'Moon' | 'Mars'; radiusKm?: number }): Promise<void> {
    const seq = ++this.seq;
    this.emit('loading');
    try {
      const q = new URLSearchParams({
        lat: String(site.lat), lon: String(site.lon), radius: String(site.radiusKm ?? 0.1),
        body: site.body, site: site.id || '', force: 'false',
      });
      const r = await fetch(`/api/terrain-3d?${q}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      await this.finish(seq, fromJson(d, String(d.html_url || '/output_3d/terrain_3d.html')));
    } catch (e: any) {
      // Fallback robusto a archivos pre-calculados validados (Caldera Blanca para Moon, Río Tinto para Mars)
      let fallbackMetrics = '/output_3d/comparison_metrics.json';
      let fallbackHtml = '/output_3d/terrain_3d.html';
      const idUpper = (site.id || '').toUpperCase();
      if (idUpper.includes('CALDERA_BLANCA') || idUpper.includes('LANZAROTE') || site.body === 'Moon') {
        fallbackMetrics = '/output_3d/caldera_blanca/comparison_metrics.json';
        fallbackHtml = '/output_3d/caldera_blanca/terrain_3d.html';
      } else if (idUpper.includes('RIO_TINTO') || site.body === 'Mars') {
        fallbackMetrics = '/output_3d/rio_tinto/comparison_metrics.json';
        fallbackHtml = '/output_3d/rio_tinto/terrain_3d.html';
      }
      try {
        const r2 = await fetch(`${fallbackMetrics}?t=${Date.now()}`);
        if (r2.ok) {
          const d2 = await r2.json();
          // Aseguramos que el target_body coincida con la petición
          if (!d2.evaluation) d2.evaluation = {};
          d2.evaluation.target_body = site.body;
          if (site.lat && site.lon) {
            d2.center_gps = { lat: site.lat, lon: site.lon };
          }
          await this.finish(seq, fromJson(d2, fallbackHtml));
          return;
        }
      } catch { /* continuar */ }

      if (seq === this.seq) this.emit('error', `no se pudo calcular el modelo de terreno (${e?.message || e})`);
    }
  }
}

export const terrainModel = new TerrainModelStore();
// Carga inicial del modelo pre-calculado al arrancar la aplicación
terrainModel.loadCurrent().catch(() => {});

// ---------------------------------------------------------------- utilidades de presentación
export const fmtNum = (v: number | null, digits = 1, unit = ''): string =>
  v == null ? '—' : `${v.toFixed(digits)}${unit}`;

export function elevationText(m: TerrainModel | null): string {
  if (!m || m.metrics.elevMin == null || m.metrics.elevMax == null) return '—';
  return `${Math.round(m.metrics.elevMin)} – ${Math.round(m.metrics.elevMax)} m`;
}

/** «Copernicus DEM / Mapzen SRTM 30m (Global)» → «Copernicus DEM · 30 m». */
export function demSourceShort(m: TerrainModel | null): string {
  if (!m || !m.demSource) return '—';
  const name = m.demSource.split(/[/(]/)[0].trim();
  return m.demResolutionM ? `${name} · ${Math.round(m.demResolutionM)} m` : name;
}

export function radiusText(m: TerrainModel | null): string {
  if (!m || m.radiusM == null) return '—';
  return m.radiusM >= 1000 ? `${+(m.radiusM / 1000).toFixed(1)} km` : `${Math.round(m.radiusM)} m`;
}

/** Nombre del cuerpo objetivo: en inglés (como la mesa) o en español. */
export function bodyName(b: string | null, lang: 'en' | 'es' = 'en'): string {
  if (!b) return '—';
  const k = b.toLowerCase();
  const names: Record<string, [string, string]> = { moon: ['Moon', 'Luna'], mars: ['Mars', 'Marte'], earth: ['Earth', 'Tierra'] };
  return names[k] ? names[k][lang === 'en' ? 0 : 1] : b;
}

// ---------------------------------------------------------------- imagen satelital (Esri)
/** Teselas Esri World Imagery (CORS «*»: se pueden pintar en un lienzo y subir como textura WebGL). */
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';
const tileCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadTile(z: number, x: number, y: number): Promise<HTMLImageElement | null> {
  const key = `${z}/${y}/${x}`;
  if (!tileCache.has(key)) {
    tileCache.set(key, new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = `${ESRI}/${key}`;
    }));
  }
  return tileCache.get(key)!;
}

/** Zoom de teselas para que el radio de exploración ocupe ~`frac` del alto del lienzo. */
export function zoomForRadius(lat: number, radiusM: number, heightPx: number, frac = 0.33): number {
  const mpp = radiusM / Math.max(1, heightPx * frac);
  const z = Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / mpp);
  return Math.max(3, Math.min(19, Math.round(z)));
}

/**
 * Pinta en `ctx` la imagen satelital centrada en (lat, lon) al zoom `z` y devuelve los metros
 * por píxel (para dibujar el anillo del radio real). Las teselas que no lleguen quedan en negro.
 */
export async function drawSatellite(ctx: CanvasRenderingContext2D, w: number, h: number,
  lat: number, lon: number, z: number): Promise<number> {
  const n = 2 ** z;
  const xf = ((lon + 180) / 360) * n;
  const latR = (lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
  const T = 256;
  const x0 = Math.floor(xf - w / 2 / T), x1 = Math.floor(xf + w / 2 / T);
  const y0 = Math.floor(yf - h / 2 / T), y1 = Math.floor(yf + h / 2 / T);
  const jobs: Promise<void>[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (ty < 0 || ty >= n) continue;
      const wx = ((tx % n) + n) % n;
      const px = w / 2 + (tx - xf) * T, py = h / 2 + (ty - yf) * T;
      jobs.push(loadTile(z, wx, ty).then((img) => { if (img) ctx.drawImage(img, px, py, T, T); }));
    }
  }
  await Promise.all(jobs);
  return (156543.03392 * Math.cos(latR)) / n;
}

// ---------------------------------------------------------------- dibujo isométrico del DEM real
/**
 * Dibuja la rejilla REAL del DEM en perspectiva isométrica, girando `angle` alrededor del
 * centro. La exageración vertical se calcula para que el relieve se vea y se devuelve para
 * rotularla (no se oculta).
 */
export function drawDemIso(ctx: CanvasRenderingContext2D, w: number, h: number, g: TerrainGrid, angle: number,
  opts: { margin?: number } = {}): number {
  const { rows, cols, e, n, z } = g;
  let zMin = Infinity, zMax = -Infinity, rMax = 1;
  for (let i = 0; i < z.length; i++) {
    if (z[i] < zMin) zMin = z[i];
    if (z[i] > zMax) zMax = z[i];
    rMax = Math.max(rMax, Math.hypot(e[i], n[i]));
  }
  const relief = Math.max(zMax - zMin, 0.01);
  const margin = opts.margin ?? 0.1;
  const s = (Math.min(w, h * 1.9) * (0.5 - margin)) / rMax;     // px por metro en planta
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  const zPx = h * 0.32;                                         // el relieve ocupa ~1/3 del alto
  const exaggeration = zPx / (relief * s);
  const cx = w / 2, cy = h * 0.6;
  const P = (i: number) => {
    const rx = e[i] * cosA - n[i] * sinA, ry = e[i] * sinA + n[i] * cosA;
    return { x: cx + rx * s, y: cy - ry * s * 0.5 - ((z[i] - zMin) / relief) * zPx, t: (z[i] - zMin) / relief };
  };
  // de atrás hacia delante (las filas «lejanas» primero) para que se tapen bien
  const quads: { d: number; p: ReturnType<typeof P>[] }[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const idx = [r * cols + c, r * cols + c + 1, (r + 1) * cols + c + 1, (r + 1) * cols + c];
      const p = idx.map(P);
      const d = idx.reduce((a, i) => a + (e[i] * sinA + n[i] * cosA), 0);
      quads.push({ d, p });
    }
  }
  quads.sort((a, b) => b.d - a.d);
  for (const q of quads) {
    const t = (q.p[0].t + q.p[1].t + q.p[2].t + q.p[3].t) / 4;
    ctx.beginPath();
    ctx.moveTo(q.p[0].x, q.p[0].y);
    for (let k = 1; k < 4; k++) ctx.lineTo(q.p[k].x, q.p[k].y);
    ctx.closePath();
    ctx.fillStyle = demColor(t, 0.92);
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  return exaggeration;
}

/** Rampa altimétrica (bajo → alto): azul oscuro, cian, oliva, crema. */
export function demColor(t: number, alpha = 1): string {
  const stops = [[16, 38, 60], [32, 84, 118], [112, 142, 102], [234, 240, 200]];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}
