import './styles.css';
import { EarthSceneManager } from './babylon/earthScene';
import { MiniPlanetViewer } from './babylon/miniPlanets';
import { AnalogMap2DManager } from './map/analogMap2D';
import { generateRandomAnalogCoordinates, PLANET_METRICS } from './data/analogs';
import { sound } from './audio';
import { CelestialBody, AnalogSite } from './types';

// Estado global de la aplicación
let activeBody: CelestialBody = 'Earth';
let currentSelectedSite: AnalogSite | null = null;
let earthScene: EarthSceneManager;
let miniMoon: MiniPlanetViewer;
let miniMars: MiniPlanetViewer;
let map2DManager: AnalogMap2DManager;

document.addEventListener('DOMContentLoaded', () => {
  initBabylonScenes();
  init2DMapManager();
  setupUIEventListeners();
  updateLiveTelemetry(0.0000, 0.0000);
});

/**
 * Inicialización de las escenas 3D fotorrealistas en BabylonJS
 */
function initBabylonScenes() {
  const earthCanvas = document.getElementById('earthCanvas') as HTMLCanvasElement;
  if (earthCanvas) {
    earthScene = new EarthSceneManager(earthCanvas);
    earthScene.onCoordinatesChange = (lat, lon) => {
      const latDir = lat >= 0 ? 'N' : 'S';
      const lonDir = lon >= 0 ? 'E' : 'W';
      const coordsText = `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lon).toFixed(4)}° ${lonDir}`;
      const readoutElem = document.getElementById('hudCoordsText');
      if (readoutElem) {
        readoutElem.textContent = coordsText;
      }
    };

    // Zoom manual con la rueda del ratón hacia el planeta: transición suave a navegación libre en esa ubicación
    earthScene.onZoomDiveTrigger = (lat, lon) => {
      map2DManager.triggerFreeExplorationDive(lat, lon);
    };
  }

  // Miniaturas 3D fotorrealistas en tarjetas laterales
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
 * Inicialización del gestor de cartografía satelital 2D y transición
 */
function init2DMapManager() {
  map2DManager = new AnalogMap2DManager('map2dContainer');

  // Callback cuando el usuario pulsa "Regresar a Órbita Espacial" desde el mapa 2D
  map2DManager.setOnReturnToOrbit((lat, lon) => {
    if (lat !== undefined && lon !== undefined) {
      earthScene.orientToCoordinates(lat, lon);
    }
    earthScene.ascendToOrbit(1200);
    // Restablecer selector a Tierra
    document.querySelectorAll('.selector-option').forEach(el => {
      el.classList.remove('active', 'mars-active');
      if (el.getAttribute('data-target') === 'Earth') {
        el.classList.add('active');
      }
    });
    const moonCard = document.getElementById('moonCard');
    const marsCard = document.getElementById('marsCard');
    moonCard?.classList.remove('card-selected');
    marsCard?.classList.remove('card-selected', 'mars-selected');
    hideTargetCard();
  });

  const btnReturnToOrbit = document.getElementById('btnReturnToOrbit');
  if (btnReturnToOrbit) {
    btnReturnToOrbit.addEventListener('click', () => {
      map2DManager.returnToSpaceOrbit();
    });
  }

  const btnCenterTarget = document.getElementById('btnCenterTarget');
  if (btnCenterTarget) {
    btnCenterTarget.addEventListener('click', () => {
      map2DManager.centerOnTarget();
    });
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

  // 2. Clic en las tarjetas laterales completas
  const moonCard = document.getElementById('moonCard');
  if (moonCard) {
    moonCard.addEventListener('click', (e) => {
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

  // 3. Botones "Compare with Earth"
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
      const target: 'Moon' | 'Mars' = activeBody === 'Mars' ? 'Mars' : 'Moon';
      generateAndDiveToAnalog(target);
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

  // 5. Pestañas de subcategoría en las tarjetas
  setupCardSubtabs('moonCard', 'Moon');
  setupCardSubtabs('marsCard', 'Mars');
}

/**
 * Selecciona un cuerpo celeste: Moon, Earth o Mars
 */
export function selectCelestialTarget(body: CelestialBody) {
  activeBody = body;

  document.querySelectorAll('.selector-option').forEach(el => {
    el.classList.remove('active', 'mars-active');
    if (el.getAttribute('data-target') === body) {
      el.classList.add('active');
      if (body === 'Mars') el.classList.add('mars-active');
    }
  });

  const moonCard = document.getElementById('moonCard');
  const marsCard = document.getElementById('marsCard');
  moonCard?.classList.remove('card-selected');
  marsCard?.classList.remove('card-selected', 'mars-selected');

  if (body === 'Moon') {
    moonCard?.classList.add('card-selected');
    miniMoon?.spinFast();
    generateAndDiveToAnalog('Moon');
  } else if (body === 'Mars') {
    marsCard?.classList.add('card-selected', 'mars-selected');
    miniMars?.spinFast();
    generateAndDiveToAnalog('Mars');
  } else {
    // Si pulsa Earth, regresa a la vista de órbita global
    earthScene.resetToGlobalView();
    hideTargetCard();
  }
}

/**
 * Transición cinematográfica fotorrealista y sin cortes:
 * 1. Genera coordenadas científicas del análogo planetario.
 * 2. La Tierra 3D rota suavemente y la cámara desciende en zoom continuo.
 * 3. Al alcanzar baja órbita, transiciona de forma imperceptible hacia el mapa satelital 2D de alta resolución.
 * 4. Sin pantallas de videojuegos, sin textos invasivos ni cortes bruscos.
 */
function generateAndDiveToAnalog(body: 'Moon' | 'Mars') {
  const result = generateRandomAnalogCoordinates(body);
  currentSelectedSite = result.site;

  const lat = result.coordinates.latitude;
  const lon = result.coordinates.longitude;

  // Actualizar tarjeta HUD discreta
  showTargetCard(result.site, body);

  // Animación fotorrealista continua de rotación y zoom hacia la superficie
  earthScene.animateToCoordinatesAndDive(lat, lon, () => {
    // Al alcanzar baja órbita, transiciona de forma imperceptible al mapa satelital 2D
    map2DManager.triggerSeamlessZoomDive(result.site);
  });
}

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
