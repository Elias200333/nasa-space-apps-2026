import './styles.css';
import { EarthSceneManager } from './babylon/earthScene';
import { MiniPlanetViewer } from './babylon/miniPlanets';
import { AnalogMap2DManager } from './map/analogMap2D';
import { generateRandomAnalogCoordinates, PLANET_METRICS, getCandidatesForBody } from './data/analogs';
import { sound } from './audio';
import { CelestialBody, AnalogSite, PlanetaryLayerMode, AnalogCandidateItem } from './types';
import { formatPlanetaryCoordinates, VERIFIED_PLANETARY_POIS } from './nasa/trekProviders';
import { XRDetector } from './xr/xrDetector';

// Estado global de la aplicación
let activeBody: CelestialBody = 'Earth';
let currentLayerMode: PlanetaryLayerMode = 'surface';
let currentSelectedSite: AnalogSite | null = null;
let earthScene: EarthSceneManager;
let miniMoon: MiniPlanetViewer;
let miniMars: MiniPlanetViewer;
let map2DManager: AnalogMap2DManager;
let isVRModeActive = false;

/**
 * Coordinador de carga en tiempo real para el splash screen:
 * - Se mueve continuamente desde 0% ("poco a poco").
 * - Cuanto más se acerca al 75%, más lento avanza (desaceleración asintótica suave).
 * - En cuanto termina de cargar la página (recursos + shaders y motor 3D listos),
 *   recibe un evento que termina de cargar la barra velozmente al 100%.
 * - Finalmente cambia la ventana (fade-out hacia el globo interactivo 3D).
 */
class SplashLoadingCoordinator {
  private splashEl: HTMLElement | null;
  private fillEl: HTMLElement | null;
  private pctEl: HTMLElement | null;
  private statusEl: HTMLElement | null;
  private currentProgress = 0;
  private isAppReady = false;
  private isFinished = false;
  private animId = 0;
  private lastTimestamp = 0;
  private customStatus: string | null = null;

  constructor() {
    this.splashEl = document.getElementById('introSplashScreen');
    this.fillEl = document.getElementById('splashProgressBar');
    this.pctEl = document.getElementById('splashProgressPct');
    this.statusEl = document.getElementById('splashStatusText');

    // Escuchar el evento de carga completada de la aplicación
    window.addEventListener('ief:app-loaded', () => this.notifyAppLoaded(), { once: true });

    if (this.splashEl) {
      this.splashEl.addEventListener('click', () => this.forceFinish());
      window.addEventListener('keydown', (e) => {
        if (!this.isFinished && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) {
          this.forceFinish();
        }
      }, { once: true });
    }

    this.runLoop();
  }

  public startShrinkTransition() {
    if (this.splashEl) {
      this.splashEl.classList.add('shrink-active');
    }
  }

  public setStatus(message: string) {
    this.customStatus = message;
    if (this.statusEl && !this.isFinished) {
      this.statusEl.textContent = message;
    }
  }

  public notifyAppLoaded() {
    if (this.isAppReady) return;
    this.isAppReady = true;
    if (this.statusEl) {
      this.statusEl.textContent = 'Finalizando configuración y telemetría...';
    }
  }

  private runLoop = (timestamp = performance.now()) => {
    if (!this.lastTimestamp) this.lastTimestamp = timestamp;
    const dt = Math.min(50, Math.max(10, timestamp - this.lastTimestamp));
    this.lastTimestamp = timestamp;

    if (!this.isAppReady) {
      // Fase 1: Se mueve poco a poco y cuanto más se acerca al 75%, más lento va
      const remainingTo75 = Math.max(0, 75 - this.currentProgress);
      // Velocidad proporcional a la distancia restante: desaceleración continua hacia el 75%
      const speed = Math.max(0.003, (remainingTo75 / 75) * 0.20 * (dt / 16.67));
      this.currentProgress = Math.min(74.8, this.currentProgress + speed);

      // Textos dinámicos acordes al avance si no hay un mensaje específico
      if (this.statusEl && !this.customStatus) {
        if (this.currentProgress < 20) {
          this.statusEl.textContent = 'Iniciando subsistemas orbitales IEF Comparation...';
        } else if (this.currentProgress < 45) {
          this.statusEl.textContent = 'Cargando modelos y texturas orbitales NASA...';
        } else if (this.currentProgress < 62) {
          this.statusEl.textContent = 'Sincronizando análogos planetarios 3D...';
        } else {
          this.statusEl.textContent = 'Compilando sombreadores atmosféricos...';
        }
      }
    } else {
      // Fase 2: El evento de carga ha saltado ("lo termina de cargar")
      // Avanza con decisión y fluidez hacia el 100%
      const remainingTo100 = Math.max(0.2, 100 - this.currentProgress);
      const speed = Math.max(0.85, remainingTo100 * 0.16 * (dt / 16.67));
      this.currentProgress = Math.min(100, this.currentProgress + speed);

      if (this.currentProgress >= 99.7 && !this.isFinished) {
        this.currentProgress = 100;
        this.isFinished = true;
        this.updateUI(100);
        this.finishAndExit();
        return;
      }
    }

    this.updateUI(this.currentProgress);
    this.animId = requestAnimationFrame(this.runLoop);
  };

  private updateUI(progress: number) {
    if (this.fillEl) {
      this.fillEl.style.width = `${progress.toFixed(1)}%`;
    }
    if (this.pctEl) {
      this.pctEl.textContent = `${Math.round(progress)}%`;
    }
  }

  private finishAndExit() {
    this.updateUI(100);
    if (this.statusEl) {
      this.statusEl.textContent = '100% • Misión iniciada';
    }

    // Pausa visual para ver el 100% antes de cambiar la ventana
    setTimeout(() => {
      if (this.splashEl) {
        this.splashEl.classList.add('fade-out');
        setTimeout(() => {
          this.splashEl?.remove();
          cancelAnimationFrame(this.animId);

          // Si se detectó o solicitó Realidad Virtual, abrir el modal de bienvenida
          if (isVRModeActive) {
            showVRWelcomeModal();
          }
        }, 750);
      }
    }, 380);
  }

  private forceFinish() {
    this.notifyAppLoaded();
    this.currentProgress = 100;
    this.isFinished = true;
    this.updateUI(100);
    this.finishAndExit();
  }
}

function showVRWelcomeModal() {
  const modal = document.getElementById('vrWelcomeModal');
  if (modal) {
    modal.classList.remove('hidden');
  }

  const btnStartVR = document.getElementById('btnStartVR');
  if (btnStartVR) {
    btnStartVR.onclick = () => {
      sound.playClick(900);
      modal?.classList.add('hidden');
      document.body.classList.add('vr-mode');
      earthScene.enterXREnvironment((switchedPlanet) => {
        selectCelestialTarget(switchedPlanet);
      });
    };
  }

  const btnExitVRMode = document.getElementById('btnExitVRMode');
  if (btnExitVRMode) {
    btnExitVRMode.onclick = () => {
      sound.playClick(500);
      modal?.classList.add('hidden');
      isVRModeActive = false;
      document.body.classList.remove('vr-mode');
      earthScene.exitXREnvironment();
    };
  }
}

async function initApp() {
  const coordinator = new SplashLoadingCoordinator();

  // Detección proactiva de Realidad Virtual (Meta Quest, Pico, VisionPro o ?vr=1)
  isVRModeActive = await XRDetector.isVRDeviceOrRequested();
  if (isVRModeActive) {
    document.body.classList.add('vr-mode');
  }

  // Transición suave del círculo mientras avanza el loadbar
  setTimeout(() => {
    coordinator.startShrinkTransition();
  }, 220);

  // 1. Inicializar escena 3D principal y monitorizar texturas reales
  const earthCanvas = document.getElementById('earthCanvas') as HTMLCanvasElement;
  if (earthCanvas) {
    earthScene = new EarthSceneManager(earthCanvas);

    earthScene.onTextureProgress = (texName) => {
      coordinator.setStatus(`Cargando ${texName}...`);
    };

    earthScene.onCoordinatesChange = (lat, lon, planet) => {
      const active = planet || activeBody;
      const coordsText = formatPlanetaryCoordinates(active, lat, lon);
      const readoutElem = document.getElementById('hudCoordsText');
      if (readoutElem) readoutElem.textContent = coordsText;

      const scaleSpan = document.querySelector('.hud-scale span');
      if (scaleSpan) {
        if (active === 'Mars') scaleSpan.textContent = '3,390 km (Radio)';
        else if (active === 'Moon') scaleSpan.textContent = '1,737 km (Radio)';
        else scaleSpan.textContent = '5,000 km';
      }
    };

    earthScene.onZoomDiveTrigger = (lat, lon, planet) => {
      const body = planet || activeBody;
      if (body === 'Earth') {
        map2DManager.triggerFreeExplorationDive(lat, lon, 5, 'Earth', 'surface');
      } else {
        map2DManager.triggerFreeExplorationDive(lat, lon, 5, body, currentLayerMode);
      }
    };

    earthScene.onPOIClicked = (poi) => {
      sound.playClick(850);
      const body = (activeBody === 'Mars' || activeBody === 'Moon') ? activeBody : 'Mars';
      setTimeout(() => {
        map2DManager.triggerFreeExplorationDive(poi.latitude, poi.longitude, 5, body, 'exploration');
        setTimeout(() => {
          map2DManager.flyToPlanetaryPOI(poi);
        }, 550);
      }, 700);
    };
  }

  // 2. Inicializar mini planetas (Luna y Marte)
  const miniMoonCanvas = document.getElementById('miniMoonCanvas') as HTMLCanvasElement;
  if (miniMoonCanvas) {
    miniMoon = new MiniPlanetViewer(miniMoonCanvas, 'Moon');
  }

  const miniMarsCanvas = document.getElementById('miniMarsCanvas') as HTMLCanvasElement;
  if (miniMarsCanvas) {
    miniMars = new MiniPlanetViewer(miniMarsCanvas, 'Mars');
  }

  // 3. Inicializar cartografía 2D y HUD
  init2DMapManager();
  setupUIEventListeners();
  updateLiveTelemetry(0.0000, 0.0000);

  // 4. Promesa de carga completa de página y recursos del navegador
  const windowLoadPromise = new Promise<void>((resolve) => {
    if (document.readyState === 'complete') {
      resolve();
    } else {
      window.addEventListener('load', () => resolve(), { once: true });
      setTimeout(resolve, 3500); // Salvaguarda en caso de timeout
    }
  });

  // 5. Promesa de compilación y renderizado en BabylonJS
  const scenePromises: Promise<void>[] = [];
  if (earthScene) scenePromises.push(earthScene.whenReady());
  if (miniMoon) scenePromises.push(miniMoon.whenReady());
  if (miniMars) scenePromises.push(miniMars.whenReady());

  // Esperar a que la página cargue y el motor 3D dibuje el primer frame
  await Promise.all([windowLoadPromise, Promise.all(scenePromises)]);

  // ¡Disparar el evento que salta al loadbar, termina la carga y cambia la ventana!
  window.dispatchEvent(new CustomEvent('ief:app-loaded'));
  coordinator.notifyAppLoaded();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

/**
 * Inicialización del gestor de cartografía satelital 2D y transición
 */
function init2DMapManager() {
  map2DManager = new AnalogMap2DManager('map2dContainer');

  // Callback cuando el usuario pulsa "Regresar a Órbita Espacial" desde el mapa 2D
  map2DManager.setOnReturnToOrbit((lat, lon) => {
    if (lat !== undefined && lon !== undefined) {
      earthScene.prepareOrbitAscent(lat, lon);
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

  // Listener del callback de regeneración con main.py
  map2DManager.setOnMainPyRegen((targetBody) => {
    generateListFromMainPy(targetBody);
  });
}

/**
 * Configuración de eventos de interacción y botones del panel
 */
function setupUIEventListeners() {
  // Botón superior en barra principal para ejecutar main.py
  const btnTopNavMainPyRegen = document.getElementById('btnTopNavMainPyRegen');
  if (btnTopNavMainPyRegen) {
    btnTopNavMainPyRegen.addEventListener('click', () => {
      const target = (activeBody === 'Mars') ? 'Mars' : 'Moon';
      generateListFromMainPy(target);
    });
  }

  // 1. Selector Superior Central (Moon / Earth / Mars)
  const selectorOptions = document.querySelectorAll('.selector-option');
  selectorOptions.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target') as CelestialBody;
      sound.playClick(600);
      selectCelestialTarget(target);
    });
  });

  // 2. Clic en las tarjetas laterales completas (selecciona el cuerpo celeste en el globo central)
  const moonCard = document.getElementById('moonCard');
  if (moonCard) {
    moonCard.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.card-subtabs, .card-more-btn, .card-action-btn, .mini-planet-viewport')) return;
      sound.playClick(600);
      selectCelestialTarget('Moon');
    });
  }

  const marsCard = document.getElementById('marsCard');
  if (marsCard) {
    marsCard.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.card-subtabs, .card-more-btn, .card-action-btn, .mini-planet-viewport')) return;
      sound.playClick(600);
      selectCelestialTarget('Mars');
    });
  }

  // 3. Botones "Compare with Earth" (generan análogo terrestre e inician descenso guiado)
  const moonActionBtn = document.getElementById('moonActionBtn');
  if (moonActionBtn) {
    moonActionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sound.playClick(600);
      generateAndDiveToAnalog('Moon');
    });
  }

  const marsActionBtn = document.getElementById('marsActionBtn');
  if (marsActionBtn) {
    marsActionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sound.playClick(600);
      generateAndDiveToAnalog('Mars');
    });
  }

  // 4. Selector de capas cartográficas NASA (Superficie / Topografía / Exploración)
  const layerButtons = document.querySelectorAll('.planet-layer-selector .layer-btn');
  layerButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-layer') as PlanetaryLayerMode;
      if (!mode) return;
      currentLayerMode = mode;
      sound.playClick(650);

      const targetPlanet = activeBody === 'Mars' || activeBody === 'Moon' ? activeBody : 'Mars';
      updateLayerModeUI(targetPlanet, mode);
      earthScene.setLayerMode(mode);

      if (map2DManager && map2DManager.isMapActive()) {
        map2DManager.switchPlanetaryLayer(mode);
      }
    });
  });

  // 5. Barra de herramientas flotante sobre la Tierra / planeta activo
  const btnResetEarth = document.getElementById('btnResetEarth');
  if (btnResetEarth) {
    btnResetEarth.addEventListener('click', () => {
      sound.playClick(500);
      if (map2DManager && map2DManager.isMapActive()) {
        map2DManager.returnToSpaceOrbit();
      } else {
        earthScene.resetToGlobalView();
      }
      hideTargetCard();
    });
  }

  const btnRandomTarget = document.getElementById('btnRandomTarget');
  if (btnRandomTarget) {
    btnRandomTarget.addEventListener('click', () => {
      sound.playClick(600);
      if (activeBody === 'Earth') {
        generateAndDiveToAnalog('Mars');
      } else {
        const pois = VERIFIED_PLANETARY_POIS[activeBody];
        const randomPoi = pois[Math.floor(Math.random() * pois.length)];
        earthScene.flyToPOI(randomPoi.latitude, randomPoi.longitude);
        setTimeout(() => {
          map2DManager.triggerFreeExplorationDive(randomPoi.latitude, randomPoi.longitude, 5, activeBody, currentLayerMode);
          setTimeout(() => {
            map2DManager.flyToPlanetaryPOI(randomPoi);
          }, 550);
        }, 700);
      }
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

  // 6. Botón de activación de Realidad Virtual (WebXR)
  const btnToggleXR = document.getElementById('btnToggleXR');
  if (btnToggleXR) {
    btnToggleXR.addEventListener('click', () => {
      sound.playClick(750);
      if (!earthScene.getIsXRActive()) {
        isVRModeActive = true;
        document.body.classList.add('vr-mode');
        showVRWelcomeModal();
      } else {
        isVRModeActive = false;
        document.body.classList.remove('vr-mode');
        earthScene.exitXREnvironment();
      }
    });
  }

  // 7. Pestañas de subcategoría en las tarjetas
  setupCardSubtabs('moonCard', 'Moon');
  setupCardSubtabs('marsCard', 'Mars');
}

/**
 * Selecciona un cuerpo celeste central: Moon, Earth o Mars
 * - Transiciona suavemente el globo esférico central de BabylonJS
 * - Actualiza texturas y materiales científicos de NASA Trek
 * - Gestiona el selector de capas y el dock de métricas
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

  updateBottomDockHighlight(body);

  // Actualizar textos y temas del botón generador de main.py
  const btnTopNavMainPyText = document.getElementById('btnTopNavMainPyText');
  const btnTopNavMainPy = document.getElementById('btnTopNavMainPyRegen');
  const btnMainPyRegenText = document.getElementById('btnMainPyRegenText');
  const btnMainPy = document.getElementById('btnMainPyRegen');
  const targetBodyName = body === 'Mars' ? 'Marte' : 'Luna';
  const regenLabel = `⚡ Generar Lista ${targetBodyName} (main.py)`;

  if (btnTopNavMainPyText) btnTopNavMainPyText.textContent = regenLabel;
  if (btnMainPyRegenText) btnMainPyRegenText.textContent = regenLabel;

  if (btnTopNavMainPy) {
    if (body === 'Mars') btnTopNavMainPy.classList.add('mars-mode');
    else btnTopNavMainPy.classList.remove('mars-mode');
  }
  if (btnMainPy) {
    if (body === 'Mars') btnMainPy.classList.add('mars-mode');
    else btnMainPy.classList.remove('mars-mode');
  }

  if (body === 'Moon') {
    moonCard?.classList.add('card-selected');
    miniMoon?.spinFast();
    showPlanetaryLayerSelector('Moon');
    earthScene.switchPlanet('Moon', currentLayerMode);
    if (map2DManager && map2DManager.isMapActive()) {
      map2DManager.returnToSpaceOrbit();
    }
    hideTargetCard();
  } else if (body === 'Mars') {
    marsCard?.classList.add('card-selected', 'mars-selected');
    miniMars?.spinFast();
    showPlanetaryLayerSelector('Mars');
    earthScene.switchPlanet('Mars', currentLayerMode);
    if (map2DManager && map2DManager.isMapActive()) {
      map2DManager.returnToSpaceOrbit();
    }
    hideTargetCard();
  } else {
    // Earth
    hidePlanetaryLayerSelector();
    earthScene.switchPlanet('Earth');
    if (map2DManager && map2DManager.isMapActive()) {
      map2DManager.returnToSpaceOrbit();
    } else {
      earthScene.resetToGlobalView();
    }
    hideTargetCard();
  }
}

function showPlanetaryLayerSelector(body: 'Mars' | 'Moon') {
  const selector = document.getElementById('planetLayerSelector');
  if (!selector) return;

  selector.classList.remove('hidden', 'mars-theme', 'moon-theme');
  selector.classList.add(body === 'Mars' ? 'mars-theme' : 'moon-theme');

  const titleEl = document.getElementById('layerSelectorPlanetTitle');
  if (titleEl) {
    titleEl.textContent = `${body === 'Mars' ? 'MARTE' : 'LUNA'} • CARTOGRAFÍA NASA`;
  }

  updateLayerModeUI(body, currentLayerMode);
}

function hidePlanetaryLayerSelector() {
  const selector = document.getElementById('planetLayerSelector');
  if (selector) selector.classList.add('hidden');
}

function updateLayerModeUI(body: 'Mars' | 'Moon', mode: PlanetaryLayerMode) {
  const btns = document.querySelectorAll('.planet-layer-selector .layer-btn');
  btns.forEach(b => {
    b.classList.remove('active');
    if (b.getAttribute('data-layer') === mode) {
      b.classList.add('active');
    }
  });

  const provenanceBadge = document.getElementById('layerProvenanceBadge');
  const infoNotice = document.getElementById('layerInfoNotice');

  if (body === 'Mars') {
    if (mode === 'surface') {
      if (provenanceBadge) provenanceBadge.textContent = 'NASA Mars Trek / Viking MDIM2.1 (232 m/px)';
      if (infoNotice) infoNotice.textContent = 'Mosaico orbital global en color real Viking MDIM2.1 (NASA Trek WMTS)';
    } else if (mode === 'topography') {
      if (provenanceBadge) provenanceBadge.textContent = 'NASA Mars Trek / MGS MOLA (463 m/px)';
      if (infoNotice) infoNotice.textContent = 'Altimetría de relieve sombreado en color MOLA • Gradiente hipsométrico (relieve visual, no malla DEM 3D)';
    } else {
      if (provenanceBadge) provenanceBadge.textContent = 'NASA Mars Trek / 5 Accidentes Científicos';
      if (infoNotice) infoNotice.textContent = 'Exploración de Olympus Mons, Valles Marineris, Jezero, Gale y Elysium Mons con coordenadas verificadas';
    }
  } else {
    // Moon
    if (mode === 'surface') {
      if (provenanceBadge) provenanceBadge.textContent = 'NASA Moon Trek / LRO WAC (100 m/px)';
      if (infoNotice) infoNotice.textContent = 'Mosaico global fotográfico Lunar Reconnaissance Orbiter WAC 303ppd (NASA Trek WMTS)';
    } else if (mode === 'topography') {
      if (provenanceBadge) provenanceBadge.textContent = 'NASA Moon Trek / LRO LOLA (128 ppd)';
      if (infoNotice) infoNotice.textContent = 'Cartografía de elevación en color LOLA • Relieve sombreado altimétrico (relieve visual, no malla DEM 3D)';
    } else {
      if (provenanceBadge) provenanceBadge.textContent = 'NASA Moon Trek / 5 Accidentes Científicos';
      if (infoNotice) infoNotice.textContent = 'Exploración de Tycho, Copernicus, Mare Tranquillitatis, Aristarchus y Shackleton con coordenadas verificadas';
    }
  }
}

function updateBottomDockHighlight(body: CelestialBody) {
  const items = document.querySelectorAll('.dock-metrics-grid .val-item');
  items.forEach(item => {
    item.classList.remove('active-planet-metric', 'mars-metric', 'moon-metric');
    const tag = item.querySelector('.tag')?.textContent?.trim();
    if (body === 'Mars' && tag === 'Mars') {
      item.classList.add('active-planet-metric', 'mars-metric');
    } else if (body === 'Moon' && tag === 'Moon') {
      item.classList.add('active-planet-metric', 'moon-metric');
    }
  });
}

function siteCountryLookup(siteId: string): string {
  if (siteId.startsWith('ES_')) return 'España';
  if (siteId.startsWith('US_')) return 'EE.UU.';
  if (siteId.startsWith('IS_')) return 'Islandia';
  if (siteId.startsWith('CL_')) return 'Chile';
  return 'Tierra';
}

function showTargetCardLoading(body: 'Moon' | 'Mars') {
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
      <h4>Consultando Backend main.py...</h4>
      <p style="color:var(--cyan-glow);">NASA APIs • CMR, POWER, ODE & Trek</p>
    </div>
  `;
  card.style.display = 'flex';
}

/**
 * Ejecuta el cálculo científico del ranking de 10 candidatos con main.py:
 * - Si body es 'Moon', envía la petición de la Luna.
 * - Si body es 'Mars', actualiza el ranking de Marte.
 * - Sincroniza la lista en el panel lateral derecho desplegable y selecciona el candidato #1.
 */
async function generateListFromMainPy(body: 'Moon' | 'Mars') {
  const hudBtn = document.getElementById('btnMainPyRegen');
  const hudBtnText = document.getElementById('btnMainPyRegenText');
  const topNavBtn = document.getElementById('btnTopNavMainPyRegen');
  const topNavBtnText = document.getElementById('btnTopNavMainPyText');
  const drawerRegenBtn = document.getElementById('btnDrawerRegen');

  hudBtn?.classList.add('loading');
  topNavBtn?.classList.add('loading');
  drawerRegenBtn?.classList.add('loading');

  const loadingLabel = `Ejecutando main.py (${body})...`;
  if (hudBtnText) hudBtnText.textContent = loadingLabel;
  if (topNavBtnText) topNavBtnText.textContent = loadingLabel;

  try {
    sound.playClick(800);
    const resp = await fetch(`/api/candidates/generate?body=${body.toLowerCase()}&regenerate=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: body.toLowerCase(), regenerate: true })
    });

    let candidates: AnalogCandidateItem[] = [];
    if (resp.ok) {
      const data = await resp.json();
      candidates = data.candidates || [];
    }

    if (!candidates || candidates.length === 0) {
      const local = getCandidatesForBody(body);
      candidates = local.map((s, idx) => ({
        rank: s.rank || (idx + 1),
        id: s.id,
        name: s.name,
        target_body: s.target_body,
        pairing: s.pairing || s.region,
        country: s.country,
        lat: s.coordinates.latitude,
        lon: s.coordinates.longitude,
        score_pct: s.similarity_score,
        strong_analogies: s.geological_features
      }));
    }

    // Si aún estamos en la vista orbital o el mapa 2D no está activo, buceamos hacia el candidato #1
    if (!map2DManager || !map2DManager.isMapActive()) {
      await generateAndDiveToAnalog(body, candidates[0]?.id);
    } else {
      map2DManager.setCandidates(candidates, body);
      if (candidates.length > 0) {
        map2DManager.switchToCandidate(candidates[0]);
      }
      map2DManager.toggleCandidatesDrawer(true);
    }

    sound.playSuccess();
  } catch (err) {
    console.error('Error al generar candidatos con main.py:', err);
    sound.playError();
  } finally {
    hudBtn?.classList.remove('loading');
    topNavBtn?.classList.remove('loading');
    drawerRegenBtn?.classList.remove('loading');
    const finalLabel = body === 'Mars' ? '⚡ Generar Lista Marte (main.py)' : '⚡ Generar Lista Luna (main.py)';
    if (hudBtnText) hudBtnText.textContent = finalLabel;
    if (topNavBtnText) topNavBtnText.textContent = finalLabel;
  }
}

/**
 * Transición cinematográfica fotorrealista y sin cortes:
 * 1. Obtiene las coordenadas científicas del análogo planetario directamente del backend main.py
 *    y del catálogo global de 10 candidatos (global_analog_catalog_20.json).
 * 2. La Tierra 3D rota suavemente y la cámara desciende en zoom continuo.
 * 3. Al alcanzar baja órbita, transiciona de forma imperceptible hacia el mapa satelital 2D de alta resolución.
 * 4. Activa la previsualización 3D del radio alrededor de la ubicación generada por generate_terrain_3D.py.
 */
async function generateAndDiveToAnalog(body: 'Moon' | 'Mars', specificSiteId?: string) {
  showTargetCardLoading(body);

  try {
    // 1. Llamada a la API backend impulsada por main.py / analyze_analog.py y global_analog_catalog_20.json
    const queryUrl = specificSiteId
      ? `/api/analog?body=${body.toLowerCase()}&site=${encodeURIComponent(specificSiteId)}`
      : `/api/analog?body=${body.toLowerCase()}`;
    const resp = await fetch(queryUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    const candidates: AnalogCandidateItem[] = data.candidates || [];

    const site: AnalogSite = {
      id: data.site.id,
      name: data.site.name,
      target_body: body,
      coordinates: {
        latitude: data.site.coordinates.latitude,
        longitude: data.site.coordinates.longitude,
        label: `${Math.abs(data.site.coordinates.latitude).toFixed(4)}° ${data.site.coordinates.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(data.site.coordinates.longitude).toFixed(4)}° ${data.site.coordinates.longitude >= 0 ? 'E' : 'W'}`
      },
      region: data.site.pairing || data.primary_region || 'Región Análoga',
      country: data.site.country || siteCountryLookup(data.site.id),
      geological_features: data.site.strong_analogies || ['Lava Tube Skylights', 'Basalt Flows', 'Subsurface Cavity'],
      scientific_justification: data.site.scientific_justification,
      similarity_score: data.site.similarity_score,
      coverage_percentage: 100,
      sources: data.site.sources || ['NASA CMR', 'NASA POWER', 'IGN PNOA-LiDAR'],
      status: (data.site.status as any) || 'validated',
      rank: data.site.rank || 1,
      candidates
    };

    currentSelectedSite = site;
    showTargetCard(site, body, candidates);

    const lat = site.coordinates.latitude;
    const lon = site.coordinates.longitude;

    // 2. Animación cinematográfica de rotación y zoom hacia la superficie
    earthScene.animateToCoordinatesAndDive(lat, lon, () => {
      // Al alcanzar baja órbita, transiciona al mapa satelital 2D y activa el entorno 3D con los 10 candidatos sincronizados
      map2DManager.triggerSeamlessZoomDive(site, 5, candidates);
    });
  } catch (err) {
    console.warn('Backend /api/analog no disponible, usando fallback local de 10 candidatos:', err);
    const localCandidates = getCandidatesForBody(body);
    const baseCandidate = specificSiteId
      ? (localCandidates.find(s => s.id === specificSiteId) || localCandidates[0])
      : localCandidates[0];

    const localCandidatesMapped: AnalogCandidateItem[] = localCandidates.map((s, idx) => ({
      rank: s.rank || (idx + 1),
      id: s.id,
      name: s.name,
      target_body: s.target_body,
      pairing: s.pairing || s.region,
      country: s.country,
      lat: s.coordinates.latitude,
      lon: s.coordinates.longitude,
      score_pct: s.similarity_score
    }));

    baseCandidate.candidates = localCandidatesMapped;
    currentSelectedSite = baseCandidate;
    showTargetCard(baseCandidate, body, localCandidatesMapped);
    earthScene.animateToCoordinatesAndDive(baseCandidate.coordinates.latitude, baseCandidate.coordinates.longitude, () => {
      map2DManager.triggerSeamlessZoomDive(baseCandidate, 5, localCandidatesMapped);
    });
  }
}

function showTargetCard(site: AnalogSite, body: 'Moon' | 'Mars', candidates?: AnalogCandidateItem[]) {
  let card = document.getElementById('targetSiteCard');
  if (!card) {
    card = document.createElement('div');
    card.id = 'targetSiteCard';
    card.className = 'target-site-card';
    document.querySelector('.main-stage')?.appendChild(card);
  }

  const badgeClass = body === 'Moon' ? 'moon-badge' : 'mars-badge';
  const rankNum = site.rank || 1;
  const cands = (candidates && candidates.length > 0) ? candidates : (site.candidates || []);

  let candidatesStripHtml = '';
  if (cands && cands.length > 0) {
    const pillsHtml = cands.map(c => {
      const isAct = c.id === site.id ? 'active' : '';
      const shortName = c.name.split('(')[0].trim();
      return `<button class="card-candidate-btn ${isAct}" data-site-id="${c.id}" title="${c.name} (${c.score_pct}%)">
        <span>#${c.rank} ${shortName}</span>
        <span class="cand-score">${c.score_pct}%</span>
      </button>`;
    }).join('');

    candidatesStripHtml = `
      <div class="target-candidates-strip">
        ${pillsHtml}
      </div>
    `;
  }

  card.innerHTML = `
    <div style="display:flex; align-items:center; gap:16px; width:100%;">
      <div class="site-badge ${badgeClass}">${body} Analog #${rankNum}</div>
      <div class="site-info-text" style="flex:1;">
        <h4>${site.name}</h4>
        <p>📍 ${site.region}, ${site.country} — <span style="color:var(--cyan-glow);">${site.coordinates.label}</span></p>
        <p style="font-size:0.72rem; color:var(--text-dim); margin-top:2px;">🔬 ${site.scientific_justification}</p>
      </div>
      <div class="site-score-pill">
        <span class="score-num">${site.similarity_score}%</span>
        <span class="score-lbl">Similitud</span>
      </div>
    </div>
    ${candidatesStripHtml}
  `;
  card.style.display = 'flex';
  card.style.flexDirection = 'column';

  // Configurar listeners de clic para alternar instantáneamente entre los 10 candidatos
  const candBtns = card.querySelectorAll('.card-candidate-btn');
  candBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const siteId = btn.getAttribute('data-site-id');
      if (siteId && siteId !== site.id) {
        sound.playClick(650);
        generateAndDiveToAnalog(body, siteId);
      }
    });
  });
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
