import { AnalogSite, PlanetMetrics, AnalogCandidateItem } from '../types';

/**
 * Catálogo sincronizado de 20 análogos terrestres científicos para misiones Luna y Marte
 * (NASA Space Apps Challenge 2026 • 10 candidatos Luna, 10 candidatos Marte)
 * Generado y validado a partir de global_analog_catalog_20.json
 */
export const ANALOG_DATABASE: AnalogSite[] = [
  // =========================================================================
  // 10 ANÁLOGOS LUNARES (MOON)
  // =========================================================================
  {
    id: 'ES_FUERTEVENTURA_ARENA',
    name: 'Malpaís de la Arena y Complejo Basal',
    target_body: 'Moon',
    coordinates: { latitude: 28.6500, longitude: -13.9100, label: '28.6500° N, 13.9100° W' },
    region: 'Fuerteventura, Islas Canarias',
    country: 'España',
    geological_features: ['Campo de lava aa holoceno', 'Tubos de lava pequeños', 'Conductos basálticos'],
    scientific_justification: 'Campo de lava aa sin cobertura vegetal con bloques escarpados y aristas afiladas, ideal para pruebas de tracción de rovers.',
    similarity_score: 66.8,
    coverage_percentage: 100,
    dominant_terrain: 'Malpaís basáltico de bloques',
    sources: ['IGN PNOA-LiDAR', 'IGME', 'NASA Trek'],
    status: 'candidate',
    rank: 1,
    pairing: 'Lunar Mare Rough Blocky Transition Terraces (Moon)'
  },
  {
    id: 'US_ARIZONA_SP_CRATER',
    name: 'SP Crater & San Francisco Volcanic Field',
    target_body: 'Moon',
    coordinates: { latitude: 35.5820, longitude: -111.6380, label: '35.5820° N, 111.6380° W' },
    region: 'Arizona',
    country: 'EE.UU.',
    geological_features: ['Cono de ceniza basáltico simétrico', 'Colada de lava aa de 7 km', 'Dorsales de enfriamiento'],
    scientific_justification: 'Cono de ceniza basáltico-andesítico con ángulo de reposo de 33° que replica conos piroclásticos lunares de Marius Hills.',
    similarity_score: 66.7,
    coverage_percentage: 100,
    dominant_terrain: 'Piroclastos y colada basáltica en bloque',
    sources: ['USGS 3DEP', 'NASA Apollo Archives'],
    status: 'validated',
    rank: 2,
    pairing: 'Marius Hills Cones / Gruithuisen Domes (Moon)'
  },
  {
    id: 'US_HAWAII_MAUNA_KEA',
    name: 'Mauna Kea Summit & Tephra Cones',
    target_body: 'Moon',
    coordinates: { latitude: 19.8200, longitude: -155.4680, label: '19.8200° N, 155.4680° W' },
    region: 'Hawái',
    country: 'EE.UU.',
    geological_features: ['Conos de ceniza a 4.200 m', 'Tephra criogénica inalterada', 'Permafrost de gran altitud'],
    scientific_justification: 'Conos de ceniza y tephra basáltica hawaiítica a 4.200 m expuestos a meteorización mecánica criogénica.',
    similarity_score: 64.6,
    coverage_percentage: 100,
    dominant_terrain: 'Piroclastos vítreos y regolito basáltico',
    sources: ['USGS 3DEP', 'NASA Lunar Science'],
    status: 'validated',
    rank: 3,
    pairing: 'Lunar Highlands & Pyroclastic Glass Deposits (Moon)'
  },
  {
    id: 'ES_LANZAROTE_CALDERA_BLANCA',
    name: 'Cráter de Caldera Blanca',
    target_body: 'Moon',
    coordinates: { latitude: 29.0380, longitude: -13.7190, label: '29.0380° N, 13.7190° W' },
    region: 'Lanzarote, Islas Canarias',
    country: 'España',
    geological_features: ['Cráter freatomagmático 1.2 km', 'Anillo de toba', 'Mar de lavas Timanfaya'],
    scientific_justification: 'Geometría de borde empinado y fondo plano análoga a cráteres de impacto de transición simple-complejo en la Luna.',
    similarity_score: 62.8,
    coverage_percentage: 100,
    dominant_terrain: 'Tobas volcánicas y malpaís basáltico',
    sources: ['IGN PNOA-LiDAR', 'IGME', 'ESA PANGAEA'],
    status: 'validated',
    rank: 4,
    pairing: 'Lunar Mare Basalt & Lava Tube Pit Crater (Marius Hills)'
  },
  {
    id: 'US_LAVA_BEDS_VALENTINE',
    name: 'Lava Beds National Monument (Valentine Cave)',
    target_body: 'Moon',
    coordinates: { latitude: 41.7120, longitude: -121.5090, label: '41.7120° N, 121.5090° W' },
    region: 'California',
    country: 'EE.UU.',
    geological_features: ['Red densa de tubos de lava', 'Claraboyas de colapso', 'Banqueta de flujo de lava'],
    scientific_justification: 'Red de tubos de lava basáltica bien preservados con claraboyas y conductos intactos para hábitats subterráneos.',
    similarity_score: 61.5,
    coverage_percentage: 100,
    dominant_terrain: 'Tubos de lava basálticos y malpaís',
    sources: ['USGS 3DEP', 'NASA SSERVI'],
    status: 'validated',
    rank: 5,
    pairing: 'Oceanus Procellarum / Marius Hills Pit (Moon)'
  },
  {
    id: 'IN_LONAR_CRATER',
    name: 'Cráter Lonar (Maharashtra, India)',
    target_body: 'Moon',
    coordinates: { latitude: 19.9760, longitude: 76.5070, label: '19.9760° N, 76.5070° E' },
    region: 'Maharashtra',
    country: 'India',
    geological_features: ['Cráter de impacto en basalto 1.8 km', 'Maskelynite de choque', 'Brechas de eyección'],
    scientific_justification: 'Uno de los únicos cuatro cráteres de impacto hiperveloz en basalto de la Tierra, réplica de impactos en los mares lunares.',
    similarity_score: 59.1,
    coverage_percentage: 100,
    dominant_terrain: 'Brechas de impacto en manto basáltico',
    sources: ['ISRO', 'USGS Astrogeology', 'GSI'],
    status: 'validated',
    rank: 6,
    pairing: 'Lunar Mare Impact Craters (Linné / Bessel)'
  },
  {
    id: 'ES_LANZAROTE_CORONA',
    name: 'Tubo Volcánico del Volcán de la Corona',
    target_body: 'Moon',
    coordinates: { latitude: 29.1480, longitude: -13.4500, label: '29.1480° N, 13.4500° W' },
    region: 'Lanzarote, Islas Canarias',
    country: 'España',
    geological_features: ['Tubo volcánico de 7.6 km', 'Jameos del Agua / Cueva de los Verdes', 'Túnel de la Atlántida'],
    scientific_justification: 'Tubo volcánico basáltico con claraboyas de colapso vertical y amortiguación térmica interior de ~18°C.',
    similarity_score: 58.5,
    coverage_percentage: 100,
    dominant_terrain: 'Basalto toleítico y tubos de lava',
    sources: ['IGN PNOA-LiDAR', 'ESA PANGAEA', 'IGME'],
    status: 'validated',
    rank: 7,
    pairing: 'Marius Hills Pit / Rima Galilaei (Moon)'
  },
  {
    id: 'US_ARIZONA_METEOR_CRATER',
    name: 'Barringer Meteor Crater',
    target_body: 'Moon',
    coordinates: { latitude: 35.0275, longitude: -111.0225, label: '35.0275° N, 111.0225° W' },
    region: 'Arizona',
    country: 'EE.UU.',
    geological_features: ['Cráter de impacto 1.2 km', 'Borde levantado invertido', 'Brechas polimícticas'],
    scientific_justification: 'Cráter de impacto simple por hipervelocidad mejor preservado de la Tierra, campo de entrenamiento de Apolo.',
    similarity_score: 49.2,
    coverage_percentage: 100,
    dominant_terrain: 'Brechas de impacto y estratigrafía invertida',
    sources: ['USGS Astrogeology', 'NASA Apollo Training'],
    status: 'validated',
    rank: 8,
    pairing: 'Linné Crater / Cone Crater, Fra Mauro (Moon)'
  },
  {
    id: 'CA_SUDBURY_BASIN',
    name: 'Estructura de Impacto de Sudbury',
    target_body: 'Moon',
    coordinates: { latitude: 46.6000, longitude: -81.1800, label: '46.6000° N, 81.1800° W' },
    region: 'Ontario',
    country: 'Canadá',
    geological_features: ['Lámina de fundido de impacto', 'Shatter cones', 'Brechas de la Formación Onaping'],
    scientific_justification: 'Estructura de impacto gigante de 200 km análoga a las mega-cuencas lunares como South Pole-Aitken.',
    similarity_score: 46.9,
    coverage_percentage: 100,
    dominant_terrain: 'Brechas de impacto y láminas de fundido',
    sources: ['CSA', 'NASA Lunar Science Institute'],
    status: 'validated',
    rank: 9,
    pairing: 'South Pole-Aitken Basin / Lunar Impact Melt Sheets'
  },
  {
    id: 'IS_ASKJA_HOLUHRAUN',
    name: 'Caldera de Askja & Campo de Lava Holuhraun',
    target_body: 'Moon',
    coordinates: { latitude: 64.8500, longitude: -16.8300, label: '64.8500° N, 16.8300° W' },
    region: 'Tierras Altas de Islandia',
    country: 'Islandia',
    geological_features: ['Desierto de arena basáltica negra', 'Coladas fisurales recientes', 'Caldera volcánica multianillo'],
    scientific_justification: 'Llanuras de lava basáltica toleítica sin vegetación con superficies pahoehoe y aa análogas a los mares lunares.',
    similarity_score: 45.8,
    coverage_percentage: 100,
    dominant_terrain: 'Arena basáltica negra y coladas de lava',
    sources: ['ESA Lunar Analogues', 'NASA Apollo Field Training'],
    status: 'validated',
    rank: 10,
    pairing: 'Mare Imbrium / Oceanus Procellarum basalt plains'
  },

  // =========================================================================
  // 10 ANÁLOGOS MARCIANOS (MARS)
  // =========================================================================
  {
    id: 'IS_KRAFLA_COLD',
    name: 'Caldera de Krafla & Campos Solfatáricos de Námafjall',
    target_body: 'Mars',
    coordinates: { latitude: 65.7170, longitude: -16.7550, label: '65.7170° N, 16.7550° W' },
    region: 'Tierras Altas de Islandia',
    country: 'Islandia',
    geological_features: ['Interacción hidrotermal activa', 'Fumarolas de azufre y lodos', 'Basaltos oxidados'],
    scientific_justification: 'Interacción hidrotermal entre fluidos ácidos y basalto en condiciones subárticas, idéntica a paleosistemas de Marte.',
    similarity_score: 66.7,
    coverage_percentage: 100,
    dominant_terrain: 'Solfataras, lodos hirvientes y basalto',
    sources: ['ESA Planetary Analogues', 'Copernicus Sentinel'],
    status: 'candidate',
    rank: 1,
    pairing: 'Nili Fossae / Gusev Crater Hydrothermal Fields (Mars)'
  },
  {
    id: 'US_DEATH_VALLEY',
    name: 'Valle de la Muerte & Badwater Basin',
    target_body: 'Mars',
    coordinates: { latitude: 36.2460, longitude: -116.8250, label: '36.2460° N, 116.8250° W' },
    region: 'California',
    country: 'EE.UU.',
    geological_features: ['Depresión hiperárida', 'Playas salinas y polígonos de desecación', 'Ventifactos eólicos'],
    scientific_justification: 'Depresión hiperárida con evaporitas masivas (halita, yeso, sulfatos) y mega-polígonos idénticos a cuencas marcianas.',
    similarity_score: 63.9,
    coverage_percentage: 100,
    dominant_terrain: 'Costras salinas poligonales y arena árida',
    sources: ['USGS 3DEP', 'NASA MSL Science Team'],
    status: 'validated',
    rank: 2,
    pairing: 'Gale Crater / Meridiani Planum Playa Deposits (Mars)'
  },
  {
    id: 'AZ_GOBUSTAN_MUD_VOLCANO',
    name: 'Volcanes de Lodo de Gobustán',
    target_body: 'Mars',
    coordinates: { latitude: 39.9980, longitude: 49.4050, label: '39.9980° N, 49.4050° E' },
    region: 'Bakú',
    country: 'Azerbaiyán',
    geological_features: ['Volcanes de lodo activos', 'Emanación de metano y CO2', 'Conos de brecha sedimentaria'],
    scientific_justification: 'Mayor concentración mundial de volcanes de lodo, análogo clave para emisiones de metano y sedimentos en Acidalia Planitia.',
    similarity_score: 61.7,
    coverage_percentage: 100,
    dominant_terrain: 'Conos de lodo y arcillas sedimentarias',
    sources: ['ESA ExoMars Working Group', 'NASA Mars Analog Studies'],
    status: 'candidate',
    rank: 3,
    pairing: 'Acidalia Planitia / Chryse Planitia Mud Volcanoes (Mars)'
  },
  {
    id: 'AR_PUNA_ATACAMA',
    name: 'Puna de Atacama & Salar de Antofalla',
    target_body: 'Mars',
    coordinates: { latitude: -25.6800, longitude: -67.8200, label: '25.6800° S, 67.8200° W' },
    region: 'Catamarca',
    country: 'Argentina',
    geological_features: ['Cuenca evaporítica a 3.920 m', 'Estromatolitos de condiciones extremas', 'Radiación UV extrema'],
    scientific_justification: 'Cuenca evaporítica endorreica a 3.920 m con evaporitas de sulfatos y tapices microbianos en radiación UV marciana.',
    similarity_score: 61.5,
    coverage_percentage: 100,
    dominant_terrain: 'Costras de sal, yeso y arena volcánica',
    sources: ['NASA Astrobiology', 'CONICET'],
    status: 'candidate',
    rank: 4,
    pairing: 'Terra Sirenum / Columbus Crater Evaporites (Mars)'
  },
  {
    id: 'CA_DEVON_HAUGHTON',
    name: 'Cráter Haughton (Isla Devon)',
    target_body: 'Mars',
    coordinates: { latitude: 75.3670, longitude: -89.6830, label: '75.3670° N, 89.6830° W' },
    region: 'Nunavut',
    country: 'Canadá',
    geological_features: ['Cráter de impacto 23 km', 'Desierto polar de permafrost', 'Valles en U secos'],
    scientific_justification: 'Base del Haughton-Mars Project de la NASA; desierto frío con procesos periglaciares e impacto en roca con hielo.',
    similarity_score: 59.6,
    coverage_percentage: 100,
    dominant_terrain: 'Permafrost pedregoso y brechas dolomíticas',
    sources: ['NASA Haughton-Mars Project', 'Mars Institute'],
    status: 'validated',
    rank: 5,
    pairing: 'Noctis Labyrinthus / Argyre Impact Crater (Mars)'
  },
  {
    id: 'ES_RIO_TINTO',
    name: 'Cuenca Minera de Río Tinto',
    target_body: 'Mars',
    coordinates: { latitude: 37.6970, longitude: -6.5560, label: '37.6970° N, 6.5560° W' },
    region: 'Huelva, Andalucía',
    country: 'España',
    geological_features: ['Aguas ácidas ricas en sulfatos férricos (pH ~2.2)', 'Jarosita y goethita masiva', 'Gossan'],
    scientific_justification: 'Mayor análogo geoquímico y mineralógico de los sulfatos de hierro y jarosita descubiertos por el rover Opportunity.',
    similarity_score: 56.0,
    coverage_percentage: 100,
    dominant_terrain: 'Gossan de sulfuros masivos y jarosita',
    sources: ['CAB (CSIC-INTA)', 'NASA MARTE Project', 'ESA'],
    status: 'validated',
    rank: 6,
    pairing: 'Meridiani Planum / Mawrth Vallis Sulfate Deposits (Mars)'
  },
  {
    id: 'JO_WADI_RUM',
    name: 'Wadi Rum (Valle de la Luna)',
    target_body: 'Mars',
    coordinates: { latitude: 29.5730, longitude: 35.4200, label: '29.5730° N, 35.4200° E' },
    region: 'Áqaba',
    country: 'Jordania',
    geological_features: ['Paredes de areniscas paleozoicas', 'Cañones estrechos (siqs)', 'Dunas de arena roja'],
    scientific_justification: 'Paredes escarpadas de areniscas rojizas ricas en hierro que replican la erosión eólica de Valles Marineris.',
    similarity_score: 49.4,
    coverage_percentage: 100,
    dominant_terrain: 'Arenisca roja masiva y dunas eólicas',
    sources: ['ESA Mars Analogs', 'Jordanian Geoparks'],
    status: 'candidate',
    rank: 7,
    pairing: 'Valles Marineris / Candor Chasma wall scarps (Mars)'
  },
  {
    id: 'MX_CUATRO_CIENEGAS_GYPSUM',
    name: 'Dunas de Yeso de Cuatro Ciénegas',
    target_body: 'Mars',
    coordinates: { latitude: 26.8520, longitude: -102.1550, label: '26.8520° N, 102.1550° W' },
    region: 'Coahuila',
    country: 'México',
    geological_features: ['Campo de dunas de yeso blanco', 'Pozas termales oligotróficas', 'Costras de sulfato cálcico'],
    scientific_justification: 'Extenso campo de dunas eólicas compuestas de yeso puro hidro-evaporítico, análogo del polo norte marciano.',
    similarity_score: 48.8,
    coverage_percentage: 100,
    dominant_terrain: 'Dunas de yeso puro y evaporitas',
    sources: ['NASA Astrobiology Institute', 'UNAM'],
    status: 'candidate',
    rank: 8,
    pairing: 'Olympia Undae / Planum Boreum Gypsum Dunes (Mars)'
  },
  {
    id: 'CL_ATACAMA_YUNGAY',
    name: 'Desierto de Atacama (Yungay)',
    target_body: 'Mars',
    coordinates: { latitude: -24.0850, longitude: -69.9670, label: '24.0850° S, 69.9670° W' },
    region: 'Antofagasta',
    country: 'Chile',
    geological_features: ['Suelos hiperáridos con percloratos', 'Halitas higroscópicas', 'Ausencia de humedad superficial'],
    scientific_justification: 'Punto más seco y estéril de la Tierra no polar; límite extremo de desecación con percloratos en suelo.',
    similarity_score: 47.7,
    coverage_percentage: 100,
    dominant_terrain: 'Costras salinas, arcillas y polvo seco',
    sources: ['NASA Astrobiology Institute', 'SETI', 'Universidad de Chile'],
    status: 'candidate',
    rank: 9,
    pairing: 'Utopia Planitia / Gale Crater Hyperarid Regolith (Mars)'
  },
  {
    id: 'AQ_MCMURDO_DRY_VALLEYS',
    name: 'Valles Secos de McMurdo (Taylor Valley)',
    target_body: 'Mars',
    coordinates: { latitude: -77.5300, longitude: 161.7000, label: '77.5300° S, 161.7000° E' },
    region: 'Tierra de Victoria',
    country: 'Antártida',
    geological_features: ['Desierto polar frío hiperárido', 'Permafrost seco sin hielo activo', 'Ventifactos y ventiscas catabáticas'],
    scientific_justification: 'El desierto más frío y seco de la Tierra, réplica del regolito marciano sometido a vientos catabáticos helados.',
    similarity_score: 38.1,
    coverage_percentage: 100,
    dominant_terrain: 'Permafrost seco, cantos rodados y arena',
    sources: ['NSF USAP', 'NASA Astrobiology Institute'],
    status: 'validated',
    rank: 10,
    pairing: 'Mars Polar Layered Deposits & Phoenix Landing Site'
  }
];

export function getCandidatesForBody(targetBody: 'Moon' | 'Mars'): AnalogSite[] {
  return ANALOG_DATABASE.filter(s => s.target_body === targetBody);
}

export function getAnalogById(id: string): AnalogSite | undefined {
  return ANALOG_DATABASE.find(s => s.id === id || s.id.toLowerCase() === id.toLowerCase());
}

/**
 * Métricas científicas para Luna y Marte (mostradas en las tarjetas laterales)
 */
export const PLANET_METRICS: Record<'Moon' | 'Mars', PlanetMetrics> = {
  Moon: {
    name: 'Moon',
    subtitle: "Earth's natural satellite",
    radius_km: 1737,
    surface_area_mkm2: 37.9,
    gravity_g: 0.165,
    gravity_percentage_earth: 16.5,
    avg_temp_range: '-173 to 127 °C',
    dominant_terrain: 'Craters, regolith, highlands',
    overview_text: 'El satélite natural de la Tierra posee una corteza rica en anortosita y grandes mares basálticos producto de impactos masivos en su historia temprana.',
    terrain_text: 'Topografía dominada por cráteres de impacto de todos los tamaños, cuencas multianillo y colinas onduladas cubiertas de regolito finamente pulverizado.',
    geology_text: 'Geología sin tectónica de placas activa ni atmósfera; preservación de fósiles geológicos de los primeros 1.000 millones de años del sistema solar.',
    data_text: 'Misiones clave: Apollo, Lunar Reconnaissance Orbiter (LRO), Chandrayaan, Chang’e y programa Artemis.'
  },
  Mars: {
    name: 'Mars',
    subtitle: 'The Red Planet',
    radius_km: 3390,
    surface_area_mkm2: 144.8,
    gravity_g: 0.38,
    gravity_percentage_earth: 38.0,
    avg_temp_range: '-125 to 20 °C',
    dominant_terrain: 'Valles, craters, volcanoes',
    overview_text: 'El cuarto planeta del sistema solar cuenta con una delgada atmósfera de CO2, casquetes polares de hielo de agua y dióxido de carbono y gigantescos cañones tectónicos.',
    terrain_text: 'Hogar del Monte Olimpo (el mayor volcán del sistema solar, 22 km de altura) y Valles Marineris (un sistema de cañones de 4.000 km de longitud).',
    geology_text: 'Evidencia geológica inequívoca de paleolagos, deltas fluviales y paleoclimas húmedos en los periodos Noeico y Hespérico.',
    data_text: 'Misiones clave: Viking, Mars Global Surveyor, MRO, Curiosity, Perseverance, Hope y Tianwen-1.'
  }
};

/**
 * Generador de coordenadas aleatorias realistas en la Tierra para análogos planetarios.
 * Puede generar una variación alrededor de un análogo conocido o generar un punto aleatorio en tierra firme.
 */
export function generateRandomAnalogCoordinates(targetBody: 'Moon' | 'Mars'): {
  site: AnalogSite;
  coordinates: { latitude: number; longitude: number };
  isGenerated: boolean;
} {
  // Filtramos los análogos del catálogo para este cuerpo celeste
  const candidates = ANALOG_DATABASE.filter(s => s.target_body === targetBody);
  const baseSite = candidates[Math.floor(Math.random() * candidates.length)];

  // Añadimos una variación aleatoria calculada en el código (±2.5 grados de dispersión geográfica)
  const latDelta = (Math.random() - 0.5) * 5.0;
  const lonDelta = (Math.random() - 0.5) * 5.0;

  const newLat = Number((baseSite.coordinates.latitude + latDelta).toFixed(4));
  const newLon = Number((baseSite.coordinates.longitude + lonDelta).toFixed(4));

  // Formato N/S, E/W
  const latDir = newLat >= 0 ? 'N' : 'S';
  const lonDir = newLon >= 0 ? 'E' : 'W';
  const label = `${Math.abs(newLat).toFixed(4)}° ${latDir}, ${Math.abs(newLon).toFixed(4)}° ${lonDir}`;

  const randomizedSite: AnalogSite = {
    ...baseSite,
    id: `generated-${targetBody.toLowerCase()}-${Date.now()}`,
    name: `${baseSite.name} (Sector ${Math.floor(Math.random() * 90 + 10)})`,
    coordinates: {
      latitude: newLat,
      longitude: newLon,
      label
    },
    similarity_score: Number((baseSite.similarity_score + (Math.random() * 4 - 2)).toFixed(1)),
    coverage_percentage: Number((baseSite.coverage_percentage + (Math.random() * 6 - 3)).toFixed(0)),
    status: 'candidate'
  };

  return {
    site: randomizedSite,
    coordinates: { latitude: newLat, longitude: newLon },
    isGenerated: true
  };
}

