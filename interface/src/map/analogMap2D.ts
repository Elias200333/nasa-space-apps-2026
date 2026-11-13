import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AnalogSite } from '../types';
import { sound } from '../audio';

export class AnalogMap2DManager {
  private mapContainer: HTMLElement;
  private map: L.Map | null = null;
  private currentMarker: L.Marker | null = null;
  private currentCircle: L.Circle | null = null;
  private activeTargetSite: AnalogSite | null = null;
  private onReturnToOrbitCallback?: (lat?: number, lon?: number) => void;
  private isReturning = false;
  private isTransitioning = false;

  constructor(mapContainerId: string) {
    this.mapContainer = document.getElementById(mapContainerId) as HTMLElement;
  }

  public setOnReturnToOrbit(callback: (lat?: number, lon?: number) => void) {
    this.onReturnToOrbitCallback = callback;
  }

  /**
   * Navegación libre desde la perspectiva exacta que el usuario estaba mirando en 3D.
   * - Abre a escala continental ("medianamente alejado", zoom 5) para que no cambie la perspectiva visual.
   * - Sin indicadores de coordenadas ni popups que estorben la vista.
   */
  public triggerFreeExplorationDive(lat: number, lon: number, zoomLevel = 5) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    this.isReturning = false;

    // 1. Limpiar marcadores y balizas previas para exploración completamente limpia
    this.clearMarkers();
    this.activeTargetSite = null;

    // 2. Preparar el contenedor para el crossfade suave
    this.mapContainer.classList.remove('hidden');
    this.mapContainer.style.opacity = '0';
    this.mapContainer.style.transform = 'scale(0.98)';
    this.mapContainer.style.transition = 'opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1), transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)';

    this.ensureMapInitialized(lat, lon, zoomLevel);

    // Centrar en las coordenadas exactas que el usuario estaba observando en la esfera 3D
    this.map!.setView([lat, lon], zoomLevel, { animate: false });
    this.map!.invalidateSize();

    // Actualizar barra HUD limpia sin coordenadas forzadas
    this.setupFreeExplorationHUD();

    // 3. Crossfade suave
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

    requestAnimationFrame(() => {
      this.mapContainer.classList.add('active');
      this.mapContainer.style.opacity = '1';
      this.mapContainer.style.transform = 'scale(1)';
      setTimeout(() => {
        this.isTransitioning = false;
      }, 500);
    });
  }

  private ensureMapInitialized(lat: number, lon: number, initialZoom = 5) {
    if (this.map) return;

    this.map = L.map('leafletMap', {
      center: [lat, lon],
      zoom: initialZoom,
      minZoom: 2,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: false
    });

    // Capa de satélite fotorrealista de alta definición de Esri World Imagery
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
      attribution: 'Esri, Maxar, Earthstar Geographics'
    }).addTo(this.map);

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Detección de alejamiento con rueda del ratón: volver a la esfera 3D al llegar a vista global
    this.map.on('zoomend', () => {
      if (!this.map || this.isReturning || this.isTransitioning) return;
      if (this.map.getZoom() <= 3) {
        this.returnToSpaceOrbit();
      }
    });

    const mapElem = document.getElementById('leafletMap');
    if (mapElem) {
      mapElem.addEventListener('wheel', (e) => {
        if (!this.map || this.isReturning || this.isTransitioning) return;
        if (e.deltaY > 0 && this.map.getZoom() <= 4) {
          this.returnToSpaceOrbit();
        }
      }, { passive: true });
    }
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
    const titleEl = document.getElementById('mapSiteTitle');
    const coordsEl = document.getElementById('mapSiteCoords');
    const badgeEl = document.getElementById('mapTargetBadge');
    const btnCenter = document.getElementById('btnCenterTarget');
    const scoreChip = document.getElementById('mapSiteScore')?.parentElement;

    if (badgeEl) {
      badgeEl.textContent = 'VISTA SATELITAL 2D';
      badgeEl.className = 'map-hud-badge';
    }
    if (titleEl) {
      titleEl.textContent = 'Exploración Libre de Terreno';
    }
    if (coordsEl) {
      coordsEl.textContent = 'Navegación satelital en alta resolución • Esri World Imagery';
    }
    if (btnCenter) {
      btnCenter.style.display = 'none';
    }
    if (scoreChip) {
      scoreChip.style.display = 'none';
    }
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

  /**
   * Regresa suavemente del mapa 2D a la órbita espacial 3D,
   * sincronizando la rotación de la Tierra con el punto donde el usuario estaba mirando en 2D.
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
    // antes de que comience a desvanecerse la capa satelital
    if (this.onReturnToOrbitCallback) {
      this.onReturnToOrbitCallback(lat, lon);
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
}
