import { CelestialBody, PlanetaryLayerMode, PlanetaryPOI, TrekLayerConfig } from '../types';

/**
 * Catálogo verificado de capas oficiales de NASA Trek WMTS
 * Endpoints comprobados mediante GetCapabilities en trek.nasa.gov
 */
export const NASA_TREK_LAYERS: Record<string, TrekLayerConfig> = {
  // MARTE - Superficie: Mosaico Global Viking MDIM2.1
  mars_surface: {
    id: 'mars_surface',
    title: 'Superficie Visual (Mosaico Viking)',
    body: 'Mars',
    layerType: 'surface',
    layerName: 'Mars_Viking_MDIM21_ClrMosaic_global_232m',
    format: 'jpg',
    minZoom: 0,
    maxZoom: 7,
    attribution: 'NASA / USGS Astrogeology / Viking Orbiter',
    datasetInfo: 'Mosaico en color MDIM2.1 a 232 m/píxel derivado de cámaras orbitales Viking 1 y 2.',
    isHillshade: false
  },

  // MARTE - Topografía: MGS MOLA Global Color Hillshade
  mars_topography: {
    id: 'mars_topography',
    title: 'Topografía Altimétrica (MGS MOLA)',
    body: 'Mars',
    layerType: 'topography',
    layerName: 'Mars_MGS_MOLA_ClrShade_merge_global_463m',
    format: 'jpg',
    minZoom: 0,
    maxZoom: 7,
    attribution: 'NASA / GSFC / MGS MOLA Science Team',
    datasetInfo: 'Relieve sombreado en rampa de color hipsométrica (463 m/px) derivado del altímetro láser MOLA. Representa gradientes de elevación sobre el datum areoide marciano (no es malla 3D física).',
    isHillshade: true
  },

  // MARTE - Topografía Detallada: MOLA + HRSC Blend
  mars_topo_hrsc: {
    id: 'mars_topo_hrsc',
    title: 'Altimetría de Alta Resolución (MOLA + HRSC Blend)',
    body: 'Mars',
    layerType: 'topography',
    layerName: 'Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw',
    format: 'jpg',
    minZoom: 0,
    maxZoom: 7,
    attribution: 'NASA / ESA / DLR / MOLA & HRSC Teams',
    datasetInfo: 'Combinación combinada de altimetría láser MOLA (MGS) y cámara estéreo HRSC (Mars Express) a 200 m/px.',
    isHillshade: true
  },

  // LUNA - Superficie: Mosaico Global LRO LROC WAC
  moon_surface: {
    id: 'moon_surface',
    title: 'Superficie Visual (LRO LROC WAC)',
    body: 'Moon',
    layerType: 'surface',
    layerName: 'LRO_WAC_Mosaic_Global_303ppd_v02',
    format: 'jpg',
    minZoom: 0,
    maxZoom: 8,
    attribution: 'NASA / GSFC / Arizona State University (LROC)',
    datasetInfo: 'Mosaico global multiespectral Wide Angle Camera a 100 m/píxel (303 ppd) de Lunar Reconnaissance Orbiter.',
    isHillshade: false
  },

  // LUNA - Topografía: LRO LOLA Global Color Hillshade
  moon_topography: {
    id: 'moon_topography',
    title: 'Topografía Altimétrica (LRO LOLA)',
    body: 'Moon',
    layerType: 'topography',
    layerName: 'LRO_LOLA_ClrShade_Global_128ppd_v04',
    format: 'png',
    minZoom: 0,
    maxZoom: 5,
    attribution: 'NASA / GSFC / LOLA Science Team',
    datasetInfo: 'Modelo topográfico de relieve sombreado en color a 128 ppd derivado de 6.5 mil millones de mediciones del altímetro láser LOLA.',
    isHillshade: true
  }
};

/**
 * Puntos de Interés y Accidentes Geográficos Verificados de la NASA
 * Coordenadas oficiales validadas según catálogos USGS / IAU / NASA Trek
 */
export const VERIFIED_PLANETARY_POIS: Record<'Mars' | 'Moon', PlanetaryPOI[]> = {
  Mars: [
    {
      id: 'mars_olympus_mons',
      name: 'Olympus Mons',
      nameEs: 'Monte Olimpo',
      body: 'Mars',
      latitude: 18.65,
      longitude: -133.80, // 226.20° E
      elevation_km: 21.28,
      diameter_km: 600,
      type: 'Volcán en escudo',
      description: 'El volcán y montaña más alta conocida del sistema solar. Su caldera central mide 80 km de ancho y sus acantilados perimetrales caen hasta 8 km.',
      mission: 'MGS MOLA / Viking / Mars Express',
      datasetProvenance: 'NASA MGS MOLA Altimetry & Viking Orbiter MDIM2.1'
    },
    {
      id: 'mars_valles_marineris',
      name: 'Valles Marineris',
      nameEs: 'Valles Marineris',
      body: 'Mars',
      latitude: -14.00,
      longitude: -59.00, // 301.00° E
      elevation_km: -7.0,
      diameter_km: 4000,
      type: 'Sistema de cañones tectónicos',
      description: 'El cañón más gigantesco de Marte: 4,000 km de longitud, hasta 200 km de anchura y 7 km de profundidad (10 veces más largo que el Gran Cañón del Colorado).',
      mission: 'Mariner 9 / MGS / Mars Express',
      datasetProvenance: 'NASA MGS MOLA & Mars Express HRSC'
    },
    {
      id: 'mars_jezero_crater',
      name: 'Jezero Crater',
      nameEs: 'Cráter Jezero',
      body: 'Mars',
      latitude: 18.38,
      longitude: 77.58,
      elevation_km: -2.5,
      diameter_km: 45,
      type: 'Paleolago y delta fluvial',
      description: 'Antiguo lago de impacto con abanico aluvial deltaico preservado. Sitio de amartizaje de la misión Mars 2020 Perseverance Rover y el helicóptero Ingenuity.',
      mission: 'Mars 2020 Perseverance Rover (2021-presente)',
      datasetProvenance: 'NASA MRO CTX / HiRISE & MGS MOLA'
    },
    {
      id: 'mars_gale_crater',
      name: 'Gale Crater (Mt. Sharp)',
      nameEs: 'Cráter Gale (Monte Sharp)',
      body: 'Mars',
      latitude: -5.37,
      longitude: 137.81,
      elevation_km: -4.5,
      diameter_km: 154,
      type: 'Cráter de impacto con macizo sedimentario',
      description: 'Cráter con el monte central Aeolis Mons (5.5 km de estratos arcillosos y sulfatados). Sitio de exploración continua del rover Curiosity desde agosto de 2012.',
      mission: 'Mars Science Laboratory Curiosity (2012-presente)',
      datasetProvenance: 'NASA MSL / MRO CTX'
    },
    {
      id: 'mars_elysium_mons',
      name: 'Elysium Mons',
      nameEs: 'Monte Elysium',
      body: 'Mars',
      latitude: 25.02,
      longitude: 147.21,
      elevation_km: 12.6,
      diameter_km: 240,
      type: 'Volcán en escudo',
      description: 'Cumbre volcánica prominente de la provincia ígnea de Elysium Planitia, vecina a la estación geofísica de NASA InSight.',
      mission: 'NASA MGS / InSight',
      datasetProvenance: 'NASA MGS MOLA Altimetry'
    }
  ],

  Moon: [
    {
      id: 'moon_tycho_crater',
      name: 'Tycho Crater',
      nameEs: 'Cráter Tycho',
      body: 'Moon',
      latitude: -43.31,
      longitude: -11.36,
      elevation_km: -4.8,
      diameter_km: 86,
      type: 'Cráter de impacto radiado',
      description: 'Cráter de impacto copernicano joven (~108 Ma) con el sistema de rayos brillantes más espectacular de la Luna, visible a simple vista desde la Tierra.',
      mission: 'Surveyor 7 / Apollo 17 / LRO',
      datasetProvenance: 'NASA LRO LROC WAC / NAC & LOLA'
    },
    {
      id: 'moon_copernicus_crater',
      name: 'Copernicus Crater',
      nameEs: 'Cráter Copérnico',
      body: 'Moon',
      latitude: 9.62,
      longitude: -20.08,
      elevation_km: -3.8,
      diameter_km: 93,
      type: 'Cráter de impacto aterrazado',
      description: 'Cráter arquetípico con paredes en terrazas múltiples y picos centrales triples de hasta 1.2 km de altura sobre el suelo del cráter en Oceanus Procellarum.',
      mission: 'Apollo Lunar Orbiter / LRO',
      datasetProvenance: 'NASA LRO LROC & LOLA DEM'
    },
    {
      id: 'moon_mare_tranquillitatis',
      name: 'Mare Tranquillitatis (Apollo 11)',
      nameEs: 'Mar de la Tranquilidad (Statio Tranquillitatis)',
      body: 'Moon',
      latitude: 0.674,
      longitude: 23.473,
      elevation_km: -1.3,
      diameter_km: 873,
      type: 'Mar basáltico / Sitio de alunizaje',
      description: 'Primer alunizaje humano en la Luna: 20 de julio de 1969. Neil Armstrong y Buzz Aldrin recolectaron 21.5 kg de muestras de regolito e ilmenita.',
      mission: 'Apollo 11 Lunar Landing (1969)',
      datasetProvenance: 'NASA Apollo Lunar Program & LRO LROC'
    },
    {
      id: 'moon_aristarchus_plateau',
      name: 'Aristarchus Plateau & Vallis Schröteri',
      nameEs: 'Meseta de Aristarco',
      body: 'Moon',
      latitude: 23.70,
      longitude: -47.40,
      elevation_km: 2.0,
      diameter_km: 170,
      type: 'Meseta volcánica y rima sinuosa',
      description: 'Elevación volcánica de alto albedo con el canal sinuoso de lava más grande de la Luna (Vallis Schröteri) y concentraciones de minerales piroclásticos.',
      mission: 'Clementine / LRO',
      datasetProvenance: 'NASA LRO LROC & Clementine UVVIS'
    },
    {
      id: 'moon_shackleton_crater',
      name: 'Shackleton Crater (South Pole)',
      nameEs: 'Cráter Shackleton (Polo Sur Lunar)',
      body: 'Moon',
      latitude: -89.90,
      longitude: 0.00,
      elevation_km: -4.2,
      diameter_km: 21,
      type: 'Cráter polar en sombra permanente',
      description: 'Picos de borde con luz solar casi continua e interior en oscuridad perpetua a 40 K con ricas reservas de hielo de agua. Zona primaria de Artemis III.',
      mission: 'NASA Artemis Program / LRO / LCROSS',
      datasetProvenance: 'NASA LRO LOLA Laser Altimeter & Mini-RF'
    }
  ]
};

/**
 * Propiedades físicas, radios orbitales y especificaciones geodésicas
 */
export interface PlanetaryBodyDetails {
  name: CelestialBody;
  nameEs: string;
  radiusKm: number;
  scaledGlobeRadius: number; // Radio en unidades de escena 3D BabylonJS
  datumName: string;
  gravityRatio: number; // vs Tierra (1.0)
  surfacePressure: string;
  atmosphereDescription: string;
  coordSystem: string;
  defaultLat: number;
  defaultLon: number;
  defaultZoom: number;
}

export const PLANETARY_DETAILS: Record<CelestialBody, PlanetaryBodyDetails> = {
  Earth: {
    name: 'Earth',
    nameEs: 'Tierra',
    radiusKm: 6371.0,
    scaledGlobeRadius: 2.80,
    datumName: 'WGS84 Geodetic Reference Ellipsoid',
    gravityRatio: 1.0,
    surfacePressure: '1013.25 hPa (1.0 atm)',
    atmosphereDescription: '78% N₂, 21% O₂, 0.9% Ar, vapor de agua variable. Dispersión Rayleigh azulada.',
    coordSystem: 'Coordenadas Geodésicas WGS84 (Lat/Lon)',
    defaultLat: 28.5383,
    defaultLon: -15.5,
    defaultZoom: 5
  },
  Mars: {
    name: 'Mars',
    nameEs: 'Marte',
    radiusKm: 3389.5,
    scaledGlobeRadius: 2.65,
    datumName: 'IAU2000 Mars Reference Ellipsoid (Areoide)',
    gravityRatio: 0.379,
    surfacePressure: '6.1 hPa (~0.006 atm)',
    atmosphereDescription: '95% CO₂, 2.6% N₂, 1.9% Ar. Dispersión atmosférica delgada de polvo rojizo/salmón.',
    coordSystem: 'Coordenadas Planetocéntricas IAU2000 (Lat/Lon)',
    defaultLat: 18.65,
    defaultLon: -133.80, // Olympus Mons
    defaultZoom: 4
  },
  Moon: {
    name: 'Moon',
    nameEs: 'Luna',
    radiusKm: 1737.4,
    scaledGlobeRadius: 2.50,
    datumName: 'IAU2000 Mean Earth/Polar Axis (MEPA) Lunar Spheroid',
    gravityRatio: 0.165,
    surfacePressure: '3 × 10⁻¹⁵ atm (Vacío / Exosfera residual)',
    atmosphereDescription: 'Vacío espacial. Terminador solar nítido sin atenuación atmosférica.',
    coordSystem: 'Coordenadas Selenográficas IAU2000 (Lat/Lon)',
    defaultLat: -43.31,
    defaultLon: -11.36, // Tycho Crater
    defaultZoom: 4
  }
};

/**
 * Generador de URLs de teselas WMTS de NASA Trek
 */
export function buildNasaTrekTileUrl(
  body: 'Moon' | 'Mars',
  layerName: string,
  z: number,
  y: number,
  x: number,
  ext: 'jpg' | 'png' = 'jpg'
): string {
  return `https://trek.nasa.gov/tiles/${body}/EQ/${layerName}/1.0.0/default/default028mm/${z}/${y}/${x}.${ext}`;
}

/**
 * Formateador de coordenadas según la convención de cada cuerpo celeste
 */
export function formatPlanetaryCoordinates(body: CelestialBody, lat: number, lon: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  const latStr = `${Math.abs(lat).toFixed(4)}° ${latDir}`;
  const lonStr = `${Math.abs(lon).toFixed(4)}° ${lonDir}`;

  if (body === 'Earth') {
    return `${latStr}, ${lonStr} • WGS84`;
  }
  if (body === 'Moon') {
    return `${latStr}, ${lonStr} • Selenográficas (NASA Moon Trek)`;
  }
  return `${latStr}, ${lonStr} • Planetocéntricas (NASA Mars Trek)`;
}

