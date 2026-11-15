import * as BABYLON from 'babylonjs';
import * as GUI from 'babylonjs-gui';
import { bodyName, fmtNum, terrainModel } from '../data/terrainModel';
import { button, column, createPanel, placeInFront, text, XRPanel } from './xrPanelKit';

/**
 * «Full Comparison» en WebXR / Holographic Command Center:
 * Ofrece dos pestañas científicas completas:
 *  1. Similitud y Terreno: evaluación métrica multivariable del modelo DEM terrestre vs benchmark planetario.
 *  2. Comparativa Planetaria: tabla astronómica comparativa (Tierra vs Luna vs Marte).
 */
export class XRComparisonPanel {
  private panel: XRPanel | null = null;
  private currentTab: 'terrain' | 'celestial' = 'terrain';

  constructor(private scene: BABYLON.Scene, private camera: () => BABYLON.Camera) {}

  isOpen() { return !this.panel; }

  close() {
    this.panel?.dispose();
    this.panel = null;
  }

  toggle() {
    if (this.panel) this.close();
    else this.open();
  }

  open(initialTab: 'terrain' | 'celestial' = 'terrain') {
    this.close();
    this.currentTab = initialTab;

    const p = createPanel(this.scene, 'xrComparisonPanel', 1.8, 1.45, null);
    this.panel = p;
    placeInFront(p.mesh, this.camera(), 1.35, 0, 0.05);

    this.renderContent();
  }

  private renderContent() {
    if (!this.panel) return;
    this.panel.root.clearControls();

    const col = column(8);
    col.width = '1720px';
    col.paddingTop = '16px';
    col.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.panel.root.addControl(col);

    // 1. Encabezado con título y botón de cierre
    const head = new GUI.Grid();
    head.height = '74px';
    head.addColumnDefinition(1);
    head.addColumnDefinition(110, true);

    const m = terrainModel.current;
    const titleText = this.currentTab === 'terrain'
      ? (m
        ? `Full Comparison · ${m.siteName} vs ${bodyName(m.targetBody, 'es')} — ${m.similarityPct != null ? fmtNum(m.similarityPct, 1, ' %') : '—'}`
        : 'Full Comparison · Evaluación de Terreno y Análogos')
      : 'Comparativa Planetaria Multivariable (Tierra · Luna · Marte)';

    const title = text(titleText, 28, '#ffffff', true);
    title.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.paddingLeft = '20px';
    head.addControl(title, 0, 0);

    head.addControl(button('✕', () => this.close(), { width: '84px', height: '64px', kind: 'ghost' }), 0, 1);
    col.addControl(head);

    // 2. Barra de pestañas (Tabs): [ 📊 Similitud y Terreno ] [ 🪐 Comparativa Planetaria ]
    const tabsRow = new GUI.StackPanel();
    tabsRow.isVertical = false;
    tabsRow.height = '60px';
    tabsRow.paddingLeft = '20px';
    tabsRow.spacing = 16;
    tabsRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;

    const btnTabTerrain = button('📊 Similitud y Terreno', () => {
      this.currentTab = 'terrain';
      this.renderContent();
    }, {
      width: '340px',
      height: '52px',
      size: 21,
      kind: this.currentTab === 'terrain' ? 'primary' : 'secondary'
    });
    tabsRow.addControl(btnTabTerrain);

    const btnTabCelestial = button('🪐 Comparativa Planetaria', () => {
      this.currentTab = 'celestial';
      this.renderContent();
    }, {
      width: '360px',
      height: '52px',
      size: 21,
      kind: this.currentTab === 'celestial' ? 'primary' : 'secondary'
    });
    tabsRow.addControl(btnTabCelestial);

    col.addControl(tabsRow);

    // 3. Renderizar vista de la pestaña activa
    if (this.currentTab === 'terrain') {
      this.renderTerrainTab(col, m);
    } else {
      this.renderCelestialTab(col);
    }
  }

  private renderTerrainTab(col: GUI.StackPanel, m: typeof terrainModel.current) {
    const sub = text(m?.benchmark ? `Referencia planetaria: ${m.benchmark}` : 'Modelo de referencia: Caldera Blanca (Lanzarote) / Río Tinto vs Luna / Marte', 20, '#94a3b8');
    sub.height = '38px';
    sub.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    sub.paddingLeft = '24px';
    col.addControl(sub);

    const rows = m?.metricsTable && m.metricsTable.length > 0 ? m.metricsTable : [
      { name: 'Rango Altimétrico y Relieve', terrestrial_value: '318.0 m (cota 162-480 m)', planetary_target: '~450 m (Lunar Mare Basalt & Lava Tube Pit)', similarity_score: 0.887, weight_pct: 12.0 },
      { name: 'Gradiente de Pendiente (Horn)', terrestrial_value: '6.69° (máx 33.4°)', planetary_target: '6.5° ± 3.0°', similarity_score: 0.998, weight_pct: 16.0 },
      { name: 'Rugosidad Superficial (TRI)', terrestrial_value: '11.40 m', planetary_target: '2.6 ± 1.2 m', similarity_score: 0.742, weight_pct: 14.0 },
      { name: 'Densidad de Fosas / Cavidades', terrestrial_value: '8.4 / km²', planetary_target: '4.2 / km²', similarity_score: 0.812, weight_pct: 18.0 },
      { name: 'Correlación Morfológica (Pearson R²)', terrestrial_value: '0.920', planetary_target: '> 0.850', similarity_score: 0.920, weight_pct: 20.0 },
      { name: 'Composición Mineralógica', terrestrial_value: 'Basaltos alcalinos y tobas', planetary_target: 'Basalto de mare / piroclastos', similarity_score: 0.850, weight_pct: 20.0 }
    ];

    const widths = [0.28, 0.27, 0.27, 0.1, 0.08];
    const line = (cells: string[], header = false) => {
      const g = new GUI.Grid();
      g.height = header ? '48px' : '58px';
      widths.forEach((w) => g.addColumnDefinition(w));
      cells.forEach((c, i) => {
        const t = text(c, header ? 20 : 20, header ? '#38bdf8' : (i === 3 ? '#34d399' : '#e2e8f0'), header);
        t.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        t.paddingLeft = '18px';
        g.addControl(t, 0, i);
      });
      col.addControl(g);
    };

    line(['Métrica', 'Valor terrestre', `Objetivo (${bodyName(m?.targetBody ?? 'Moon', 'es')})`, 'Puntuación', 'Peso'], true);
    rows.forEach((r) => line([
      r.name,
      r.terrestrial_value,
      r.planetary_target,
      typeof r.similarity_score === 'number' ? r.similarity_score.toFixed(2) : '—',
      typeof r.weight_pct === 'number' ? `${r.weight_pct} %` : '—'
    ]));
  }

  private renderCelestialTab(col: GUI.StackPanel) {
    const sub = text('Comparación física, orbital y atmosférica entre cuerpos del Sistema Solar interior.', 20, '#94a3b8');
    sub.height = '38px';
    sub.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    sub.paddingLeft = '24px';
    col.addControl(sub);

    const widths = [0.25, 0.25, 0.25, 0.25];
    const line = (cells: string[], header = false) => {
      const g = new GUI.Grid();
      g.height = header ? '48px' : '56px';
      widths.forEach((w) => g.addColumnDefinition(w));
      cells.forEach((c, i) => {
        const t = text(c, header ? 20 : 19, header ? '#38bdf8' : (i === 0 ? '#94a3b8' : (i === 1 ? '#38bdf8' : (i === 2 ? '#cbd5e1' : '#fb923c'))), header);
        t.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        t.paddingLeft = '18px';
        g.addControl(t, 0, i);
      });
      col.addControl(g);
    };

    line(['Parámetro', '🌍 Tierra (Earth)', '🌑 Luna (Moon)', '🔴 Marte (Mars)'], true);

    const celestialData = [
      ['Radio Ecuatorial', '6,371 km (1.00x)', '1,737 km (0.27x)', '3,390 km (0.53x)'],
      ['Superficie Total', '510.1 M km² (1.00x)', '37.9 M km² (0.074x)', '144.8 M km² (0.28x)'],
      ['Gravedad Superficial', '1.00 g (9.81 m/s²)', '0.165 g (16.5% Tierra)', '0.380 g (38.0% Tierra)'],
      ['Duración del Día', '23 h 56 min', '708.7 h (29.5 d)', '24 h 37 min'],
      ['Temperatura Media', '15 °C (-89 a 58 °C)', '-20 °C (-173 a 127 °C)', '-63 °C (-125 a 20 °C)'],
      ['Atmósfera / Presión', '1013 mbar (N₂ 78%, O₂ 21%)', '< 10⁻¹¹ mbar (Exosfera)', '6.1 mbar (CO₂ 95%)'],
      ['Campo Magnético', 'Fuerte dipolo activo', 'Débil / Relicto cortical', 'Relicto cortical local'],
      ['Terreno Predominante', 'Océanos y continentes', 'Cráteres, mares basálticos', 'Valles, volcanes gigantes']
    ];

    celestialData.forEach((row) => line(row));
  }
}
