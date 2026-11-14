import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AnalogSite } from '../types';
import { sound } from '../audio';

export class AnalogMap2DManager {
  private mapContainer: HTMLElement;
  private map: L.Map | null = null;
  private currentMarker: L.Marker | null = null;
  private currentCircle: L.Circle | null = null;
  private onReturnToOrbitCallback?: () => void;
  private isReturning = false;
  private isTransitioning = false;

  constructor(mapContainerId: string) {
    this.mapContainer = document.getElementById(mapContainerId) as HTMLElement;
  }

  public setOnReturnToOrbit(callback: () => void) {
    this.onReturnToOrbitCallback = callback;
  }

  /**
   * Transición de zoom óptico sin cortes entre el planeta 3D y el mapa 2D:
   * 1. El mapa satelital aparece sutilmente fundido desde la vista 3D a escala regional (zoom 6).
   * 2. Continúa la inercia del zoom de forma suave hacia la resolución local (zoom 12).
   * 3. Sin pantallas de carga, sin líneas de escaneo ni efectos de videojuego.
   */
  public triggerSeamlessZoomDive(site: AnalogSite) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    this.isReturning = false;

    const lat = site.coordinates.latitude;
    const lon = site.coordinates.longitude;

    // Mostrar contenedor listo para el crossfade
    this.mapContainer.classList.remove('hidden');
    this.mapContainer.style.opacity = '0';
    this.mapContainer.style.transform = 'scale(0.97)';
    this.mapContainer.style.transition = 'opacity 0.55s cubic-bezier(0.16, 1, 0.3, 1), transform 0.55s cubic-bezier(0.16, 1, 0.3, 1)';

    this.ensureMapInitialized(lat, lon, 5);

    // Ajustar vista inicial en zoom continental (nivel 5) que empata con la cota orbital 4.1
    this.map!.setView([lat, lon], 5, { animate: false });
    this.map!.invalidateSize();

    // Dibujar marcadores y actualizar datos HUD
    this.renderSiteMarkers(site);
    this.updateMapHUD(site);

    // Crossfade suave e inicio del vuelo de cámara
    requestAnimationFrame(() => {
      this.mapContainer.classList.add('active');
      this.mapContainer.style.opacity = '1';
      this.mapContainer.style.transform = 'scale(1)';

      // Vuelo continuo y fluido hacia el terreno a nivel 12
      setTimeout(() => {
        if (this.map && !this.isReturning) {
          this.map.flyTo([lat, lon], 12, {
            animate: true,
            duration: 1.5,
            easeLinearity: 0.22
          });
        }
        this.isTransitioning = false;
      }, 80);

      // Abrir tarjeta informativa una vez aterrizada la cámara
      setTimeout(() => {
        if (this.currentMarker && !this.isReturning) {
          this.currentMarker.openPopup();
        }
      }, 1600);
    });
  }

  /**
   * Transición de zoom manual cuando el usuario acerca la rueda del ratón
   */
  public triggerManualCoordinatesDive(lat: number, lon: number, defaultBody: 'Moon' | 'Mars' = 'Moon') {
    const exploratorySite: AnalogSite = {
      id: `manual-${lat.toFixed(2)}-${lon.toFixed(2)}`,
      name: 'Observación de Terreno Satelital',
      target_body: defaultBody,
      region: `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`,
      country: `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`,
      coordinates: {
        latitude: lat,
        longitude: lon,
        label: `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}`
      },
      similarity_score: 88,
      scientific_justification: 'Inspección de alta resolución mediante satélites de observación de la Tierra.',
      sources: ['NASA Worldview', 'Esri High-Resolution World Imagery'],
      status: 'candidate'
    };

    this.triggerSeamlessZoomDive(exploratorySite);
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
