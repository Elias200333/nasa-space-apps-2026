import {
  bodyName, demSourceShort, drawDemIso, drawSatellite, elevationText, fmtNum, radiusText,
  terrainModel, TerrainModel, TerrainState, zoomForRadius,
} from '../data/terrainModel';

/**
 * Mesa «Analog Site Analysis» de la vista del globo.
 *
 * Muestra el modelo de terreno REAL que hay calculado (src/data/terrainModel.ts):
 *  - izquierda: imagen satelital Esri centrada en el sitio, con el anillo del radio de exploración;
 *  - derecha: la rejilla real del DEM en isométrico (con su exageración vertical rotulada) y las
 *    métricas del backend. Lo que no venga en los datos se muestra «—».
 */
export class AnalogDeskManager {
  private deskEl: HTMLElement | null;
  private restorePill: HTMLElement | null;
  private mapCanvas: HTMLCanvasElement | null;
  private demCanvas: HTMLCanvasElement | null;
  private mapCtx: CanvasRenderingContext2D | null = null;
  private demCtx: CanvasRenderingContext2D | null = null;

  private model: TerrainModel | null = null;
  private state: TerrainState = 'loading';
  private stateMsg = '';
  private zoomOffset = 0;
  private isCollapsed = false;
  private animFrameId = 0;
  private demAngle = 0.6;
  private mapSeq = 0;

  constructor() {
    this.deskEl = document.getElementById('analogSiteDesk');
    this.restorePill = document.getElementById('btnRestoreDesk');
    this.mapCanvas = document.getElementById('deskMapCanvas') as HTMLCanvasElement;
    this.demCanvas = document.getElementById('deskDEMCanvas') as HTMLCanvasElement;

    if (this.mapCanvas) this.mapCtx = this.mapCanvas.getContext('2d');
    if (this.demCanvas) this.demCtx = this.demCanvas.getContext('2d');

    // Los lienzos dibujan en píxeles: si la mesa cambia de tamaño se ajusta su resolución al
    // tamaño real (si no, el dibujo se estira y se deforma).
    const fitCanvas = (cv: HTMLCanvasElement | null, draw: () => void) => {
      if (!cv) return;
      new ResizeObserver(() => {
        const w = Math.round(cv.clientWidth), h = Math.round(cv.clientHeight);
        if (w > 0 && h > 0 && (cv.width !== w || cv.height !== h)) {
          cv.width = w;
          cv.height = h;
          draw();
        }
      }).observe(cv);
    };
    fitCanvas(this.mapCanvas, () => this.drawMap());
    fitCanvas(this.demCanvas, () => this.drawDEM());

    this.setupListeners();
    this.startRenderLoop();
    terrainModel.subscribe((m, state, err) => {
      const siteChanged = m !== this.model;
      this.model = m;
      this.state = state;
      this.stateMsg = err || '';
      if (siteChanged) this.zoomOffset = 0;
      this.renderText();
      if (siteChanged || state !== 'ready') this.drawMap();
      this.drawDEM();
    });
  }

  private setupListeners() {
    document.getElementById('btnDeskClose')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.collapse();
    });
    this.restorePill?.addEventListener('click', () => this.expand());
    document.getElementById('btnDeskZoomIn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.zoomOffset = Math.min(4, this.zoomOffset + 1);
      this.drawMap();
    });
    document.getElementById('btnDeskZoomOut')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.zoomOffset = Math.max(-6, this.zoomOffset - 1);
      this.drawMap();
    });
  }

  public collapse() {
    this.isCollapsed = true;
    this.deskEl?.classList.add('collapsed');
    this.restorePill?.classList.remove('hidden');
  }

  public expand() {
    this.isCollapsed = false;
    this.deskEl?.classList.remove('collapsed');
    this.restorePill?.classList.add('hidden');
    this.drawMap();
    this.drawDEM();
  }

  public isDeskCollapsed(): boolean {
    return this.isCollapsed;
  }

  /** Centro del modelo actual (para «Fit to Area»), o null si aún no hay modelo. */
  public getCenter(): { lat: number; lon: number } | null {
    return this.model?.center ?? null;
  }

  /** Vuelve a encuadrar la imagen satelital en el radio de exploración. */
  public fitToArea() {
    this.zoomOffset = 0;
    this.drawMap();
  }

  private setText(id: string, text: string, title?: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    if (title !== undefined) el.title = title;
  }

  private renderText() {
    const m = this.model;
    const loading = this.state === 'loading';
    const name = m ? m.siteName : (this.state === 'error' ? 'Sin modelo de terreno' : 'Cargando modelo…');
    // Los modelos de exploración libre ya llevan las coordenadas en el nombre
    const coords = m?.center && !name.includes('°') ? ` · ${m.center.lat.toFixed(4)}°, ${m.center.lon.toFixed(4)}°` : '';
    this.setText('deskSiteName', loading && m ? `${name} (recalculando…)` : `${name}${coords}`, this.stateMsg || name);
    this.setText('deskPillTitle', `Analog Site Analysis: ${m ? m.siteName : '—'}${m?.similarityPct != null ? ` (${fmtNum(m.similarityPct, 1, '%')})` : ''}`);
    this.setText('deskSimLabel', `Similarity (vs ${bodyName(m?.targetBody ?? null)})`, m?.benchmark || '');
    this.setText('deskSimVal', m?.similarityPct != null ? fmtNum(m.similarityPct, 1, '%') : '—');
    this.setText('deskElevVal', elevationText(m));
    this.setText('deskSlopeVal', fmtNum(m?.metrics.slopeMean ?? null, 1, '°'));
    this.setText('deskCavitiesVal', demSourceShort(m), m?.demSource || '');
    this.setText('deskPearsonVal', radiusText(m));
    this.setText('deskRadiusChip', `3D · r ${radiusText(m)}`);
    this.setText('deskDemBadge', m?.grid ? `3D DEM (${demSourceShort(m)})` : '3D DEM');
    const labels = document.getElementById('deskLegendLabels');
    if (labels) {
      const lo = m?.metrics.elevMin, hi = m?.metrics.elevMax;
      const vals = lo != null && hi != null ? [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => Math.round(hi - (hi - lo) * t)) : [];
      labels.innerHTML = vals.map((v) => `<span>${v}</span>`).join('') || '<span>—</span>';
    }
  }

  private startRenderLoop() {
    let last = 0;
    const loop = (t: number) => {
      // el DEM gira despacio; se redibuja a ~20 fps (no hace falta más y ahorra batería)
      if (!this.isCollapsed && this.model?.grid && t - last > 50) {
        last = t;
        this.demAngle += 0.012;
        this.drawDEM();
      }
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  public destroy() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
  }

  private message(ctx: CanvasRenderingContext2D, w: number, h: number, text: string) {
    ctx.fillStyle = '#0b1218';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, h / 2);
    ctx.textAlign = 'left';
  }

  /** Imagen satelital real (Esri World Imagery) del sitio con el anillo del radio de exploración. */
  public async drawMap() {
    if (!this.mapCtx || !this.mapCanvas) return;
    const ctx = this.mapCtx, w = this.mapCanvas.width, h = this.mapCanvas.height;
    const m = this.model;
    const seq = ++this.mapSeq;
    if (!m?.center) {
      this.message(ctx, w, h, this.state === 'loading' ? 'Cargando imagen satelital…' : 'Sin imagen: no hay modelo calculado');
      return;
    }
    const radius = m.radiusM ?? 100;
    const z = Math.max(3, Math.min(19, zoomForRadius(m.center.lat, radius, h) + this.zoomOffset));
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const octx = off.getContext('2d')!;
    octx.fillStyle = '#0b1218';
    octx.fillRect(0, 0, w, h);
    const mpp = await drawSatellite(octx, w, h, m.center.lat, m.center.lon, z);
    if (seq !== this.mapSeq) return;            // llegó otra petición mientras tanto
    ctx.drawImage(off, 0, 0);

    const cx = w / 2, cy = h / 2, rPx = radius / mpp;
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy); ctx.lineTo(cx + 7, cy);
    ctx.moveTo(cx, cy - 7); ctx.lineTo(cx, cy + 7);
    ctx.stroke();

    ctx.font = '10px monospace';
    ctx.fillStyle = 'rgba(2, 6, 23, 0.7)';
    ctx.fillRect(0, h - 18, w, 18);
    ctx.fillStyle = 'rgba(226, 232, 240, 0.92)';
    ctx.fillText(`${m.center.lat.toFixed(4)}°, ${m.center.lon.toFixed(4)}° · r ${radiusText(m)}`, 8, h - 6);
    const src = 'Esri World Imagery';
    ctx.fillStyle = 'rgba(34, 211, 238, 0.95)';
    ctx.fillText(src, w - ctx.measureText(src).width - 8, h - 6);
  }

  /** Rejilla REAL del DEM del modelo, en isométrico. */
  public drawDEM() {
    if (!this.demCtx || !this.demCanvas) return;
    const ctx = this.demCtx, w = this.demCanvas.width, h = this.demCanvas.height;
    const g = this.model?.grid;
    if (!g) {
      this.message(ctx, w, h, this.state === 'loading' ? 'Cargando DEM…' : 'Sin DEM');
      return;
    }
    ctx.fillStyle = 'rgba(8, 14, 26, 0.95)';
    ctx.fillRect(0, 0, w, h);
    const exag = drawDemIso(ctx, w, h, g, this.demAngle, { margin: 0.06 });
    ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
    ctx.font = '9px monospace';
    ctx.fillText(`${g.rows}×${g.cols} pts · ~${Math.round(g.spacingM)} m`, 6, 12);
    const ex = exag >= 10 ? Math.round(exag) : exag.toFixed(1);
    ctx.fillText(`vertical ×${ex}`, 6, h - 6);
  }
}
