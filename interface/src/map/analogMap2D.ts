import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AnalogSite } from '../types';
import { sound } from '../audio';

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radio medio de la Tierra en kilómetros
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function getBearingDirection(lat1: number, lon1: number, lat2: number, lon2: number): string {
  const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  let brng = Math.atan2(y, x) * 180 / Math.PI;
  brng = (brng + 360) % 360;
  const directions = ['Norte', 'Noreste', 'Este', 'Sureste', 'Sur', 'Suroeste', 'Oeste', 'Noroeste'];
  return directions[Math.round(brng / 45) % 8];
}

export class AnalogMap2DManager {
  private mapContainer: HTMLElement;
  private map: L.Map | null = null;
  private currentMarker: L.Marker | null = null;
  private currentCircle: L.Circle | null = null;
  private onReturnToOrbitCallback?: () => void;
  private isReturning = false;
  private isTransitioning = false;

  // Estado de exploración libre
  private activeTargetSite: AnalogSite | null = null;
  private isTargetReached = false;

  constructor(mapContainerId: string) {
    this.mapContainer = document.getElementById(mapContainerId) as HTMLElement;
  }

  public setOnReturnToOrbit(callback: () => void) {
    this.onReturnToOrbitCallback = callback;
  }

  /**
   * Transición de zoom a Exploración Libre:
   * 1. El mapa satelital se funde a escala regional (zoom 5 o 6).
   * 2. NO bloquea la vista ni abre ventanas invasivas de información.
   * 3. Deja al usuario explorar libremente hasta alcanzar las coordenadas sugeridas.
   */
  public triggerSeamlessZoomDive(site: AnalogSite) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    this.isReturning = false;

    this.activeTargetSite = site;
    this.isTargetReached = false;

    const lat = site.coordinates.latitude;
    const lon = site.coordinates.longitude;

    // Mostrar contenedor con crossfade suave
    this.mapContainer.classList.remove('hidden');
    this.mapContainer.style.opacity = '0';
    this.mapContainer.style.transform = 'scale(0.97)';
    this.mapContainer.style.transition = 'opacity 0.55s cubic-bezier(0.16, 1, 0.3, 1), transform 0.55s cubic-bezier(0.16, 1, 0.3, 1)';

    this.ensureMapInitialized(lat, lon, 6);

    // Abrir a escala regional (zoom 6) para permitir exploración libre del área circundante
    this.map!.setView([lat, lon], 6, { animate: false });
    this.map!.invalidateSize();

    // Dibujar la baliza de objetivo en el mapa
    this.renderSiteMarkers(site);
    this.updateExplorationTracker();

    // Crossfade de entrada
    requestAnimationFrame(() => {
      this.mapContainer.classList.add('active');
      this.mapContainer.style.opacity = '1';
      this.mapContainer.style.transform = 'scale(1)';
      this.isTransitioning = false;
    });
  }

  /**
   * Transición cuando el usuario hace zoom in manual con la rueda del ratón
   */
  public triggerManualCoordinatesDive(lat: number, lon: number, defaultBody: 'Moon' | 'Mars' = 'Moon') {
    if (!this.activeTargetSite) {
      this.activeTargetSite = {
        id: `manual-${lat.toFixed(2)}-${lon.toFixed(2)}`,
        name: 'Zona Análoga Terrestre',
        target_body: defaultBody,
        region: `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`,
        country: `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`,
        coordinates: {
          latitude: lat,
          longitude: lon,
          label: `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}`
        },
        similarity_score: 87,
        scientific_justification: 'Inspección de alta resolución mediante satélites de observación de la Tierra.',
        sources: ['NASA Worldview', 'Esri High-Resolution World Imagery'],
        status: 'candidate'
      };
    }

    this.triggerSeamlessZoomDive(this.activeTargetSite);
  }

  private ensureMapInitialized(lat: number, lon: number, initialZoom = 6) {
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

    // Rastreo en tiempo real mientras el usuario se desplaza por el mapa
    this.map.on('move', () => {
      this.updateExplorationTracker();
    });

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

  private renderSiteMarkers(site: AnalogSite) {
    if (!this.map) return;
    const lat = site.coordinates.latitude;
    const lon = site.coordinates.longitude;

    if (this.currentMarker) this.map.removeLayer(this.currentMarker);
    if (this.currentCircle) this.map.removeLayer(this.currentCircle);

    const accentColor = site.target_body === 'Moon' ? '#22d3ee' : '#f97316';

    this.currentCircle = L.circle([lat, lon], {
      color: accentColor,
      fillColor: accentColor,
      fillOpacity: 0.15,
      radius: 2200,
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

    // Al hacer clic en el marcador, se considera objetivo alcanzado y se abre su tarjeta
    this.currentMarker.on('click', () => {
      this.isTargetReached = true;
      this.updateExplorationTracker();
    });
  }

  /**
   * Actualiza el rastreador de distancia y rumbo hacia el objetivo en tiempo real
   */
  private updateExplorationTracker() {
    if (!this.map || !this.activeTargetSite) return;

    const center = this.map.getCenter();
    const targetLat = this.activeTargetSite.coordinates.latitude;
    const targetLon = this.activeTargetSite.coordinates.longitude;

    const dist = getDistanceKm(center.lat, center.lng, targetLat, targetLon);
    const dir = getBearingDirection(center.lat, center.lng, targetLat, targetLon);

    const titleEl = document.getElementById('mapSiteTitle');
    const coordsEl = document.getElementById('mapSiteCoords');
    const badgeEl = document.getElementById('mapTargetBadge');
    const scoreEl = document.getElementById('mapSiteScore');

    // Umbral de llegada: cuando el usuario sitúa la vista a menos de 50 km del análogo
    if (dist <= 50 && !this.isTargetReached) {
      this.isTargetReached = true;
      sound.playClick(880);

      if (badgeEl) {
        badgeEl.textContent = `🎯 ANÁLOGO ALCANZADO [${this.activeTargetSite.target_body.toUpperCase()}]`;
        badgeEl.className = 'map-hud-badge target-reached-badge';
      }
      if (titleEl) {
        titleEl.textContent = this.activeTargetSite.name;
      }
      if (coordsEl) {
        coordsEl.textContent = `📍 ${this.activeTargetSite.region}, ${this.activeTargetSite.country} — ${this.activeTargetSite.coordinates.label}`;
      }
      if (scoreEl) {
        scoreEl.textContent = `${this.activeTargetSite.similarity_score}%`;
      }

      // Abrir la información detallada una vez que el usuario ha llegado al lugar
      if (this.currentMarker && !this.currentMarker.isPopupOpen()) {
        this.currentMarker.openPopup();
      }
    } else if (!this.isTargetReached) {
      if (badgeEl) {
        badgeEl.textContent = `EXPLORACIÓN LIBRE [${this.activeTargetSite.target_body.toUpperCase()}]`;
        badgeEl.className = `map-hud-badge ${this.activeTargetSite.target_body.toLowerCase()}-badge`;
      }
      if (titleEl) {
        titleEl.textContent = `Explorando terreno: busca el análogo sugerido`;
      }
      if (coordsEl) {
        coordsEl.textContent = `🎯 Objetivo: ${this.activeTargetSite.name} (${this.activeTargetSite.coordinates.label}) • A ${dist.toLocaleString()} km hacia el ${dir}`;
      }
      if (scoreEl) {
        scoreEl.textContent = `--%`;
      }
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
      this.isTargetReached = true;
      this.updateExplorationTracker();
      if (this.currentMarker) {
        this.currentMarker.openPopup();
      }
    }, 1500);
  }

  /**
   * Regresa suavemente del mapa 2D a la órbita espacial 3D
   */
  public returnToSpaceOrbit() {
    if (this.isReturning) return;
    this.isReturning = true;
    sound.playClick(480);

    // 1. Desvanecer suavemente el contenedor 2D
    this.mapContainer.style.transition = 'opacity 0.45s ease-out, transform 0.45s ease-out';
    this.mapContainer.style.opacity = '0';
    this.mapContainer.style.transform = 'scale(0.97)';

    // 2. Disparar el ascenso de la cámara 3D de BabylonJS de fondo
    if (this.onReturnToOrbitCallback) {
      this.onReturnToOrbitCallback();
    }

    setTimeout(() => {
      this.mapContainer.classList.remove('active');
      this.mapContainer.classList.add('hidden');
      this.isReturning = false;
    }, 450);
  }
}
