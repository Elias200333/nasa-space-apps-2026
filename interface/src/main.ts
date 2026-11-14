import './styles.css';
import { EarthSceneManager } from './babylon/earthScene';
import { MiniPlanetViewer } from './babylon/miniPlanets';
import { generateRandomAnalogCoordinates, PLANET_METRICS, ANALOG_DATABASE } from './data/analogs';
import { sound } from './audio';
import { CelestialBody, AnalogSite } from './types';

// Estado global de la aplicación
let activeBody: CelestialBody = 'Earth';
let currentSelectedSite: AnalogSite | null = null;
let earthScene: EarthSceneManager;
let miniMoon: MiniPlanetViewer;
let miniMars: MiniPlanetViewer;

document.addEventListener('DOMContentLoaded', () => {
  initBabylonScenes();
  setupUIEventListeners();
  updateLiveTelemetry(0.0000, 0.0000);
});

/**
 * Inicialización de las escenas 3D en BabylonJS
 */
function initBabylonScenes() {
  const earthCanvas = document.getElementById('earthCanvas') as HTMLCanvasElement;
  if (earthCanvas) {
    earthScene = new EarthSceneManager(earthCanvas);
    earthScene.onCoordinatesChange = (lat, lon) => {
      // Actualizar lectura de HUD en tiempo real
      const latDir = lat >= 0 ? 'N' : 'S';
      const lonDir = lon >= 0 ? 'E' : 'W';
      const coordsText = `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lon).toFixed(4)}° ${lonDir}`;
      const readoutElem = document.getElementById('hudCoordsText');
      if (readoutElem) {
        readoutElem.textContent = coordsText;
      }
    };
  }

  // Miniaturas 3D en tarjetas
  const miniMoonCanvas = document.getElementById('miniMoonCanvas') as HTMLCanvasElement;
  if (miniMoonCanvas) {
    miniMoon = new MiniPlanetViewer(miniMoonCanvas, 'Moon');
  }

  const miniMarsCanvas = document.getElementById('miniMarsCanvas') as HTMLCanvasElement;
  if (miniMarsCanvas) {
    miniMars = new MiniPlanetViewer(miniMarsCanvas, 'Mars');
  }
}

/**
 * Configuración de eventos de interacción y botones del panel
 */
function setupUIEventListeners() {
  // 1. Selector Superior Central (Moon / Earth / Mars)
  const selectorOptions = document.querySelectorAll('.selector-option');
  selectorOptions.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target') as CelestialBody;
      sound.playClick(600);
      selectCelestialTarget(target);
    });
  });

  // 2. Clic en las tarjetas laterales completas o botones de acción
  const moonCard = document.getElementById('moonCard');
  if (moonCard) {
    moonCard.addEventListener('click', (e) => {
      // Evitar doble disparo si se hace clic en subpestañas
      if ((e.target as HTMLElement).closest('.card-subtabs')) return;
      selectCelestialTarget('Moon');
    });
  }

  const marsCard = document.getElementById('marsCard');
  if (marsCard) {
    marsCard.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.card-subtabs')) return;
      selectCelestialTarget('Mars');
    });
  }

  // 3. Botones de acción "Compare with Earth"
  const moonActionBtn = document.getElementById('moonActionBtn');
  if (moonActionBtn) {
    moonActionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectCelestialTarget('Moon');
    });
  }

  const marsActionBtn = document.getElementById('marsActionBtn');
  if (marsActionBtn) {
    marsActionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectCelestialTarget('Mars');
    });
  }

  // 4. Barra de herramientas flotante sobre la Tierra
  const btnResetEarth = document.getElementById('btnResetEarth');
  if (btnResetEarth) {
    btnResetEarth.addEventListener('click', () => {
      sound.playClick(500);
      earthScene.resetToGlobalView();
      hideTargetCard();
    });
  }

  const btnRandomTarget = document.getElementById('btnRandomTarget');
  if (btnRandomTarget) {
    btnRandomTarget.addEventListener('click', () => {
      // Generar nuevas coordenadas aleatorias según el modo actual o alternar
      const target: 'Moon' | 'Mars' = activeBody === 'Mars' ? 'Mars' : 'Moon';
      generateAndFocusCoordinates(target);
    });
  }

  const btnZoomIn = document.getElementById('btnZoomIn');
  if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => {
      sound.playClick(750);
      earthScene.zoomIn();
    });
  }

  const btnZoomOut = document.getElementById('btnZoomOut');
  if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => {
      sound.playClick(450);
      earthScene.zoomOut();
    });
  }

  const btnFullscreen = document.getElementById('btnFullscreen');
  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', () => {
      sound.playClick(800);
      toggleFullscreen();
    });
  }

  // 5. Pestañas de subcategoría dentro de las tarjetas (Overview, Terrain, Geology, Data)
  setupCardSubtabs('moonCard', 'Moon');
  setupCardSubtabs('marsCard', 'Mars');
}

/**
 * Selecciona un cuerpo celeste (Moon o Mars) o restablece a Earth:
 * Genera coordenadas aleatorias en el código y anima la Tierra hacia ellas
 */
export function selectCelestialTarget(body: CelestialBody) {
  activeBody = body;

  // Actualizar selector visual superior
  document.querySelectorAll('.selector-option').forEach(el => {
    el.classList.remove('active', 'mars-active');
    if (el.getAttribute('data-target') === body) {
      el.classList.add('active');
      if (body === 'Mars') el.classList.add('mars-active');
    }
  });

  // Resaltar tarjeta lateral correspondiente
  const moonCard = document.getElementById('moonCard');
  const marsCard = document.getElementById('marsCard');
  moonCard?.classList.remove('card-selected');
  marsCard?.classList.remove('card-selected', 'mars-selected');

  if (body === 'Moon') {
    moonCard?.classList.add('card-selected');
    miniMoon?.spinFast();
    generateAndFocusCoordinates('Moon');
  } else if (body === 'Mars') {
    marsCard?.classList.add('card-selected', 'mars-selected');
    miniMars?.spinFast();
    generateAndFocusCoordinates('Mars');
  } else {
    // Si selecciona Earth, restablece la vista global
    earthScene.resetToGlobalView();
    hideTargetCard();
  }
}

/**
 * LÓGICA CLAVE SOLICITADA:
 * 1. Genera coordenadas aleatorias en el código para análogos terrestres de Luna o Marte
 * 2. La Tierra 3D en BabylonJS rota y se acerca suavemente a esas coordenadas generadas
 */
function generateAndFocusCoordinates(body: 'Moon' | 'Mars') {
  // Generar coordenadas aleatorias en el código
  const result = generateRandomAnalogCoordinates(body);
  currentSelectedSite = result.site;

  const lat = result.coordinates.latitude;
  const lon = result.coordinates.longitude;

  // Efectos de sonido procedurales de cabina espacial
  sound.playTargetLock();
  setTimeout(() => sound.playWhoosh(), 200);

  // Animación de cámara y baliza 3D en BabylonJS hacia las coordenadas generadas
  earthScene.animateToCoordinates(lat, lon, 4.6, 2000);

  // Mostrar tarjeta HUD con datos científicos del análogo
  showTargetCard(result.site, body);

  // Mostrar notificación toast de telemetría de fijación
  showTelemetryToast(result.site);
}

/**
 * Muestra el panel flotante HUD con la información del análogo seleccionado
 */
function showTargetCard(site: AnalogSite, body: 'Moon' | 'Mars') {
  let card = document.getElementById('targetSiteCard');
  if (!card) {
    card = document.createElement('div');
    card.id = 'targetSiteCard';
    card.className = 'target-site-card';
    document.querySelector('.main-stage')?.appendChild(card);
  }

  const badgeClass = body === 'Moon' ? 'moon-badge' : 'mars-badge';
  card.innerHTML = `
    <div class="site-badge ${badgeClass}">${body} Analog</div>
    <div class="site-info-text">
      <h4>${site.name}</h4>
      <p>📍 ${site.region}, ${site.country} — <span style="color:var(--cyan-glow);">${site.coordinates.label}</span></p>
      <p style="font-size:0.7rem; color:var(--text-dim); margin-top:2px;">🔬 ${site.scientific_justification}</p>
    </div>
    <div class="site-score-pill">
      <span class="score-num">${site.similarity_score}%</span>
      <span class="score-lbl">Similitud</span>
    </div>
  `;
  card.style.display = 'flex';
}

function hideTargetCard() {
  const card = document.getElementById('targetSiteCard');
  if (card) {
    card.style.display = 'none';
  }
}

/**
 * Notificación emergente temporal de telemetría
 */
function showTelemetryToast(site: AnalogSite) {
  // Eliminar toast anterior si existiera
  const oldToast = document.querySelector('.telemetry-toast');
  oldToast?.remove();

  const toast = document.createElement('div');
  toast.className = 'telemetry-toast';
  toast.innerHTML = `
    <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="2" x2="12" y2="6"></line>
      <line x1="12" y1="18" x2="12" y2="22"></line>
      <line x1="2" y1="12" x2="6" y2="12"></line>
      <line x1="18" y1="12" x2="22" y2="12"></line>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
    <div class="toast-text">
      <h5>ANÁLOGO DETECTADO [${site.target_body.toUpperCase()}]</h5>
      <p>Coordenadas fijadas: ${site.coordinates.label}</p>
    </div>
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.4s ease';
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

function setupCardSubtabs(cardId: string, body: 'Moon' | 'Mars') {
  const card = document.getElementById(cardId);
  if (!card) return;

  const buttons = card.querySelectorAll('.subtab-btn');
  const metrics = PLANET_METRICS[body];

  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sound.playClick(700);

      const tab = btn.getAttribute('data-tab');
      // Actualizar texto explicativo o métricas dinámicamente si se desea
      const dominantEl = card.querySelector('.metric-val.dominant');
      if (dominantEl && tab === 'Geology') {
        dominantEl.textContent = body === 'Moon' ? 'Anortosita, basalto' : 'Óxidos, jarosita, basalto';
      } else if (dominantEl && tab === 'Terrain') {
        dominantEl.textContent = metrics.dominant_terrain;
      }
    });
  });
}

function updateLiveTelemetry(lat: number, lon: number) {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  const readout = document.getElementById('hudCoordsText');
  if (readout) {
    readout.textContent = `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lon).toFixed(4)}° ${lonDir}`;
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

