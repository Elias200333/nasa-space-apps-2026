import * as BABYLON from 'babylonjs';
import * as GUI from 'babylonjs-gui';
import { ANALOG_DATABASE } from '../data/analogs';
import { button, column, createPanel, placeInFront, text, XRPanel } from './xrPanelKit';

/**
 * Panel «Top 10 análogos» de las gafas: el ranking que ya calculó main.py (GET /api/candidates,
 * sin regenerar). Al elegir uno se llama a `onSelect` (orientar el globo y pedir su modelo de
 * terreno real), como hace la web al bajar a un análogo.
 */
export interface AnalogItem {
  id: string;
  name: string;
  country?: string;
  lat: number;
  lon: number;
  score_pct?: number;
  rank?: number;
}

export class XRAnalogPanel {
  private panel: XRPanel | null = null;
  private body: 'Moon' | 'Mars' = 'Moon';

  constructor(private scene: BABYLON.Scene, private camera: () => BABYLON.Camera,
    private onSelect: (item: AnalogItem, body: 'Moon' | 'Mars') => void) {}

  isOpen() { return !!this.panel; }

  close() {
    this.panel?.dispose();
    this.panel = null;
  }

  async open(body: 'Moon' | 'Mars') {
    this.close();
    this.body = body;
    const p = createPanel(this.scene, 'xrAnalogPanel', 1.1, 1.5, null);
    this.panel = p;
    placeInFront(p.mesh, this.camera(), 1.25, -0.62, -0.08);

    const col = column(10);
    col.paddingTop = '24px';
    col.width = '1040px';
    col.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    p.root.addControl(col);

    const head = new GUI.Grid();
    head.height = '90px';
    head.addColumnDefinition(1);
    head.addColumnDefinition(110, true);
    const title = text(`Top 10 análogos · ${body === 'Moon' ? 'Luna' : 'Marte'}`, 38, '#ffffff', true);
    title.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.paddingLeft = '20px';
    head.addControl(title, 0, 0);
    head.addControl(button('✕', () => this.close(), { width: '90px', height: '74px', kind: 'ghost' }), 0, 1);
    col.addControl(head);

    const sub = text('Ranking de main.py (caché, sin recalcular). Elige uno: el globo va al sitio y se carga su modelo de terreno real.', 22, '#94a3b8');
    sub.height = '64px';
    sub.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    sub.paddingLeft = '20px';
    col.addControl(sub);

    const status = text('Cargando ranking…', 24, '#94a3b8');
    status.height = '60px';
    col.addControl(status);

    let items: AnalogItem[] = [];
    try {
      const r = await fetch(`/api/candidates?body=${body.toLowerCase()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      items = ((await r.json()).candidates || []).slice(0, 10);
    } catch {
      // Fallback a catálogo sincronizado local
      const catalog = ANALOG_DATABASE.filter(s => s.target_body === body).slice(0, 10);
      items = catalog.map((s, idx) => ({
        id: s.id,
        name: s.name,
        country: s.country,
        lat: s.coordinates.latitude,
        lon: s.coordinates.longitude,
        score_pct: s.similarity_score,
        rank: s.rank || (idx + 1)
      }));
    }
    if (this.panel !== p) return;
    if (!items.length) { status.text = 'No hay ranking calculado para este cuerpo.'; return; }
    col.removeControl(status);

    for (const it of items) {
      const short = it.name.split(' — ')[0].split('(')[0].trim();
      const label = `#${it.rank ?? ''}  ${short.length > 44 ? short.slice(0, 43) + '…' : short}\n${it.country || ''}${it.score_pct != null ? `   ·   ${it.score_pct.toFixed(1)} %` : ''}`;
      const b = button(label, () => {
        this.onSelect(it, this.body);
        this.close();
      }, { width: '1000px', height: '106px', size: 25 });
      if (b.textBlock) {
        b.textBlock.textWrapping = true;
        b.textBlock.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        b.textBlock.paddingLeft = '26px';
      }
      col.addControl(b);
    }
  }
}
