/**
 * Cliente del backend del robot (módulo robot/ de TERRAIN-X) desde la interfaz.
 *
 * Vite reenvía `/robot/*` a http://127.0.0.1:8777 (ver vite.config.ts). Desde este mismo PC no
 * hace falta nada más; desde las gafas XR u otro equipo el backend pide el CÓDIGO DE
 * EMPAREJAMIENTO que imprime al arrancar (`python -m terrainx_robot dashboard`) y que muestra su
 * panel «Diagnóstico». Se guarda solo en esta pestaña (sessionStorage).
 */

const BASE = '/robot';
const CODE_KEY = 'terrainx_robot_code';

export interface BridgeHello {
  service: string;
  unit: string;
  model_variant: string | null;
  pairing_required: boolean;
  connected: boolean;
}

export interface MissionSite {
  name?: string;
  lat?: number;
  lon?: number;
  body?: string;
}

/** Nube del recorrido en el marco local de la misión (<scan_id>.mission.json). */
export interface MissionCloud {
  scan_id: string;
  mission_id: string;
  frame: string;
  unit: string;
  units_verification: string;
  evidence_class: string;
  cube_size_m: number;
  count: number;
  floor_z_local_m: number | null;
  floor_method: string;
  start_pose_odom: { x: number; y: number; z: number; yaw: number };
  extent_local_m: { min: number[]; max: number[] };
  site?: MissionSite | null;
  points: number[][];
}

export class BridgeError extends Error {
  constructor(public status: number, public code: string, message: string, public hint?: string) {
    super(message);
  }
}

function readCode(): string {
  try { return sessionStorage.getItem(CODE_KEY) || ''; } catch { return ''; }
}

export class RobotBridge {
  private code = readCode();

  setCode(code: string) {
    this.code = code.trim();
    try { sessionStorage.setItem(CODE_KEY, this.code); } catch { /* sin almacenamiento: solo en memoria */ }
  }

  hasCode(): boolean {
    return this.code.length > 0;
  }

  /** URL de una ruta del backend del robot (con el código si lo hay). */
  url(path: string): string {
    if (!this.code) return BASE + path;
    return `${BASE}${path}${path.includes('?') ? '&' : '?'}code=${encodeURIComponent(this.code)}`;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let r: Response;
    try {
      r = await fetch(BASE + path, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(this.code ? { 'X-TerrainX-Code': this.code } : {}) },
      });
    } catch {
      throw new BridgeError(0, 'no_backend', 'No responde el backend del robot.',
        'Lanza en el PC: python -m terrainx_robot dashboard (y la interfaz con npm run dev).');
    }
    const text = await r.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    if (!r.ok) {
      if (r.status === 502 && !text) {
        throw new BridgeError(502, 'no_backend', 'No responde el backend del robot.',
          'Lanza en el PC: python -m terrainx_robot dashboard');
      }
      const d = data.detail;
      if (d && typeof d === 'object') throw new BridgeError(r.status, d.code || 'error', d.message || r.statusText, d.hint);
      throw new BridgeError(r.status, 'error', typeof d === 'string' ? d : (r.statusText || `HTTP ${r.status}`));
    }
    return data as T;
  }

  hello() { return this.request<BridgeHello>('/api/bridge/hello'); }
  status() { return this.request<any>('/api/status'); }
  connect() { return this.request<any>('/api/connect', { method: 'POST' }); }
  disconnect() { return this.request<any>('/api/disconnect', { method: 'POST' }); }
  missionStart(site: MissionSite) {
    return this.request<any>('/api/mission/start', { method: 'POST', body: JSON.stringify({ site }) });
  }
  missionFinish() { return this.request<any>('/api/mission/finish', { method: 'POST' }); }
  missionCloud(scanId: string) {
    return this.request<MissionCloud>(`/api/scans/${encodeURIComponent(scanId)}/download?format=mission`);
  }

  /** Página de la misión del backend (cámara, LiDAR acumulado y conducción) para el iframe. */
  missionPageUrl(): string {
    return this.url('/mision');
  }
}
