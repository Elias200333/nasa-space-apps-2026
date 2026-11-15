import { Cave, RobotBridge } from './robotBridge';
import { FusionView } from './fusionScene';
import { elevationAt, loadTerrainFromPlotly, TerrainGrid } from './terrainGrid';

/**
 * Cuevas integradas en el «Entorno 3D» (modelo Plotly del panel 3D).
 *
 *  - Cada vez que el iframe carga un modelo, pide al backend del robot las cuevas guardadas y pone
 *    un MARCADOR en la superficie de las que caen dentro de ese terreno (más una línea vertical
 *    hasta la profundidad declarada).
 *  - Clic en un marcador → la cámara del modelo se acerca a ese punto y se abre el mapa de la
 *    cueva (terreno + nube del robot, escala 1:1 en metros). «Volver» deshace el acercamiento.
 *  - Sin backend del robot no se muestra nada (el resto de la interfaz sigue igual).
 */

const MARKERS = 'Cuevas mapeadas (Go2)';
const SHAFTS = 'Cuevas · profundidad';
const html = String.raw;

type Camera = { eye: Vec; center: Vec; up: Vec };
type Vec = { x: number; y: number; z: number };

export class CaveLayer {
  private caves: Cave[] = [];
  private gridCache = new Map<string, TerrainGrid>();
  private viewer: HTMLElement | null = null;
  private view: FusionView | null = null;
  private savedCamera: Camera | null = null;
  private loadSeq = 0;

  constructor(private bridge: RobotBridge) {
    const iframe = this.iframe();
    iframe?.addEventListener('load', () => this.refresh());
    if (iframe?.contentDocument?.readyState === 'complete') this.refresh();
  }

  private iframe(): HTMLIFrameElement | null {
    return document.getElementById('terrain3DIframe') as HTMLIFrameElement | null;
  }

  private terrainUrl(): string | null {
    const src = this.iframe()?.getAttribute('src') || '';
    return src.includes('terrain_3d') ? src : null;
  }

  /** El div de Plotly del iframe, cuando ya está dibujado (o null). */
  private async plot(): Promise<{ gd: any; Plotly: any } | null> {
    for (let i = 0; i < 60; i++) {
      const win = this.iframe()?.contentWindow as any;
      const gd = this.iframe()?.contentDocument?.querySelector('.js-plotly-plot') as any;
      if (win?.Plotly && gd?._fullLayout?.scene) return { gd, Plotly: win.Plotly };
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  }

  private async grid(): Promise<TerrainGrid | null> {
    const url = this.terrainUrl();
    if (!url) return null;
    const key = url.split('?')[0];
    if (!this.gridCache.has(key)) {
      try { this.gridCache.set(key, await loadTerrainFromPlotly(url)); } catch { return null; }
    }
    return this.gridCache.get(key) || null;
  }

  /** Vuelve a poner los marcadores (al cargar un modelo o tras integrar una cueva). */
  async refresh(highlightId?: string) {
    const seq = ++this.loadSeq;
    try { this.caves = await this.bridge.caves(); } catch { this.caves = []; }
    const [p, g] = await Promise.all([this.plot(), this.grid()]);
    if (!p || seq !== this.loadSeq) return;
    const { gd, Plotly } = p;
    // quitar los de antes (si el modelo no se ha recargado)
    const old = (gd.data as any[]).map((t, i) => (t.name === MARKERS || t.name === SHAFTS ? i : -1)).filter((i) => i >= 0);
    if (old.length) await Plotly.deleteTraces(gd, old);
    const sc = gd._fullLayout.scene;
    const [x0, x1] = sc.xaxis.range, [y0, y1] = sc.yaxis.range;
    const inside = this.caves.filter((c) => c.location.lon >= Math.min(x0, x1) && c.location.lon <= Math.max(x0, x1)
      && c.location.lat >= Math.min(y0, y1) && c.location.lat <= Math.max(y0, y1));
    if (!inside.length) return;
    const zr = sc.zaxis.range, lift = Math.abs(zr[1] - zr[0]) * 0.04;
    const surf = (c: Cave) => (g ? elevationAt(g, (c.location.lon - g.center.lon) * g.mPerDegLon,
      (c.location.lat - g.center.lat) * g.mPerDegLat) : c.location.surface_elev_m);
    const lx: (number | null)[] = [], ly: (number | null)[] = [], lz: (number | null)[] = [];
    for (const c of inside) {
      lx.push(c.location.lon, c.location.lon, null);
      ly.push(c.location.lat, c.location.lat, null);
      lz.push(surf(c), surf(c) - c.depth_m, null);
    }
    await Plotly.addTraces(gd, [
      { type: 'scatter3d', mode: 'lines', name: SHAFTS, x: lx, y: ly, z: lz, hoverinfo: 'skip', showlegend: false,
        line: { color: '#22d3ee', width: 5, dash: 'dash' } },
      { type: 'scatter3d', mode: 'markers+text', name: MARKERS,
        x: inside.map((c) => c.location.lon), y: inside.map((c) => c.location.lat), z: inside.map((c) => surf(c) + lift),
        text: inside.map((c) => c.name), textposition: 'top center', textfont: { color: '#22d3ee', size: 13 },
        customdata: inside.map((c) => [c.id, c.depth_m, c.cloud.count ?? 0]),
        hovertemplate: '<b>%{text}</b><br>Profundidad declarada: %{customdata[1]} m<br>%{customdata[2]} puntos del LiDAR'
          + '<br><i>Clic para ver la cueva</i><extra></extra>',
        marker: { size: 10, symbol: 'diamond',
          color: inside.map((c) => (c.id === highlightId ? '#f97316' : '#22d3ee')), line: { color: '#ffffff', width: 2 } } },
    ]);
    if (!gd.__terrainxCaves) {
      gd.__terrainxCaves = true;
      gd.on('plotly_click', (ev: any) => {
        const pt = ev?.points?.[0];
        if (pt?.data?.name === MARKERS && Array.isArray(pt.customdata)) this.open(String(pt.customdata[0]));
      });
    }
  }

  // ---------------------------------------------------------------- acercamiento de la cámara
  /** Punto (lon, lat, cota) → coordenadas de cámara de Plotly (caja de la escena centrada en 0). */
  private toScene(sc: any, lon: number, lat: number, z: number): Vec {
    const n = (v: number, r: number[], a: number) => ((v - r[0]) / (r[1] - r[0]) - 0.5) * a;
    const ar = sc.aspectratio;
    return { x: n(lon, sc.xaxis.range, ar.x), y: n(lat, sc.yaxis.range, ar.y), z: n(z, sc.zaxis.range, ar.z) };
  }

  private async animateCamera(gd: any, Plotly: any, to: Camera, ms = 700) {
    const from: Camera = JSON.parse(JSON.stringify(gd._fullLayout.scene.camera));
    const t0 = performance.now();
    const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    for (;;) {
      const t = Math.min((performance.now() - t0) / ms, 1), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      await Plotly.relayout(gd, { 'scene.camera': { eye: lerp(from.eye, to.eye, e), center: lerp(from.center, to.center, e), up: to.up } });
      if (t >= 1) return;
      await new Promise((r) => requestAnimationFrame(r));
    }
  }

  private async zoomTo(cave: Cave) {
    const p = await this.plot();
    if (!p) return;
    const { gd, Plotly } = p;
    const sc = gd._fullLayout.scene;
    this.savedCamera = JSON.parse(JSON.stringify(sc.camera));
    const cam = this.savedCamera!;
    const center = this.toScene(sc, cave.location.lon, cave.location.lat, cave.location.surface_elev_m);
    let d = { x: cam.eye.x - cam.center.x, y: cam.eye.y - cam.center.y, z: cam.eye.z - cam.center.z };
    const len = Math.hypot(d.x, d.y, d.z) || 1;
    d = { x: d.x / len, y: d.y / len, z: d.z / len };
    const dist = 0.28;
    await this.animateCamera(gd, Plotly, { center, up: cam.up,
      eye: { x: center.x + d.x * dist, y: center.y + d.y * dist, z: center.z + d.z * dist } });
  }

  // ---------------------------------------------------------------- visor de la cueva
  async open(caveId: string) {
    const cave = this.caves.find((c) => c.id === caveId);
    if (!cave) return;
    await this.zoomTo(cave);
    const host = document.getElementById('iframe3DContainer');
    if (!host) return;
    this.closeViewer(false);
    const el = document.createElement('div');
    el.className = 'cv-overlay';
    el.innerHTML = html`
      <header class="cv-head">
        <button class="cv-btn" data-act="back">← Volver al entorno 3D</button>
        <div class="cv-title"><b>${cave.name}</b><span>profundidad ${cave.depth_m} m · rumbo ${Math.round(cave.heading_deg)}° ·
          ${(cave.cloud.count ?? 0).toLocaleString('es-ES')} puntos</span></div>
        <button class="cv-btn hidden" data-act="vr">Ver en VR</button>
        <button class="cv-btn" data-act="download" title="Mapa combinado (terreno + cueva) en JSON">Descargar</button>
        <button class="cv-btn danger" data-act="delete" title="Quitar la cueva del mapa (el escaneo no se borra)">Quitar</button>
      </header>
      <div class="cv-stage"><canvas class="cv-canvas"></canvas><div class="cv-loading">Cargando la cueva…</div></div>
      <p class="cv-note">Posición ${cave.placement.toLowerCase()}. Nube DERIVADA del LiDAR del Go2 (escaneo
        <code>${cave.scan_id}</code>). Escala 1:1 en metros.</p>`;
    host.appendChild(el);
    this.viewer = el;
    el.querySelector<HTMLButtonElement>('[data-act=back]')!.onclick = () => this.closeViewer(true);
    el.querySelector<HTMLButtonElement>('[data-act=delete]')!.onclick = () => this.remove(cave);
    el.querySelector<HTMLButtonElement>('[data-act=download]')!.onclick = () => this.download(cave);
    const vrBtn = el.querySelector<HTMLButtonElement>('[data-act=vr]')!;
    vrBtn.onclick = async () => { try { await this.view?.enterVR(); } catch (e: any) { alert(`No se pudo entrar en VR: ${e?.message || e}`); } };
    FusionView.xrSupported().then((ok) => vrBtn.classList.toggle('hidden', !ok));
    try {
      const [g, cloud] = await Promise.all([this.grid(), this.bridge.missionCloud(cave.scan_id)]);
      if (!g) throw new Error('no se pudo leer el terreno del modelo 3D');
      if (this.viewer !== el) return;
      const view = new FusionView(el.querySelector('canvas') as HTMLCanvasElement);
      this.view = view;
      view.setTerrain(g);
      view.setScan(cloud);
      view.setPlacement({ headingDeg: cave.heading_deg, depthM: cave.depth_m,
        offsetE: (cave.location.lon - g.center.lon) * g.mPerDegLon, offsetN: (cave.location.lat - g.center.lat) * g.mPerDegLat });
      view.setZone(60);
      el.querySelector('.cv-loading')?.remove();
    } catch (e: any) {
      const l = el.querySelector('.cv-loading');
      if (l) l.textContent = `No se pudo cargar la cueva: ${e?.message || e}`;
    }
  }

  private async closeViewer(restoreCamera: boolean) {
    this.view?.dispose();
    this.view = null;
    this.viewer?.remove();
    this.viewer = null;
    if (restoreCamera && this.savedCamera) {
      const p = await this.plot();
      if (p) await this.animateCamera(p.gd, p.Plotly, this.savedCamera);
      this.savedCamera = null;
    }
  }

  private async remove(cave: Cave) {
    if (!confirm(`¿Quitar «${cave.name}» del mapa? El escaneo del robot no se borra.`)) return;
    try { await this.bridge.deleteCave(cave.id); } catch (e: any) { alert(`No se pudo quitar: ${e?.message || e}`); return; }
    await this.closeViewer(true);
    await this.refresh();
  }

  private download(cave: Cave) {
    if (!this.view) return;
    const data = this.view.exportCombined({ cave: { id: cave.id, name: cave.name }, site: cave.site });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })),
      download: `terrainx_${cave.id}.json`,
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  /** Aviso breve sobre el panel 3D. */
  toast(text: string) {
    const host = document.getElementById('iframe3DContainer');
    if (!host) return;
    const t = document.createElement('div');
    t.className = 'cv-toast';
    t.textContent = text;
    host.appendChild(t);
    setTimeout(() => t.remove(), 6000);
  }
}
