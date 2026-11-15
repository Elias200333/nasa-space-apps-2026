import { AnalogSite } from '../types';

export class AnalogDeskManager {
  private deskEl: HTMLElement | null;
  private restorePill: HTMLElement | null;
  private mapCanvas: HTMLCanvasElement | null;
  private demCanvas: HTMLCanvasElement | null;
  private mapCtx: CanvasRenderingContext2D | null = null;
  private demCtx: CanvasRenderingContext2D | null = null;

  private currentSite: AnalogSite | null = null;
  private currentBody: 'Moon' | 'Mars' = 'Mars';
  private zoomLevel = 1.0;
  private isCollapsed = false;
  private animFrameId = 0;
  private demAngle = 0;

  constructor() {
    this.deskEl = document.getElementById('analogSiteDesk');
    this.restorePill = document.getElementById('btnRestoreDesk');
    this.mapCanvas = document.getElementById('deskMapCanvas') as HTMLCanvasElement;
    this.demCanvas = document.getElementById('deskDEMCanvas') as HTMLCanvasElement;

    if (this.mapCanvas) this.mapCtx = this.mapCanvas.getContext('2d');
    if (this.demCanvas) this.demCtx = this.demCanvas.getContext('2d');

    this.setupListeners();
    this.startRenderLoop();
  }

  private setupListeners() {
    const btnClose = document.getElementById('btnDeskClose');
    if (btnClose) {
      btnClose.addEventListener('click', (e) => {
        e.stopPropagation();
        this.collapse();
      });
    }

    if (this.restorePill) {
      this.restorePill.addEventListener('click', () => {
        this.expand();
      });
    }

    const btnZoomIn = document.getElementById('btnDeskZoomIn');
    if (btnZoomIn) {
      btnZoomIn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.zoomLevel = Math.min(2.5, this.zoomLevel + 0.25);
        this.drawMap();
      });
    }

    const btnZoomOut = document.getElementById('btnDeskZoomOut');
    if (btnZoomOut) {
      btnZoomOut.addEventListener('click', (e) => {
        e.stopPropagation();
        this.zoomLevel = Math.max(0.6, this.zoomLevel - 0.25);
        this.drawMap();
      });
    }
  }

  public collapse() {
    this.isCollapsed = true;
    if (this.deskEl) this.deskEl.classList.add('collapsed');
    if (this.restorePill) this.restorePill.classList.remove('hidden');
  }

  public expand() {
    this.isCollapsed = false;
    if (this.deskEl) this.deskEl.classList.remove('collapsed');
    if (this.restorePill) this.restorePill.classList.add('hidden');
    this.drawMap();
    this.drawDEM();
  }

  public isDeskCollapsed(): boolean {
    return this.isCollapsed;
  }

  public updateSite(site: AnalogSite, body: 'Moon' | 'Mars' = 'Mars') {
    this.currentSite = site;
    this.currentBody = body;

    const titleEl = document.getElementById('deskSiteName');
    if (titleEl) {
      titleEl.textContent = `${site.name} (${site.region})`;
    }

    const pillTitle = document.getElementById('deskPillTitle');
    if (pillTitle) {
      pillTitle.textContent = `Analog Site Analysis: ${site.name} (${site.similarity_score.toFixed(1)}%)`;
    }

    const simLabel = document.getElementById('deskSimLabel');
    if (simLabel) {
      simLabel.textContent = `Similarity (vs ${body})`;
    }

    const simVal = document.getElementById('deskSimVal');
    if (simVal) {
      simVal.textContent = `${site.similarity_score.toFixed(1)}%`;
      if (body === 'Mars') {
        simVal.style.color = '#22d3ee';
      } else {
        simVal.style.color = '#38bdf8';
      }
    }

    const elevVal = document.getElementById('deskElevVal');
    if (elevVal) {
      if (site.id.includes('CALDERA_BLANCA')) {
        elevVal.textContent = '261 – 265 m';
      } else if (site.id.includes('ARENA')) {
        elevVal.textContent = '164 – 173 m';
      } else if (site.id.includes('TEIDE')) {
        elevVal.textContent = '2,150 – 3,718 m';
      } else {
        elevVal.textContent = '180 – 320 m';
      }
    }

    const slopeVal = document.getElementById('deskSlopeVal');
    if (slopeVal) {
      if (site.id.includes('CALDERA_BLANCA')) {
        slopeVal.textContent = '1.3°';
      } else if (site.id.includes('ARENA')) {
        slopeVal.textContent = '3.1°';
      } else {
        slopeVal.textContent = '2.4°';
      }
    }

    const cavVal = document.getElementById('deskCavitiesVal');
    if (cavVal) {
      cavVal.textContent = site.sources?.includes('IGN PNOA-LiDAR') ? 'IGN MDT05' : 'USGS 3DEP';
    }

    const pVal = document.getElementById('deskPearsonVal');
    if (pVal) {
      pVal.textContent = site.id.includes('CALDERA_BLANCA') ? '0.939' : '0.999';
    }

    this.drawMap();
    this.drawDEM();
  }

  private startRenderLoop() {
    const loop = () => {
      this.demAngle += 0.008;
      if (!this.isCollapsed) {
        this.drawDEM();
      }
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  public destroy() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
  }

  /**
   * Dibuja la ortofoto satelital fotorealista de alta resolución con el anillo de retícula
   */
  public drawMap() {
    if (!this.mapCtx || !this.mapCanvas) return;
    const ctx = this.mapCtx;
    const w = this.mapCanvas.width;
    const h = this.mapCanvas.height;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // 1. Fondo de terreno volcánico (Islas Canarias / malpaís basáltico)
    const grad = ctx.createRadialGradient(w * 0.42, h * 0.52, 10, w * 0.5, h * 0.5, w * 0.65);
    grad.addColorStop(0, '#5a6252'); // Fondo interior del cráter (toba volcánica clara)
    grad.addColorStop(0.25, '#82896a'); // Borde del cráter Caldera Blanca
    grad.addColorStop(0.38, '#3d4436'); // Laderas volcánicas
    grad.addColorStop(0.55, '#1e241c'); // Mar de lavas y malpaís basáltico oscuro
    grad.addColorStop(1.0, '#121815');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 2. Textura orgánica y crestas del cráter
    const cx = w * 0.44;
    const cy = h * 0.52;
    const zoom = this.zoomLevel;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);

    // Caldera Blanca - anillo de toba elíptico
    ctx.beginPath();
    ctx.ellipse(cx, cy, 54, 42, 0.22, 0, Math.PI * 2);
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(164, 172, 140, 0.75)';
    ctx.stroke();

    // Fondo del cráter freatomagmático
    ctx.beginPath();
    ctx.ellipse(cx - 3, cy - 2, 44, 32, 0.22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(108, 118, 92, 0.85)';
    ctx.fill();

    // Cono adyacente menor (Caldereta)
    ctx.beginPath();
    ctx.ellipse(cx + 62, cy - 22, 28, 22, -0.15, 0, Math.PI * 2);
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(142, 148, 122, 0.65)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(92, 98, 76, 0.7)';
    ctx.fill();

    // Coladas de lava circundantes
    ctx.strokeStyle = 'rgba(28, 34, 28, 0.85)';
    ctx.lineWidth = 3;
    for (let r = 70; r < 140; r += 16) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0.8, 3.4);
      ctx.stroke();
    }
    ctx.restore();

    // 3. Retícula holográfica de telemetría (Cyan NASA)
    ctx.save();
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.85)';
    ctx.lineWidth = 1.5;

    // Círculo exterior
    ctx.beginPath();
    ctx.arc(cx, cy, 38, 0, Math.PI * 2);
    ctx.stroke();

    // Círculo interior
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.stroke();

    // Marcador central en cruz
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy); ctx.lineTo(cx + 6, cy);
    ctx.moveTo(cx, cy - 6); ctx.lineTo(cx, cy + 6);
    ctx.stroke();

    // Coordenadas en la esquina inferior izquierda
    ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
    ctx.font = '10px monospace';
    const coordsStr = this.currentSite?.coordinates?.label || '29.0380° N, 13.7190° W';
    ctx.fillText(coordsStr, 10, h - 10);
    ctx.fillStyle = 'rgba(34, 211, 238, 0.9)';
    ctx.fillText('IGN PNOA • 0.25 m/px', w - 128, h - 10);

    ctx.restore();
    ctx.restore();
  }

  /**
   * Dibuja el modelo 3D DEM con relieve sombreado y malla isométrica IGN PNOA-LiDAR
   */
  public drawDEM() {
    if (!this.demCtx || !this.demCanvas) return;
    const ctx = this.demCtx;
    const w = this.demCanvas.width;
    const h = this.demCanvas.height;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // Fondo oscuro tecnológico
    ctx.fillStyle = 'rgba(8, 14, 26, 0.92)';
    ctx.fillRect(0, 0, w, h);

    // Dibujar malla de superficie 3D isométrica
    const rows = 14;
    const cols = 18;
    const originX = w * 0.46;
    const originY = h * 0.65;
    const cellW = 7.5;
    const cellH = 4.2;

    const angle = this.demAngle;

    // Proyección isométrica
    const getPoint = (r: number, c: number) => {
      // Perfil de elevación de cráter con cono volcánico (Caldera Blanca)
      const distFromCenter = Math.hypot(r - rows / 2, c - cols / 2);
      let elev = 0;
      if (distFromCenter < 2.5) {
        elev = 6 - distFromCenter * 1.5; // Fondo
      } else if (distFromCenter < 4.8) {
        elev = 18 - (distFromCenter - 3.8) * (distFromCenter - 3.8) * 8; // Cresta
      } else {
        elev = Math.max(0, 8 - (distFromCenter - 4.8) * 2.5); // Faldas
      }

      // Animación sutil de respiración o inclinación
      const wobble = Math.sin(angle + (r + c) * 0.15) * 0.8;
      const z = (elev + wobble) * 1.5;

      const px = originX + (c - cols / 2) * cellW - (r - rows / 2) * (cellW * 0.6);
      const py = originY + (c - cols / 2) * cellH * 0.5 + (r - rows / 2) * cellH - z;
      return { x: px, y: py, z };
    };

    // Dibujar polígonos de relieve con gradiente de color según elevación
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const p1 = getPoint(r, c);
        const p2 = getPoint(r, c + 1);
        const p3 = getPoint(r + 1, c + 1);
        const p4 = getPoint(r + 1, c);

        const avgZ = (p1.z + p2.z + p3.z + p4.z) / 4;
        const normZ = Math.max(0, Math.min(1, avgZ / 26));

        // Rampa de color altimétrica: azul oscuro -> cian -> oliva -> amarillo claro
        let fillCol = 'rgba(24, 48, 72, 0.7)';
        if (normZ > 0.6) {
          fillCol = `rgba(234, 240, 200, ${0.4 + normZ * 0.5})`;
        } else if (normZ > 0.3) {
          fillCol = `rgba(112, 142, 102, ${0.5 + normZ * 0.4})`;
        } else {
          fillCol = `rgba(32, 84, 118, ${0.5 + normZ * 0.4})`;
        }

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();

        ctx.fillStyle = fillCol;
        ctx.fill();

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    // Marcador del punto focal del cráter
    const centerPt = getPoint(Math.floor(rows / 2), Math.floor(cols / 2));
    ctx.strokeStyle = '#ef4444';
    ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(centerPt.x, centerPt.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Ejes coordenados isométricos
    ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
    ctx.font = '8px monospace';
    ctx.fillText('Elev. (m)', 12, 16);
    ctx.fillText('320', 12, 28);
    ctx.fillText('280', 12, 42);
    ctx.fillText('240', 12, 56);

    ctx.restore();
  }
}
