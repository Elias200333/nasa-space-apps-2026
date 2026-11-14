import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AnalogSite } from '../types';
import { sound } from '../audio';

export class AnalogMap2DManager {
  private mapContainer: HTMLElement;
  private transitionOverlay: HTMLElement;
  private map: L.Map | null = null;
  private currentMarker: L.Marker | null = null;
  private currentCircle: L.Circle | null = null;
  private onReturnToOrbitCallback?: () => void;

  constructor(mapContainerId: string, transitionOverlayId: string) {
    this.mapContainer = document.getElementById(mapContainerId) as HTMLElement;
    this.transitionOverlay = document.getElementById(transitionOverlayId) as HTMLElement;
  }

  public setOnReturnToOrbit(callback: () => void) {
    this.onReturnToOrbitCallback = callback;
  }

  /**
   * Inicia la secuencia cinematográfica de inmersión atmosférica
   * y abre el mapa satelital 2D de alta resolución
   */
  public triggerAtmosphericDive(site: AnalogSite) {
    sound.playTargetLock();

    // 1. Fase 1: Activar efecto de fricción y niebla de reentrada en la atmósfera
    this.transitionOverlay.classList.remove('hidden', 'fade-out', 'ascent-effect');
    this.transitionOverlay.classList.add('active', 'dive-effect');

    // Sonido de estruendo atmosférico acelerado
    setTimeout(() => {
      sound.playWhoosh();
    }, 400);

    // 2. Fase 2: Tras penetrar las nubes (1.8s), inicializar y desplegar el mapa 2D
    setTimeout(() => {
      this.display2DMap(site);

      // Desvanecer nubes de reentrada para revelar el mapa satelital
      this.transitionOverlay.classList.remove('dive-effect');
      this.transitionOverlay.classList.add('fade-out');

      setTimeout(() => {
        this.transitionOverlay.classList.remove('active', 'fade-out');
        this.transitionOverlay.classList.add('hidden');
      }, 700);
    }, 1700);
  }

  /**
   * Carga y renderiza el mapa satelital Leaflet con capa Esri World Imagery
   */
  private display2DMap(site: AnalogSite) {
    this.mapContainer.classList.remove('hidden');
    this.mapContainer.classList.add('active');

    const lat = site.coordinates.latitude;
    const lon = site.coordinates.longitude;

    if (!this.map) {
      this.map = L.map('leafletMap', {
        center: [lat, lon],
        zoom: 12,
        zoomControl: false,
        attributionControl: false
      });

      // Capa de satélite fotorrealista de alta definición de Esri / NASA
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18,
        attribution: 'Esri, Maxar, Earthstar Geographics, USDA, USGS'
      }).addTo(this.map);

      // Controles de zoom abajo a la derecha
      L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    } else {
      this.map.setView([lat, lon], 12, { animate: true });
      this.map.invalidateSize();
    }

    // Limpiar marcadores anteriores
    if (this.currentMarker) {
      this.map.removeLayer(this.currentMarker);
    }
    if (this.currentCircle) {
      this.map.removeLayer(this.currentCircle);
    }

    // 1. Anillo pulsante de radar georreferenciado sobre el análogo
    const accentColor = site.target_body === 'Moon' ? '#22d3ee' : '#f97316';
    this.currentCircle = L.circle([lat, lon], {
      color: accentColor,
      fillColor: accentColor,
      fillOpacity: 0.2,
      radius: 2500,
      weight: 2
    }).addTo(this.map);

    // 2. Icono holográfico personalizado para el marcador
    const customIcon = L.divIcon({
      className: 'analog-radar-marker',
      html: `
        <div class="radar-ping" style="border-color:${accentColor};"></div>
        <div class="radar-core" style="background:${accentColor}; box-shadow:0 0 14px ${accentColor};"></div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });

    this.currentMarker = L.marker([lat, lon], { icon: customIcon }).addTo(this.map);

    // Popup informativo geológico
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
    `).openPopup();

    // Actualizar HUD superior del mapa 2D
    this.updateMapHUD(site);
  }

  private updateMapHUD(site: AnalogSite) {
    const titleEl = document.getElementById('mapSiteTitle');
    const coordsEl = document.getElementById('mapSiteCoords');
    const badgeEl = document.getElementById('mapTargetBadge');
    const scoreEl = document.getElementById('mapSiteScore');

    if (titleEl) titleEl.textContent = site.name;
    if (coordsEl) coordsEl.textContent = `${site.region}, ${site.country} | ${site.coordinates.label}`;
    if (badgeEl) {
      badgeEl.textContent = `${site.target_body.toUpperCase()} ANALOG`;
      badgeEl.className = `map-hud-badge ${site.target_body.toLowerCase()}-badge`;
    }
    if (scoreEl) scoreEl.textContent = `${site.similarity_score}%`;
  }

  /**
   * Regresa desde el mapa 2D a la vista orbital 3D en el espacio
   */
  public returnToSpaceOrbit() {
    sound.playClick(600);

    // Activar nubes ascendentes de despegue
    this.transitionOverlay.classList.remove('hidden', 'fade-out');
    this.transitionOverlay.classList.add('active', 'ascent-effect');

    setTimeout(() => {
      // Ocultar mapa 2D
      this.mapContainer.classList.remove('active');
      this.mapContainer.classList.add('hidden');

      // Notificar a la escena 3D para que aleje la cámara a órbita
      if (this.onReturnToOrbitCallback) {
        this.onReturnToOrbitCallback();
      }

      // Desvanecer nubes de ascenso al llegar al espacio
      setTimeout(() => {
        this.transitionOverlay.classList.remove('ascent-effect');
        this.transitionOverlay.classList.add('fade-out');

        setTimeout(() => {
          this.transitionOverlay.classList.remove('active', 'fade-out');
          this.transitionOverlay.classList.add('hidden');
        }, 600);
      }, 700);
    }, 600);
  }
}

