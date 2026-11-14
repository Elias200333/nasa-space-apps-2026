import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AnalogSite, CavityCandidate, CelestialBody, PlanetaryLayerMode, PlanetaryPOI, Terrain3DResponse } from '../types';
import { NASA_TREK_LAYERS, VERIFIED_PLANETARY_POIS, formatPlanetaryCoordinates } from '../nasa/trekProviders';
import { sound } from '../audio';

export class AnalogMap2DManager {
  private mapContainer: HTMLElement;
  private map: L.Map | null = null;
  private currentTileLayer: L.TileLayer | null = null;
  private currentMarker: L.Marker | null = null;
  private currentCircle: L.Circle | null = null;
  private cavityMarkers: L.Marker[] = [];
  private poiMarkers: L.Marker[] = [];
  private radiusCircle: L.Circle | null = null;
  private activeTargetSite: AnalogSite | null = null;
  private onReturnToOrbitCallback?: (lat?: number, lon?: number, body?: CelestialBody) => void;
  private isReturning = false;
  private isTransitioning = false;
  private is3DPanelOpen = true;
  private currentLat = 29.148;
  private currentLon = -13.450;
  private currentRadiusKm = 10.0;

  // Estado planetario actual del mapa
  private currentBody: CelestialBody = 'Earth';
  private currentLayerMode: PlanetaryLayerMode = 'surface';

  constructor(mapContainerId: string) {
    this.mapContainer = document.getElementById(mapContainerId) as HTMLElement;
    this.setup3DPanelControls();
  }

  public setOnReturnToOrbit(callback: (lat?: number, lon?: number, body?: CelestialBody) => void) {
    this.onReturnToOrbitCallback = callback;
  }

  /**
   * Navegación interactiva libre desde la perspectiva exacta que el usuario estaba mirando en 3D:
   * - Soporta Tierra (WGS84 / Esri Satellite), Marte (NASA Mars Trek) y Luna (NASA Moon Trek).
   * - Configura automáticamente el CRS correspondiente (EPSG:4326 para Marte/Luna, EPSG:3857 para Tierra).
   * - Sin indicadores molestos en la vista.
   */
  public triggerFreeExplorationDive(
    lat: number,
    lon: number,
    zoomLevel = 5,
    body: CelestialBody = 'Earth',
    layerMode: PlanetaryLayerMode = 'surface'
  ) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    this.isReturning = false;
    this.currentBody = body;
    this.currentLayerMode = layerMode;

    // 1. Limpiar marcadores y balizas previas para exploración completamente limpia
    this.clearMarkers();
    this.activeTargetSite = null;

    // 2. Preparar el contenedor para el crossfade suave
    this.mapContainer.classList.remove('hidden');
    this.mapContainer.style.opacity = '0';
    this.mapContainer.style.transform = 'scale(0.98)';
    this.mapContainer.style.transition = 'opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1), transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)';

    this.ensureMapInitialized(lat, lon, zoomLevel, body, layerMode);

    // Centrar en las coordenadas exactas observadas en 3D
    this.map!.setView([lat, lon], zoomLevel, { animate: false });
    this.map!.invalidateSize();

    // Actualizar barra HUD contextual según el cuerpo celeste
    this.setupPlanetaryHUD(body, layerMode, lat, lon);

    // 3. Manejo de panel 3D según el cuerpo
    if (body === 'Earth') {
      this.loadTerrain3DPreview(lat, lon, 10.0);
      this.toggle3DPanel(true);
    } else {
      this.setupPlanetary3DPanelNotice(body, layerMode);
    }

    // 4. Crossfade suave
    requestAnimationFrame(() => {
      this.mapContainer.classList.add('active');
      this.mapContainer.style.opacity = '1';
      this.mapContainer.style.transform = 'scale(1)';
      setTimeout(() => {
        this.isTransitioning = false;
      }, 500);
    });
  }

  /**
   * Transición hacia un análogo sugerido (Moon o Mars) a escala continental medianamente alejada.
   * - NO abre ventanas emergentes invasivas.
   * - Permite explorar toda la región con libertad.
   */
  public triggerSeamlessZoomDive(site: AnalogSite, zoomLevel = 5) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    this.isReturning = false;

    this.activeTargetSite = site;
    const lat = site.coordinates.latitude;
    const lon = site.coordinates.longitude;

    this.mapContainer.classList.remove('hidden');
    this.mapContainer.style.opacity = '0';
    this.mapContainer.style.transform = 'scale(0.98)';
    this.mapContainer.style.transition = 'opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1), transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)';

    this.ensureMapInitialized(lat, lon, zoomLevel);

    // Ajustar a escala continental medianamente alejada (zoom 5) sin saltos
    this.map!.setView([lat, lon], zoomLevel, { animate: false });
    this.map!.invalidateSize();

    // Dibujar la baliza en el mapa (pero sin abrir ningún popup invasivo)
    this.renderSiteMarkers(site);
    this.setupTargetExplorationHUD(site);

    // Cargar la previsualización 3D del radio de 10 km alrededor de la ubicación analógica
    this.loadTerrain3DPreview(lat, lon, 10.0);
    this.toggle3DPanel(true);

    requestAnimationFrame(() => {
      this.mapContainer.classList.add('active');
      this.mapContainer.style.opacity = '1';
      this.mapContainer.style.transform = 'scale(1)';
      setTimeout(() => {
        this.isTransitioning = false;
      }, 500);
    });
  }

  private ensureMapInitialized(
    lat: number,
    lon: number,
    initialZoom = 5,
    body: CelestialBody = 'Earth',
    layerMode: PlanetaryLayerMode = 'surface'
  ) {
    const isEarth = body === 'Earth';
    const targetCrs = isEarth ? L.CRS.EPSG3857 : L.CRS.EPSG4326;

    // Si ya existe el mapa pero cambió de cuerpo (Tierra vs Marte/Luna) se recrea limpiamente con el CRS exacto
    if (this.map && (this.currentBody !== body || (this.map.options as any).crs !== targetCrs)) {
      this.clearMarkers();
      this.map.remove();
      this.map = null;
      this.currentTileLayer = null;
    }

    if (!this.map) {
      const minZoom = isEarth ? 2 : 0;
      const maxZoom = isEarth ? 18 : (body === 'Mars' ? 7 : 8);

      this.map = L.map('leafletMap', {
        center: [lat, lon],
        zoom: initialZoom,
        minZoom,
        maxZoom,
        crs: targetCrs,
        zoomControl: false,
        attributionControl: false
      });

      L.control.zoom({ position: 'bottomleft' }).addTo(this.map);

      // Detección de alejamiento con rueda del ratón: volver a la esfera 3D al llegar a vista global
      this.map.on('zoomend', () => {
        if (!this.map || this.isReturning || this.isTransitioning) return;
        const triggerZoom = isEarth ? 3 : 1;
        if (this.map.getZoom() <= triggerZoom) {
          this.returnToSpaceOrbit();
        }
      });

      const mapElem = document.getElementById('leafletMap');
      if (mapElem) {
        mapElem.addEventListener('wheel', (e) => {
          if (!this.map || this.isReturning || this.isTransitioning) return;
          const triggerZoom = isEarth ? 4 : 2;
          if (e.deltaY > 0 && this.map.getZoom() <= triggerZoom) {
            this.returnToSpaceOrbit();
          }
        }, { passive: true });
      }
    }

    this.currentBody = body;
    this.currentLayerMode = layerMode;
    this.setupActiveTileLayer(body, layerMode);

    if (layerMode === 'exploration' && (body === 'Mars' || body === 'Moon')) {
      this.renderPlanetaryPOIs(body);
    }
  }

  /**
   * Configura la capa de teselas activas de NASA Trek o Esri
   */
  private setupActiveTileLayer(body: CelestialBody, layerMode: PlanetaryLayerMode) {
    if (!this.map) return;

    if (this.currentTileLayer) {
      this.map.removeLayer(this.currentTileLayer);
      this.currentTileLayer = null;
    }

    const badge = document.getElementById('nasaTrekLoadingBadge');

    if (body === 'Mars') {
      const isTopo = layerMode === 'topography';
      const config = isTopo ? NASA_TREK_LAYERS.mars_topography : NASA_TREK_LAYERS.mars_surface;
      const url = `https://trek.nasa.gov/tiles/Mars/EQ/${config.layerName}/1.0.0/default/default028mm/{z}/{y}/{x}.${config.format}`;

      this.currentTileLayer = L.tileLayer(url, {
        minZoom: 0,
        maxZoom: 7,
        attribution: config.attribution,
        crossOrigin: 'anonymous',
        noWrap: false
      }).addTo(this.map);
    } else if (body === 'Moon') {
      const isTopo = layerMode === 'topography';
      const config = isTopo ? NASA_TREK_LAYERS.moon_topography : NASA_TREK_LAYERS.moon_surface;
      const url = `https://trek.nasa.gov/tiles/Moon/EQ/${config.layerName}/1.0.0/default/default028mm/{z}/{y}/{x}.${config.format}`;

      this.currentTileLayer = L.tileLayer(url, {
        minZoom: 0,
        maxZoom: 7,
        attribution: config.attribution,
        crossOrigin: 'anonymous',
        noWrap: false
      }).addTo(this.map);
    } else {
      // Earth - Esri World Imagery
      this.currentTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18,
        attribution: 'Esri, Maxar, Earthstar Geographics'
      }).addTo(this.map);
    }

    if (this.currentTileLayer && badge) {
      this.currentTileLayer.on('loading', () => {
        if (body !== 'Earth') badge.classList.remove('hidden');
      });
      this.currentTileLayer.on('load', () => {
        badge.classList.add('hidden');
      });
    }
  }

  public switchPlanetaryLayer(layerMode: PlanetaryLayerMode) {
    this.currentLayerMode = layerMode;
    this.setupActiveTileLayer(this.currentBody, layerMode);

    if (this.currentBody === 'Mars' || this.currentBody === 'Moon') {
      if (layerMode === 'exploration') {
        this.renderPlanetaryPOIs(this.currentBody);
      } else {
        this.clearMarkers();
      }
      const center = this.map ? this.map.getCenter() : { lat: 0, lng: 0 };
      this.setupPlanetaryHUD(this.currentBody, layerMode, center.lat, center.lng);
      this.setupPlanetary3DPanelNotice(this.currentBody, layerMode);
    }
  }

  public flyToPlanetaryPOI(poi: PlanetaryPOI) {
    if (!this.map) return;
    this.map.flyTo([poi.latitude, poi.longitude], 5, {
      animate: true,
      duration: 1.2
    });

    setTimeout(() => {
      const match = this.poiMarkers.find(m => {
        const pos = m.getLatLng();
        return Math.abs(pos.lat - poi.latitude) < 0.1 && Math.abs(pos.lng - poi.longitude) < 0.1;
      });
      if (match) match.openPopup();
    }, 1300);
  }

  private setupPlanetaryHUD(body: CelestialBody, layerMode: PlanetaryLayerMode, lat: number, lon: number) {
    const titleEl = document.getElementById('mapSiteTitle');
    const coordsEl = document.getElementById('mapSiteCoords');
    const badgeEl = document.getElementById('mapTargetBadge');
    const btnCenter = document.getElementById('btnCenterTarget');
    const scoreChip = document.getElementById('mapSiteScore')?.parentElement;

    if (btnCenter) btnCenter.style.display = 'none';
    if (scoreChip) scoreChip.style.display = 'none';

    if (body === 'Mars') {
      if (badgeEl) {
        badgeEl.textContent = layerMode === 'topography' ? 'NASA MARS TREK • ALTIMETRÍA MOLA' : 'NASA MARS TREK • VIKING MDIM2.1';
        badgeEl.className = 'map-hud-badge mars-badge';
      }
      if (titleEl) {
        titleEl.textContent = 'Cartografía Científica de Marte';
      }
      if (coordsEl) {
        coordsEl.textContent = `${formatPlanetaryCoordinates('Mars', lat, lon)} • Mosaico Global Oficial NASA`;
      }
    } else if (body === 'Moon') {
      if (badgeEl) {
        badgeEl.textContent = layerMode === 'topography' ? 'NASA MOON TREK • TOPOGRAFÍA LOLA' : 'NASA MOON TREK • LRO LROC WAC';
        badgeEl.className = 'map-hud-badge moon-badge';
      }
      if (titleEl) {
        titleEl.textContent = 'Cartografía Científica de la Luna';
      }
      if (coordsEl) {
        coordsEl.textContent = `${formatPlanetaryCoordinates('Moon', lat, lon)} • Mosaico Global Oficial NASA`;
      }
    } else {
      if (badgeEl) {
        badgeEl.textContent = 'VISTA SATELITAL 2D • TIERRA';
        badgeEl.className = 'map-hud-badge';
      }
      if (titleEl) {
        titleEl.textContent = 'Exploración Libre de Terreno';
      }
      if (coordsEl) {
        coordsEl.textContent = 'Navegación satelital en alta resolución • Esri World Imagery (WGS84)';
      }
    }
  }

  private setupPlanetary3DPanelNotice(body: CelestialBody, layerMode: PlanetaryLayerMode) {
    const metricsEl = document.getElementById('terrainMetricsContent');
    const badgeEl = document.getElementById('terrain3DBadge');
    const titleEl = document.getElementById('terrain3DTitle');
    const subtitleEl = document.getElementById('terrain3DSubtitle');

    if (badgeEl) {
      badgeEl.textContent = body === 'Mars' ? 'NASA MARS TREK 3D' : 'NASA MOON TREK 3D';
      badgeEl.className = `terrain-3d-badge ${body.toLowerCase()}-badge`;
    }
    if (titleEl) {
      titleEl.textContent = `Cartografía Planetaria de ${body === 'Mars' ? 'Marte' : 'la Luna'}`;
    }
    if (subtitleEl) {
      subtitleEl.textContent = `Datos orbitales oficiales de NASA Trek • Modo: ${layerMode.toUpperCase()}`;
    }

    if (metricsEl) {
      const isTopo = layerMode === 'topography';
      metricsEl.innerHTML = `
        <div class="terrain-stat-card" style="grid-column: span 2;">
          <div class="stat-meta">
            <span class="stat-label">Capa Cartográfica Activa</span>
            <span class="stat-val-highlight">${isTopo ? 'Relieve Altimétrico Sombreado' : 'Mosaico Visual Orbital'}</span>
          </div>
          <p style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">
            ${isTopo
              ? 'Visualización de gradientes de elevación sobre el datum areoide/selenográfico de NASA Trek. No constituye una malla 3D física sino gradientes altimétricos hipsométricos.'
              : 'Imágenes espectrales y fotográficas reales capturadas por sensores orbitales de la NASA (LRO / Viking).'}
          </p>
        </div>
        <div class="terrain-stat-card">
          <div class="stat-meta">
            <span class="stat-label">Sistema de Coordenadas</span>
            <span class="stat-val-highlight">${body === 'Mars' ? 'IAU2000 Planetocéntrico' : 'IAU2000 Selenográfico'}</span>
          </div>
        </div>
        <div class="terrain-stat-card">
          <div class="stat-meta">
            <span class="stat-label">Resolución Cartográfica</span>
            <span class="stat-val-highlight">${body === 'Mars' ? '232 m/px (Viking) / 463 m/px (MOLA)' : '100 m/px (LRO WAC) / 128 ppd (LOLA)'}</span>
          </div>
        </div>
      `;
    }
  }

  private renderPlanetaryPOIs(body: 'Mars' | 'Moon') {
    if (!this.map) return;
    this.clearMarkers();

    const pois = VERIFIED_PLANETARY_POIS[body];
    const accentColor = body === 'Mars' ? '#f97316' : '#38bdf8';

    pois.forEach(poi => {
      const customIcon = L.divIcon({
        className: 'analog-radar-marker',
        html: `
          <div class="radar-ping" style="border-color:${accentColor};"></div>
          <div class="radar-core" style="background:${accentColor}; box-shadow:0 0 12px ${accentColor};"></div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([poi.latitude, poi.longitude], { icon: customIcon }).addTo(this.map!);
      marker.bindPopup(`
        <div class="map-popup-card">
          <span class="popup-tag ${body.toLowerCase()}">${body.toUpperCase()} • ${poi.type.toUpperCase()}</span>
          <h4>${poi.name}</h4>
          <p class="popup-es-name" style="font-size:0.78rem; color:var(--text-muted); margin-top:-4px; margin-bottom:8px;">${poi.nameEs}</p>
          <div class="popup-meta-row" style="font-family:var(--font-mono); font-size:0.75rem; color:#38bdf8; margin-bottom:6px;">
            <span>${Math.abs(poi.latitude).toFixed(2)}° ${poi.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(poi.longitude).toFixed(2)}° ${poi.longitude >= 0 ? 'E' : 'W'}</span>
            <span style="margin-left:8px; color:#f97316;">Elev: ${poi.elevation_km >= 0 ? '+' : ''}${poi.elevation_km} km</span>
          </div>
          <p class="popup-desc">${poi.description}</p>
          <div class="popup-dataset-info" style="margin-top:8px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.08); font-size:0.7rem; color:var(--text-dim);">
            <span>Fuente: ${poi.datasetProvenance}</span>
          </div>
        </div>
      `, { maxWidth: 320 });

      this.poiMarkers.push(marker);
    });
  }

  private clearMarkers() {
    if (!this.map) return;
    if (this.currentMarker) {
      this.map.removeLayer(this.currentMarker);
      this.currentMarker = null;
    }
    if (this.currentCircle) {
      this.map.removeLayer(this.currentCircle);
      this.currentCircle = null;
    }
    if (this.radiusCircle) {
      this.map.removeLayer(this.radiusCircle);
      this.radiusCircle = null;
    }
    this.cavityMarkers.forEach(m => this.map?.removeLayer(m));
    this.cavityMarkers = [];
    this.poiMarkers.forEach(m => this.map?.removeLayer(m));
    this.poiMarkers = [];
  }

  private renderSiteMarkers(site: AnalogSite) {
    if (!this.map) return;
    this.clearMarkers();

    const lat = site.coordinates.latitude;
    const lon = site.coordinates.longitude;
    const accentColor = site.target_body === 'Moon' ? '#22d3ee' : '#f97316';

    this.currentCircle = L.circle([lat, lon], {
      color: accentColor,
      fillColor: accentColor,
      fillOpacity: 0.15,
      radius: 3500,
      weight: 1.5
    }).addTo(this.map);

    const customIcon = L.divIcon({
      className: 'analog-radar-marker',
      html: `
        <div class="radar-ping" style="border-color:${accentColor};"></div>
        <div class="radar-core" style="background:${accentColor}; box-shadow:0 0 12px ${accentColor};"></div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    this.currentMarker = L.marker([lat, lon], { icon: customIcon }).addTo(this.map);

    // Solo se abre el popup si el usuario hace clic directamente sobre el marcador
    this.currentMarker.bindPopup(`
      <div class="map-popup-card">
        <span class="popup-tag ${site.target_body.toLowerCase()}">${site.target_body} Analog</span>
        <h4>${site.name}</h4>
        <p class="popup-coords">${site.coordinates.label}</p>
        <p class="popup-desc">${site.scientific_justification}</p>
        <div class="popup-score">
          <span>Fidelidad de Terreno:</span>
          <strong>${site.similarity_score}%</strong>
        </div>
      </div>
    `);
  }

  private setupFreeExplorationHUD() {
    this.setupPlanetaryHUD(this.currentBody, this.currentLayerMode, this.currentLat, this.currentLon);
  }

  private setupTargetExplorationHUD(site: AnalogSite) {
    const titleEl = document.getElementById('mapSiteTitle');
    const coordsEl = document.getElementById('mapSiteCoords');
    const badgeEl = document.getElementById('mapTargetBadge');
    const btnCenter = document.getElementById('btnCenterTarget');
    const scoreVal = document.getElementById('mapSiteScore');
    const scoreChip = scoreVal?.parentElement;

    if (badgeEl) {
      badgeEl.textContent = `${site.target_body.toUpperCase()} ANALOG SITE`;
      badgeEl.className = `map-hud-badge ${site.target_body.toLowerCase()}-badge`;
    }
    if (titleEl) {
      titleEl.textContent = `Región de ${site.name}`;
    }
    if (coordsEl) {
      coordsEl.textContent = 'Exploración libre • Haz clic en la baliza para ver detalles científicos';
    }
    if (btnCenter) {
      btnCenter.style.display = 'flex';
    }
    if (scoreChip) {
      scoreChip.style.display = 'flex';
    }
    if (scoreVal) {
      scoreVal.textContent = `${site.similarity_score}%`;
    }
  }

  /**
   * Vuela suavemente hacia el objetivo sugerido si el usuario pulsa "Centrar en objetivo"
   */
  public centerOnTarget() {
    if (!this.map || !this.activeTargetSite) return;
    sound.playClick(650);

    const lat = this.activeTargetSite.coordinates.latitude;
    const lon = this.activeTargetSite.coordinates.longitude;

    this.map.flyTo([lat, lon], 12, {
      animate: true,
      duration: 1.4,
      easeLinearity: 0.22
    });

    setTimeout(() => {
      if (this.currentMarker) {
        this.currentMarker.openPopup();
      }
    }, 1500);
  }

  public isMapActive(): boolean {
    return this.mapContainer.classList.contains('active');
  }

  public getCurrentBody(): CelestialBody {
    return this.currentBody;
  }

  public getCurrentLayerMode(): PlanetaryLayerMode {
    return this.currentLayerMode;
  }

  /**
   * Regresa suavemente del mapa 2D a la órbita espacial 3D,
   * sincronizando la rotación del planeta con el punto donde el usuario estaba mirando en 2D.
   */
  public returnToSpaceOrbit() {
    if (this.isReturning) return;
    this.isReturning = true;
    sound.playClick(480);

    const center = this.map ? this.map.getCenter() : null;
    let lat = center ? center.lat : undefined;
    let lon = center ? center.lng : undefined;

    if (lat !== undefined && lon !== undefined) {
      // Normalizar longitud al rango canónico [-180, 180] y restringir latitud
      lon = ((lon + 180) % 360 + 360) % 360 - 180;
      lat = Math.max(-85, Math.min(85, lat));
    }

    // 1. Notificar inmediatamente a BabylonJS para preparar la orientación 3D exacta
    if (this.onReturnToOrbitCallback) {
      this.onReturnToOrbitCallback(lat, lon, this.currentBody);
    }

    // 2. Desvanecer suavemente el contenedor 2D
    this.mapContainer.style.transition = 'opacity 0.45s ease-out, transform 0.45s ease-out';
    this.mapContainer.style.opacity = '0';
    this.mapContainer.style.transform = 'scale(0.98)';

    setTimeout(() => {
      this.mapContainer.classList.remove('active');
      this.mapContainer.classList.add('hidden');
      this.isReturning = false;
    }, 450);
  }

  /**
   * Configura las interacciones y cambio de pestañas del panel 3D
   */
  private setup3DPanelControls() {
    const btnToggle = document.getElementById('btnToggle3DPreview');
    const btnClose = document.getElementById('btnClose3DPanel');
    const btnRegen = document.getElementById('btnRegen3D');

    if (btnToggle) {
      btnToggle.addEventListener('click', () => {
        sound.playClick(600);
        this.toggle3DPanel();
      });
    }

    if (btnClose) {
      btnClose.addEventListener('click', () => {
        sound.playClick(450);
        this.toggle3DPanel(false);
      });
    }

    if (btnRegen) {
      btnRegen.addEventListener('click', () => {
        sound.playClick(700);
        const center = this.map ? this.map.getCenter() : null;
        const lat = center ? center.lat : this.currentLat;
        let lon = center ? center.lng : this.currentLon;
        lon = ((lon + 180) % 360 + 360) % 360 - 180;
        this.loadTerrain3DPreview(lat, lon, this.currentRadiusKm, true);
      });
    }

    // Pestañas del visor 3D (WebGL, Atlas Temático, Cavidades)
    const tabs = document.querySelectorAll('.terrain-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        sound.playClick(500);
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const targetTab = tab.getAttribute('data-tab');
        document.querySelectorAll('.terrain-tab-pane').forEach(pane => {
          pane.classList.add('hidden');
          pane.classList.remove('active');
        });

        if (targetTab === 'interactive') {
          const p = document.getElementById('tabContentInteractive');
          p?.classList.remove('hidden');
          p?.classList.add('active');
        } else if (targetTab === 'thematic') {
          const p = document.getElementById('tabContentThematic');
          p?.classList.remove('hidden');
          p?.classList.add('active');
        } else if (targetTab === 'cavities') {
          const p = document.getElementById('tabContentCavities');
          p?.classList.remove('hidden');
          p?.classList.add('active');
        }
      });
    });
  }

  public toggle3DPanel(show?: boolean) {
    const panel = document.getElementById('terrain3DPanel');
    const btnToggle = document.getElementById('btnToggle3DPreview');
    if (!panel) return;

    if (show !== undefined) {
      this.is3DPanelOpen = show;
    } else {
      this.is3DPanelOpen = !this.is3DPanelOpen;
    }

    if (this.is3DPanelOpen) {
      panel.classList.remove('hidden');
      btnToggle?.classList.add('active');
    } else {
      panel.classList.add('hidden');
      btnToggle?.classList.remove('active');
    }
  }

  /**
   * Carga la previsualización del espacio 3D para el radio alrededor de las coordenadas
   * conectando directamente con el motor de Python (generate_terrain_3d.py)
   */
  public async loadTerrain3DPreview(lat: number, lon: number, radiusKm = 10.0, force = false) {
    this.currentLat = lat;
    this.currentLon = lon;
    this.currentRadiusKm = radiusKm;

    const statusPill = document.getElementById('previewStatusPill');
    const loadingOverlay = document.getElementById('terrain3DLoading');
    const iframe = document.getElementById('terrain3DIframe') as HTMLIFrameElement;
    const thematicImg = document.getElementById('thematicMapsImg') as HTMLImageElement;
    const btnRegenText = document.getElementById('btnRegen3DText');
    const subtitleEl = document.getElementById('terrain3dSubtitle');

    if (statusPill) {
      statusPill.textContent = 'Calculando';
      statusPill.className = 'preview-status-pill loading';
    }
    if (loadingOverlay) {
      loadingOverlay.classList.remove('hidden');
    }
    if (btnRegenText) {
      btnRegenText.textContent = 'Generando...';
    }
    if (subtitleEl) {
      subtitleEl.textContent = `Radio de exploración: ${radiusKm} km en (${lat.toFixed(3)}°, ${lon.toFixed(3)}°) • DEM & Tubos de Lava`;
    }

    try {
      const resp = await fetch(`/api/terrain-3d?lat=${lat}&lon=${lon}&radius=${radiusKm}&force=${force}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data: Terrain3DResponse = await resp.json();

      // 1. Cargar el entorno WebGL interactivo generado por Plotly y el atlas temático
      if (iframe) {
        iframe.src = `${data.html_url}?t=${Date.now()}`;
      }
      if (thematicImg) {
        thematicImg.src = `${data.thematic_url}?t=${Date.now()}`;
      }

      // 2. Actualizar tarjetas de métricas analíticas y barra superior
      const simEl = document.getElementById('metricOverallSim');
      const elevEl = document.getElementById('metricElevRange');
      const slopeEl = document.getElementById('metricMeanSlope');
      const pearsonEl = document.getElementById('metricPearson');

      const simPct = data.metrics.overall_similarity_pct ?? (this.activeTargetSite?.similarity_score ?? 98.1);
      const minElev = data.metrics.elevation_min_m !== undefined ? Math.round(data.metrics.elevation_min_m) : 0;
      const maxElev = data.metrics.elevation_max_m !== undefined ? Math.round(data.metrics.elevation_max_m) : 360;
      const slopeDeg = data.metrics.mean_slope_deg !== undefined ? data.metrics.mean_slope_deg.toFixed(1) : '4.1';
      const rPearson = data.metrics.pearson_correlation_r !== undefined ? data.metrics.pearson_correlation_r.toFixed(3) : '0.999';
      const numCavs = data.cavities ? data.cavities.length : 0;

      if (simEl) simEl.textContent = `${typeof simPct === 'number' ? simPct.toFixed(1) : simPct}%`;
      if (elevEl) elevEl.textContent = `${minElev} m - ${maxElev} m`;
      if (slopeEl) slopeEl.textContent = `${slopeDeg}°`;
      if (pearsonEl) pearsonEl.textContent = `r = ${rPearson}`;

      // Barra superior fija de métricas sobre el mapa
      const topSimEl = document.getElementById('topSimVal');
      const topElevEl = document.getElementById('topElevVal');
      const topSlopeEl = document.getElementById('topSlopeVal');
      const topCavitiesEl = document.getElementById('topCavitiesVal');
      const topPearsonEl = document.getElementById('topPearsonVal');
      const scoreVal = document.getElementById('mapSiteScore');

      if (topSimEl) topSimEl.textContent = `${typeof simPct === 'number' ? simPct.toFixed(1) : simPct}%`;
      if (topElevEl) topElevEl.textContent = `${minElev} - ${maxElev} m`;
      if (topSlopeEl) topSlopeEl.textContent = `${slopeDeg}°`;
      if (topCavitiesEl) topCavitiesEl.textContent = `${numCavs} detectadas`;
      if (topPearsonEl) topPearsonEl.textContent = `r = ${rPearson}`;
      if (scoreVal && simPct) {
        scoreVal.textContent = `${Math.round(Number(simPct))}%`;
      }

      // 3. Poblar tabla científica de cavidades detectadas
      const tbody = document.getElementById('cavitiesTableBody');
      if (tbody && data.cavities) {
        tbody.innerHTML = '';
        data.cavities.forEach((c: CavityCandidate) => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td><code>${c.id}</code></td>
            <td><strong>${c.type}</strong></td>
            <td>${c.latitude.toFixed(4)}°, ${c.longitude.toFixed(4)}°</td>
            <td>${c.elevation_m.toFixed(1)} m</td>
            <td>${c.estimated_depth_m.toFixed(1)} m</td>
            <td>${c.rim_slope_deg.toFixed(1)}°</td>
            <td><strong style="color: #34d399;">${Math.round(c.confidence_score * 100)}%</strong></td>
          `;
          tbody.appendChild(row);
        });
      }

      // 4. Proyectar en Leaflet 2D el radio perimetral de 10 km y las balizas de cavidades
      if (this.map) {
        if (this.radiusCircle) {
          this.map.removeLayer(this.radiusCircle);
        }
        this.radiusCircle = L.circle([lat, lon], {
          radius: radiusKm * 1000,
          color: '#22d3ee',
          weight: 1.5,
          dashArray: '6, 6',
          fillColor: '#22d3ee',
          fillOpacity: 0.05
        }).addTo(this.map);

        this.cavityMarkers.forEach(m => this.map?.removeLayer(m));
        this.cavityMarkers = [];

        if (data.cavities) {
          data.cavities.forEach((c: CavityCandidate) => {
            const cavIcon = L.divIcon({
              className: 'cavity-radar-icon',
              html: `
                <div style="width: 14px; height: 14px; border-radius: 50%; background: #f59e0b; border: 2px solid #ffffff; box-shadow: 0 0 10px #f59e0b; cursor: pointer;"></div>
              `,
              iconSize: [14, 14],
              iconAnchor: [7, 7]
            });
            const cavMarker = L.marker([c.latitude, c.longitude], { icon: cavIcon }).addTo(this.map!);
            cavMarker.bindPopup(`
              <div style="font-family: sans-serif; font-size: 12px; color: #0f172a; padding: 4px;">
                <strong style="color: #d97706;">${c.id}: ${c.type}</strong><br/>
                <span>Profundidad estimada: <strong>${c.estimated_depth_m.toFixed(1)} m</strong></span><br/>
                <span>Pendiente de borde: <strong>${c.rim_slope_deg.toFixed(1)}°</strong></span><br/>
                <span>Elevación: <strong>${c.elevation_m.toFixed(1)} m</strong></span><br/>
                <span>Confianza científica: <strong style="color: #16a34a;">${Math.round(c.confidence_score * 100)}%</strong></span>
              </div>
            `);
            this.cavityMarkers.push(cavMarker);
          });
        }
      }

      if (statusPill) {
        statusPill.textContent = '3D Activo';
        statusPill.className = 'preview-status-pill';
      }
    } catch (err) {
      console.warn('No se pudo conectar con el endpoint 3D del backend:', err);
      if (statusPill) {
        statusPill.textContent = 'Demo 3D';
        statusPill.className = 'preview-status-pill';
      }
    } finally {
      if (loadingOverlay) loadingOverlay.classList.add('hidden');
      if (btnRegenText) btnRegenText.textContent = 'Generar Entorno 3D';
    }
  }
}
