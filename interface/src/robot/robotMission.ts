import './robotMission.css';
import { BridgeError, MissionCloud, MissionSite, RobotBridge } from './robotBridge';
import { CaveLayer } from './caveMarkers';
import { FusionView } from './fusionScene';
import { elevationAt, loadTerrainFromPlotly, TerrainGrid } from './terrainGrid';

/**
 * «Mapear zona subterránea»: puente entre la interfaz y la unidad terrestre (Go2, módulo robot/).
 *
 * Flujo (PC y gafas XR, en el navegador):
 *   1. Botón en el panel «Entorno 3D» cuando hay un modelo de terreno cargado.
 *   2. «Conectando a unidad terrestre…»: conecta el robot (si no lo estaba) y empieza la misión
 *      (mapa acumulado nuevo + pose de partida). Desde otro equipo pide el código de emparejamiento.
 *   3. Recorrido: página de la misión del backend del robot (cámara, LiDAR acumulado en directo y
 *      conducción por teclado o botones táctiles, con hombre muerto).
 *   4. «Terminar recorrido»: el backend guarda el mapa (PLY + GLB + coordenadas, SHA-256) y la nube
 *      en el marco de la misión → vista previa 3D.
 *   5. «Añadir al mapa»: terreno del modelo 3D + nube bajo la superficie, a escala 1:1 en metros,
 *      con anclaje, rumbo y profundidad que declara el operador.
 *   6. «Integrar en el mapa 3D»: el backend guarda la cueva (dónde se colocó) y se vuelve al
 *      «Entorno 3D», donde queda un marcador; clic en él → zoom y mapa de la cueva (caveMarkers.ts).
 *      Se puede repetir para grabar otra cueva.
 */

type Step = 'connect' | 'live' | 'preview' | 'fusion';

const html = String.raw;

export class RobotMissionController {
  private root: HTMLElement;
  private view: FusionView | null = null;
  private cloud: MissionCloud | null = null;
  private terrain: TerrainGrid | null = null;
  private site: MissionSite = {};
  private connectedByUs = false;
  private busy = false;
  private cancelled = false;

  constructor(private bridge: RobotBridge, private caves: CaveLayer) {
    this.root = document.createElement('div');
    this.root.id = 'robotMissionOverlay';
    this.root.className = 'rm-overlay hidden';
    this.root.innerHTML = html`
      <div class="rm-window">
        <header class="rm-header">
          <div>
            <div class="rm-kicker">UNIDAD TERRESTRE · GO2</div>
            <h2 class="rm-title">Mapear zona subterránea</h2>
            <p class="rm-sub" id="rmSite">—</p>
          </div>
          <ol class="rm-steps">
            <li data-step="connect">Conexión</li><li data-step="live">Recorrido</li>
            <li data-step="preview">Nube 3D</li><li data-step="fusion">Mapa combinado</li>
          </ol>
          <button class="rm-close" id="rmClose" title="Cerrar">✕</button>
        </header>

        <section class="rm-body" data-panel="connect">
          <div class="rm-center">
            <div class="rm-spinner" id="rmSpinner"></div>
            <h3 id="rmConnectTitle">Conectando a unidad terrestre…</h3>
            <p class="rm-note" id="rmConnectMsg"></p>
            <form class="rm-pair hidden" id="rmPair">
              <p>Este equipo necesita el <b>código de emparejamiento</b> del robot. Lo verás en la consola donde se
                lanzó <code>python -m terrainx_robot dashboard</code> y en el panel «Diagnóstico» de su dashboard.</p>
              <input id="rmCode" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="000000" />
              <button type="submit" class="rm-btn primary">Emparejar</button>
            </form>
            <button class="rm-btn hidden" id="rmRetry">Reintentar</button>
          </div>
        </section>

        <section class="rm-body hidden" data-panel="live">
          <iframe id="rmFrame" title="Unidad terrestre: cámara, LiDAR y conducción" allow="xr-spatial-tracking"></iframe>
          <footer class="rm-footer">
            <span class="rm-note">Haz clic en la vista para conducir con el teclado (W A S D · Q E · Espacio = parar) o usa los
              botones de mando. El mapa acumulado muestra lo que va detectando el LiDAR.</span>
            <button class="rm-btn primary" id="rmFinish">■ Terminar recorrido</button>
          </footer>
        </section>

        <section class="rm-body hidden" data-panel="preview">
          <div class="rm-split">
            <canvas class="rm-canvas" id="rmCanvas"></canvas>
            <aside class="rm-side" id="rmSide">
              <div id="rmPreviewInfo"></div>
              <div id="rmFusionControls" class="hidden">
                <label>Nombre de la cueva
                  <input type="text" id="rmCaveName" maxlength="60" placeholder="p. ej. Tubo de lava norte (opcional)" /></label>
                <label>Rumbo al empezar <b id="rmHeadingVal">0°</b>
                  <input type="range" id="rmHeading" min="0" max="359" step="1" value="0" /></label>
                <label>Profundidad bajo la superficie <b id="rmDepthVal">0 m</b>
                  <input type="range" id="rmDepth" min="0" max="60" step="0.5" value="0" /></label>
                <label>Desplazamiento este <b id="rmEastVal">0 m</b>
                  <input type="range" id="rmEast" min="-150" max="150" step="1" value="0" /></label>
                <label>Desplazamiento norte <b id="rmNorthVal">0 m</b>
                  <input type="range" id="rmNorth" min="-150" max="150" step="1" value="0" /></label>
                <label>Transparencia del terreno <b id="rmAlphaVal">45 %</b>
                  <input type="range" id="rmAlpha" min="0.05" max="1" step="0.05" value="0.45" /></label>
                <div class="rm-row">
                  <span>Zona:</span>
                  <button class="rm-chip sel" data-zone="60">60 m</button>
                  <button class="rm-chip" data-zone="200">200 m</button>
                  <button class="rm-chip" data-zone="0">Todo</button>
                </div>
              </div>
              <p class="rm-honest" id="rmHonest"></p>
              <div class="rm-actions">
                <button class="rm-btn primary" id="rmAddToMap">Añadir al mapa</button>
                <button class="rm-btn primary hidden" id="rmIntegrate">Integrar en el mapa 3D</button>
                <button class="rm-btn hidden" id="rmVR">Ver en VR</button>
                <button class="rm-btn hidden" id="rmDownload">Descargar mapa combinado</button>
                <button class="rm-btn" id="rmFrameScan">Centrar en la nube</button>
              </div>
            </aside>
          </div>
        </section>
      </div>`;
    document.body.appendChild(this.root);
    this.wire();
  }

  // ------------------------------------------------------------------ utilidades
  private $<T extends HTMLElement = HTMLElement>(id: string): T {
    return this.root.querySelector(`#${id}`) as T;
  }

  private show(step: Step) {
    const panel = step === 'fusion' ? 'preview' : step;
    this.root.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== panel));
    const order: Step[] = ['connect', 'live', 'preview', 'fusion'];
    this.root.querySelectorAll<HTMLElement>('.rm-steps li').forEach((li) => {
      const i = order.indexOf(li.dataset.step as Step), cur = order.indexOf(step);
      li.className = i < cur ? 'done' : (i === cur ? 'current' : '');
    });
  }

  private connectMsg(title: string, msg = '', error = false) {
    this.$('rmConnectTitle').textContent = title;
    this.$('rmConnectMsg').textContent = msg;
    this.$('rmSpinner').classList.toggle('hidden', error);
    this.$('rmRetry').classList.toggle('hidden', !error);
    this.$('rmConnectTitle').classList.toggle('rm-error', error);
  }

  private readSite(): MissionSite {
    const name = (document.getElementById('mapSiteTitle')?.textContent || '').trim();
    return name && !/cargando/i.test(name) ? { name } : {};
  }

  private terrainUrl(): string | null {
    const iframe = document.getElementById('terrain3DIframe') as HTMLIFrameElement | null;
    const src = iframe?.getAttribute('src') || '';
    return src.includes('terrain_3d') ? src : null;
  }

  // ------------------------------------------------------------------ eventos
  private wire() {
    this.$('rmClose').onclick = () => this.close();
    this.$('rmIntegrate').onclick = () => this.integrate();
    this.$('rmRetry').onclick = () => this.start();
    this.$<HTMLFormElement>('rmPair').onsubmit = (e) => {
      e.preventDefault();
      const code = this.$<HTMLInputElement>('rmCode').value.trim();
      if (!/^\d{6}$/.test(code)) { this.$('rmConnectMsg').textContent = 'El código tiene 6 cifras.'; return; }
      this.bridge.setCode(code);
      this.$('rmPair').classList.add('hidden');
      this.start();
    };
    this.$('rmFinish').onclick = () => this.finish();
    this.$('rmAddToMap').onclick = () => this.openFusion();
    this.$('rmFrameScan').onclick = () => this.view?.frame();
    this.$('rmDownload').onclick = () => this.download();
    this.$('rmVR').onclick = async () => {
      try { await this.view?.enterVR(); } catch (e: any) { this.toastSide(`No se pudo entrar en VR: ${e?.message || e}`); }
    };
    const slider = (id: string, key: 'headingDeg' | 'depthM' | 'offsetE' | 'offsetN', fmt: (v: number) => string) => {
      const input = this.$<HTMLInputElement>(id);
      input.oninput = () => {
        const v = parseFloat(input.value);
        this.$(`${id}Val`).textContent = fmt(v);
        this.view?.setPlacement({ [key]: v });
      };
    };
    slider('rmHeading', 'headingDeg', (v) => `${v}°`);
    slider('rmDepth', 'depthM', (v) => `${v} m`);
    slider('rmEast', 'offsetE', (v) => `${v} m`);
    slider('rmNorth', 'offsetN', (v) => `${v} m`);
    const alpha = this.$<HTMLInputElement>('rmAlpha');
    alpha.oninput = () => {
      this.$('rmAlphaVal').textContent = `${Math.round(parseFloat(alpha.value) * 100)} %`;
      this.view?.setTerrainAlpha(parseFloat(alpha.value));
    };
    this.root.querySelectorAll<HTMLButtonElement>('[data-zone]').forEach((b) => (b.onclick = () => {
      this.root.querySelectorAll('[data-zone]').forEach((x) => x.classList.toggle('sel', x === b));
      this.view?.setZone(parseFloat(b.dataset.zone || '60'));
    }));
    // El teclado del PC conduce dentro del iframe: Escape no cierra para no cortar un recorrido por error
  }

  private toastSide(text: string) {
    this.$('rmHonest').textContent = text;
  }

  // ------------------------------------------------------------------ 1-2. conexión y misión
  async open() {
    this.cancelled = false;
    this.site = this.readSite();
    this.$('rmSite').textContent = this.site.name || 'Modelo 3D cargado';
    this.root.classList.remove('hidden');
    document.body.classList.add('rm-open');
    await this.start();
  }

  private async start() {
    if (this.busy) return;
    this.busy = true;
    this.show('connect');
    this.$('rmPair').classList.add('hidden');
    this.connectMsg('Conectando a unidad terrestre…', 'Buscando el backend del robot…');
    try {
      const hello = await this.bridge.hello();
      if (hello.pairing_required && !this.bridge.hasCode()) {
        this.connectMsg('Emparejar con la unidad terrestre', '', true);
        this.$('rmRetry').classList.add('hidden');
        this.$('rmPair').classList.remove('hidden');
        this.$<HTMLInputElement>('rmCode').focus();
        return;
      }
      // terreno: para guardar en la misión dónde se mapeó (y luego para la fusión)
      const url = this.terrainUrl();
      if (url && !this.terrain) {
        try { this.terrain = await loadTerrainFromPlotly(url, this.site.name || ''); } catch { this.terrain = null; }
      }
      if (this.terrain) Object.assign(this.site, { lat: this.terrain.center.lat, lon: this.terrain.center.lon });

      const st = await this.bridge.status();
      if (!st.connected) {
        this.connectMsg('Conectando a unidad terrestre…', 'Estableciendo el enlace WebRTC con el Go2 (puede tardar hasta 30 s)…');
        await this.bridge.connect();
        this.connectedByUs = true;
      }
      if (this.cancelled) return;
      this.connectMsg('Conectando a unidad terrestre…', 'Unidad conectada. Esperando su posición para empezar el mapa…');
      for (let i = 0; ; i++) {
        try { await this.bridge.missionStart(this.site); break; } catch (e) {
          if (!(e instanceof BridgeError) || e.code !== 'pose_not_ready' || i >= 15) throw e;
          await new Promise((r) => setTimeout(r, 1000));
          if (this.cancelled) return;
        }
      }
      this.showLive();
    } catch (e) {
      const err = e as BridgeError;
      if (err.code === 'pairing_required') {
        this.bridge.setCode('');
        this.connectMsg('Código de emparejamiento no válido', 'Vuelve a escribirlo (tras 10 fallos el robot bloquea 60 s).', true);
        this.$('rmRetry').classList.add('hidden');
        this.$('rmPair').classList.remove('hidden');
      } else {
        this.connectMsg('No se pudo conectar con la unidad terrestre', [err.message, err.hint].filter(Boolean).join(' — '), true);
      }
    } finally {
      this.busy = false;
    }
  }

  private showLive() {
    this.show('live');
    const frame = this.$<HTMLIFrameElement>('rmFrame');
    frame.src = this.bridge.missionPageUrl();
    frame.onload = () => { try { frame.contentWindow?.focus(); } catch { /* nada */ } };
  }

  // ------------------------------------------------------------------ 3-4. terminar y vista previa
  private async finish() {
    if (this.busy) return;
    this.busy = true;
    const btn = this.$<HTMLButtonElement>('rmFinish');
    btn.disabled = true;
    btn.textContent = 'Guardando el recorrido…';
    const frame = this.$<HTMLIFrameElement>('rmFrame');
    try {
      frame.contentWindow?.postMessage({ type: 'terrainx-stop' }, location.origin);   // parar antes de nada
      const r = await this.bridge.missionFinish();
      this.cloud = await this.bridge.missionCloud(r.scan.id);
      frame.src = 'about:blank';                 // cierra el canal de control: el robot se detiene
      this.showPreview(r.scan);
    } catch (e) {
      const err = e as BridgeError;
      alert(`No se pudo guardar el recorrido: ${err.message}${err.hint ? ' — ' + err.hint : ''}`);
    } finally {
      btn.disabled = false;
      btn.textContent = '■ Terminar recorrido';
      this.busy = false;
    }
  }

  private ensureView(): FusionView {
    if (!this.view) this.view = new FusionView(this.$<HTMLCanvasElement>('rmCanvas'));
    return this.view;
  }

  private showPreview(scan: any) {
    const c = this.cloud!;
    this.show('preview');
    const view = this.ensureView();
    view.setTerrain(null);
    view.setScan(c);
    requestAnimationFrame(() => { view.resize(); view.frame(); });
    const ext = c.extent_local_m;
    const size = ext.max.map((v, i) => (v - ext.min[i]).toFixed(1)).join(' × ');
    this.$('rmPreviewInfo').innerHTML = html`
      <h3>Recreación 3D del recorrido</h3>
      <table class="rm-table">
        <tr><td>Puntos (cubos de ${c.cube_size_m * 100} cm)</td><td>${c.count.toLocaleString('es-ES')}</td></tr>
        <tr><td>Tamaño (adelante × lado × alto)</td><td>${size} m</td></tr>
        <tr><td>Suelo bajo el punto de partida</td><td>${c.floor_z_local_m == null ? 'no encontrado' : c.floor_z_local_m.toFixed(2) + ' m (estimado)'}</td></tr>
        <tr><td>Escaneo guardado</td><td><code>${scan.id}</code></td></tr>
      </table>`;
    this.$('rmFusionControls').classList.add('hidden');
    this.$('rmAddToMap').classList.toggle('hidden', false);
    this.$('rmIntegrate').classList.add('hidden');
    (this.$('rmAddToMap') as HTMLButtonElement).disabled = !this.terrainUrl();
    this.$('rmDownload').classList.add('hidden');
    this.$('rmVR').classList.add('hidden');
    this.toastSide('Nube DERIVADA del LiDAR del Go2 (mapa acumulado, sin cierre de bucles). Escala real: un cubo = '
      + `${c.cube_size_m} m. Origen = el robot al empezar; adelante = hacia donde miraba.`);
    FusionView.xrSupported().then((ok) => this.$('rmVR').classList.toggle('hidden', !ok));
  }

  // ------------------------------------------------------------------ 5. mapa combinado
  private async openFusion() {
    const view = this.ensureView();
    try {
      if (!this.terrain) {
        const url = this.terrainUrl();
        if (!url) throw new Error('no hay ningún modelo 3D de terreno cargado');
        this.terrain = await loadTerrainFromPlotly(url, this.site.name || '');
      }
    } catch (e: any) {
      this.toastSide(`No se pudo leer el terreno del modelo 3D: ${e?.message || e}`);
      return;
    }
    const g = this.terrain;
    this.show('fusion');
    view.setTerrain(g);
    view.setZone(60);
    this.$('rmFusionControls').classList.remove('hidden');
    this.$('rmAddToMap').classList.add('hidden');
    this.$('rmIntegrate').classList.remove('hidden');
    this.$('rmDownload').classList.remove('hidden');
    this.$('rmPreviewInfo').innerHTML = html`
      <h3>Mapa combinado</h3>
      <p class="rm-note">Terreno de «${g.name || 'modelo 3D'}» (centro ${g.center.lat.toFixed(5)}°, ${g.center.lon.toFixed(5)}°,
        cota ${g.center.elev.toFixed(1)} m) y, debajo, la zona subterránea recorrida por el robot. Escala 1:1 en metros
        en los tres ejes (sin exageración vertical).</p>`;
    this.toastSide(`DEMOSTRACIÓN: el anclaje (posición, rumbo y profundidad) lo declaras tú; el robot no tiene GPS ni
      brújula. Terreno: resolución real ~${Math.round(g.spacingM)} m entre puntos (se dibuja interpolado). Subsuelo:
      cubos de ${this.cloud?.cube_size_m ?? 0.05} m del LiDAR (unidad m asumida: comprobar con cinta métrica).`);
  }

  private download() {
    if (!this.view || !this.cloud) return;
    try {
      const data = this.view.exportCombined({ site: this.site });
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob),
        download: `terrainx_mapa_combinado_${this.cloud.scan_id}.json`,
      });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e: any) {
      this.toastSide(`No se pudo crear el mapa combinado: ${e?.message || e}`);
    }
  }

  // ------------------------------------------------------------------ 6. integrar en el mapa 3D
  private async integrate() {
    const g = this.terrain, view = this.view, c = this.cloud;
    if (!g || !view || !c || this.busy) return;
    this.busy = true;
    const btn = this.$<HTMLButtonElement>('rmIntegrate');
    btn.disabled = true;
    btn.textContent = 'Integrando…';
    try {
      const p = view.getPlacement();
      const cave = await this.bridge.createCave({
        scan_id: c.scan_id,
        name: this.$<HTMLInputElement>('rmCaveName').value.trim() || undefined,
        lat: g.center.lat + p.offsetN / g.mPerDegLat,
        lon: g.center.lon + p.offsetE / g.mPerDegLon,
        surface_elev_m: elevationAt(g, p.offsetE, p.offsetN),
        heading_deg: ((p.headingDeg % 360) + 360) % 360,
        depth_m: p.depthM,
        site: this.site,
        terrain_source: g.sourceUrl.split('?')[0],
      });
      this.busy = false;
      await this.close(true);            // vuelve al «Entorno 3D» (la unidad sigue conectada)
      await this.caves.refresh(cave.id);
      this.caves.toast(`${cave.name} integrada en el mapa 3D · haz clic en su marcador para verla`);
    } catch (e) {
      const err = e as BridgeError;
      this.toastSide(`No se pudo integrar la cueva: ${err.message}${err.hint ? ' — ' + err.hint : ''}`);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Integrar en el mapa 3D';
      this.busy = false;
    }
  }

  // ------------------------------------------------------------------ cierre
  /** Cierra la ventana. `keepUnit`: tras integrar una cueva no se desconecta el robot, para poder
   *  grabar otra enseguida (se desconecta al cerrar con ✕). */
  async close(keepUnit = false) {
    const livePanel = this.root.querySelector('[data-panel="live"]') as HTMLElement;
    const live = !livePanel.classList.contains('hidden');
    if (live && !confirm('¿Cancelar el recorrido? El robot se detendrá y el mapa no se guardará.')) return;
    this.cancelled = true;
    const frame = this.$<HTMLIFrameElement>('rmFrame');
    try { frame.contentWindow?.postMessage({ type: 'terrainx-stop' }, location.origin); } catch { /* nada */ }
    frame.src = 'about:blank';
    this.view?.dispose();
    this.view = null;
    this.cloud = null;
    this.terrain = null;
    this.$<HTMLInputElement>('rmCaveName').value = '';
    this.root.classList.add('hidden');
    document.body.classList.remove('rm-open');
    if (this.connectedByUs && !keepUnit) {
      this.connectedByUs = false;
      try { await this.bridge.disconnect(); } catch { /* el backend ya no está: nada que cerrar */ }
    }
  }
}

/** Añade el botón «Mapear zona subterránea» al panel «Entorno 3D» de la interfaz. */
export function initRobotMission() {
  const actions = document.querySelector('#terrain3DPanel .drawer-actions');
  if (!actions || document.getElementById('btnMapUnderground')) return;
  const bridge = new RobotBridge();
  const caves = new CaveLayer(bridge);           // marcadores de las cuevas ya integradas
  let controller: RobotMissionController | null = null;
  const btn = document.createElement('button');
  btn.id = 'btnMapUnderground';
  btn.className = 'drawer-action-btn rm-launch-btn';
  btn.title = 'Conectar con la unidad terrestre (Go2) y mapear la zona subterránea con su LiDAR';
  btn.innerHTML = html`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 18h18M5 18l3-7 4 4 3-5 4 8"/><circle cx="12" cy="7" r="2"/></svg><span>Mapear zona subterránea</span>`;
  btn.onclick = () => {
    controller = controller || new RobotMissionController(bridge, caves);
    controller.open();
  };
  actions.insertBefore(btn, actions.firstChild);
}
