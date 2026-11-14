import { describe, it, expect } from 'vitest';
import {
  NASA_TREK_LAYERS,
  VERIFIED_PLANETARY_POIS,
  PLANETARY_DETAILS,
  formatPlanetaryCoordinates,
  buildNasaTrekTileUrl
} from '../src/nasa/trekProviders';

describe('Capas Oficiales NASA Trek WMTS', () => {
  it('Debe incluir las capas candidatas verificadas de Marte (Viking y MOLA)', () => {
    const surface = NASA_TREK_LAYERS.mars_surface;
    expect(surface.body).toBe('Mars');
    expect(surface.layerName).toBe('Mars_Viking_MDIM21_ClrMosaic_global_232m');
    expect(surface.format).toBe('jpg');
    expect(surface.maxZoom).toBe(7);

    const topo = NASA_TREK_LAYERS.mars_topography;
    expect(topo.body).toBe('Mars');
    expect(topo.layerName).toBe('Mars_MGS_MOLA_ClrShade_merge_global_463m');
    expect(topo.format).toBe('jpg');
    expect(topo.maxZoom).toBe(7);
  });

  it('Debe incluir las capas candidatas verificadas de la Luna (LRO WAC y LOLA)', () => {
    const surface = NASA_TREK_LAYERS.moon_surface;
    expect(surface.body).toBe('Moon');
    expect(surface.layerName).toBe('LRO_WAC_Mosaic_Global_303ppd_v02');
    expect(surface.format).toBe('jpg');
    expect(surface.maxZoom).toBe(8);

    const topo = NASA_TREK_LAYERS.moon_topography;
    expect(topo.body).toBe('Moon');
    expect(topo.layerName).toBe('LRO_LOLA_ClrShade_Global_128ppd_v04');
    expect(topo.format).toBe('png');
    expect(topo.maxZoom).toBe(5);
  });

  it('Debe construir URLs válidas de teselas para NASA Mars Trek y Moon Trek', () => {
    const marsTileUrl = buildNasaTrekTileUrl(
      'Mars',
      NASA_TREK_LAYERS.mars_surface.layerName,
      0,
      0,
      0,
      'jpg'
    );
    expect(marsTileUrl).toBe('https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/0/0/0.jpg');

    const moonTileUrl = buildNasaTrekTileUrl(
      'Moon',
      NASA_TREK_LAYERS.moon_surface.layerName,
      1,
      0,
      1,
      'jpg'
    );
    expect(moonTileUrl).toBe('https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/1/0/1.jpg');

    const moonTopoUrl = buildNasaTrekTileUrl(
      'Moon',
      NASA_TREK_LAYERS.moon_topography.layerName,
      2,
      1,
      2,
      'png'
    );
    expect(moonTopoUrl).toBe('https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_ClrShade_Global_128ppd_v04/1.0.0/default/default028mm/2/1/2.png');
  });
});

describe('Puntos de Interés Planetarios Verificados (NASA/IAU)', () => {
  it('Debe contener los accidentes geográficos clave de Marte con coordenadas verificadas', () => {
    const marsPOIs = VERIFIED_PLANETARY_POIS.Mars;
    expect(marsPOIs.length).toBeGreaterThanOrEqual(5);

    const olympus = marsPOIs.find(p => p.id === 'mars_olympus_mons');
    expect(olympus).toBeDefined();
    expect(olympus!.latitude).toBeCloseTo(18.65, 1);
    expect(olympus!.longitude).toBeCloseTo(-133.8, 1);
    expect(olympus!.elevation_km).toBeGreaterThan(20);

    const valles = marsPOIs.find(p => p.id === 'mars_valles_marineris');
    expect(valles).toBeDefined();
    expect(valles!.latitude).toBeCloseTo(-14.0, 1);

    const jezero = marsPOIs.find(p => p.id === 'mars_jezero_crater');
    expect(jezero).toBeDefined();
    expect(jezero!.latitude).toBeCloseTo(18.38, 1);
    expect(jezero!.longitude).toBeCloseTo(77.58, 1);
  });

  it('Debe contener los accidentes geográficos clave de la Luna con coordenadas verificadas', () => {
    const moonPOIs = VERIFIED_PLANETARY_POIS.Moon;
    expect(moonPOIs.length).toBeGreaterThanOrEqual(5);

    const tycho = moonPOIs.find(p => p.id === 'moon_tycho_crater');
    expect(tycho).toBeDefined();
    expect(tycho!.latitude).toBeCloseTo(-43.31, 1);
    expect(tycho!.longitude).toBeCloseTo(-11.36, 1);

    const copernicus = moonPOIs.find(p => p.id === 'moon_copernicus_crater');
    expect(copernicus).toBeDefined();
    expect(copernicus!.latitude).toBeCloseTo(9.62, 1);
    expect(copernicus!.longitude).toBeCloseTo(-20.08, 1);

    const tranquility = moonPOIs.find(p => p.id === 'moon_mare_tranquillitatis');
    expect(tranquility).toBeDefined();
    expect(tranquility!.latitude).toBeCloseTo(0.67, 1);
    expect(tranquility!.longitude).toBeCloseTo(23.47, 1);
  });
});

describe('Formateo de Coordenadas Planetarias y Sistemas de Referencia', () => {
  it('Debe formatear coordenadas marcianas indicando Planetocéntricas', () => {
    const formatted = formatPlanetaryCoordinates('Mars', 18.65, -133.8);
    expect(formatted).toContain('18.6500° N');
    expect(formatted).toContain('133.8000° W');
    expect(formatted).toContain('Planetocéntricas (NASA Mars Trek)');
  });

  it('Debe formatear coordenadas lunares indicando Selenográficas', () => {
    const formatted = formatPlanetaryCoordinates('Moon', -43.31, 11.36);
    expect(formatted).toContain('43.3100° S');
    expect(formatted).toContain('11.3600° E');
    expect(formatted).toContain('Selenográficas (NASA Moon Trek)');
  });

  it('Debe formatear coordenadas terrestres con WGS84', () => {
    const formatted = formatPlanetaryCoordinates('Earth', 28.1234, -15.4321);
    expect(formatted).toContain('28.1234° N');
    expect(formatted).toContain('15.4321° W');
    expect(formatted).toContain('WGS84');
  });

  it('Debe tener las configuraciones físicas astronómicas exactas para cada planeta', () => {
    expect(PLANETARY_DETAILS.Earth.radiusKm).toBe(6371);
    expect(PLANETARY_DETAILS.Mars.radiusKm).toBe(3389.5);
    expect(PLANETARY_DETAILS.Moon.radiusKm).toBe(1737.4);
    expect(PLANETARY_DETAILS.Earth.coordSystem).toContain('WGS84');
    expect(PLANETARY_DETAILS.Mars.coordSystem).toContain('Planetocéntricas');
    expect(PLANETARY_DETAILS.Moon.coordSystem).toContain('Selenográficas');
  });
});
