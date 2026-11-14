import { describe, it, expect } from 'vitest';
import * as BABYLON from 'babylonjs';
import { latLonToVector3 } from '../src/babylon/targetPin';
import { generateRandomAnalogCoordinates, ANALOG_DATABASE, PLANET_METRICS } from '../src/data/analogs';

describe('Cálculos Geográficos y de Esfera en BabylonJS', () => {
  const radius = 2.8;

  it('Debe convertir el Polo Norte (90° N, 0° E) a coordenadas 3D correctas (Y positivo)', () => {
    const v = latLonToVector3(90, 0, radius);
    expect(v.y).toBeCloseTo(radius, 2);
    expect(Math.abs(v.x)).toBeCloseTo(0, 2);
    expect(Math.abs(v.z)).toBeCloseTo(0, 2);
  });

  it('Debe convertir el Polo Sur (-90° S, 0° E) a coordenadas 3D correctas (Y negativo)', () => {
    const v = latLonToVector3(-90, 0, radius);
    expect(v.y).toBeCloseTo(-radius, 2);
    expect(Math.abs(v.x)).toBeCloseTo(0, 2);
    expect(Math.abs(v.z)).toBeCloseTo(0, 2);
  });

  it('Debe situar un punto sobre la superficie exactamente a la distancia del radio de la Tierra', () => {
    const lat = 28.1234;
    const lon = -15.4321;
    const v = latLonToVector3(lat, lon, radius);
    const computedRadius = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    expect(computedRadius).toBeCloseTo(radius, 4);
  });

  it('Debe normalizar correctamente longitudes fuera del rango [-180, 180]', () => {
    const normalizeLon = (lon: number) => ((lon + 180) % 360 + 360) % 360 - 180;
    expect(normalizeLon(15)).toBe(15);
    expect(normalizeLon(375)).toBe(15);
    expect(normalizeLon(-345)).toBe(15);
    expect(normalizeLon(-200)).toBe(160);
    expect(Math.abs(normalizeLon(540))).toBe(180);
  });

  it('Debe calcular rotaciones Euler preservando Norte-Arriba y Este-Derecha exactamente igual que el mapa 2D', () => {
    const testCases = [
      { name: 'España (Península Ibérica)', lat: 40.0, lon: -4.0 },
      { name: 'Desierto del Sahara', lat: 25.0, lon: 15.0 },
      { name: 'Nueva York', lat: 40.7, lon: -74.0 },
      { name: 'Sídney', lat: -33.8, lon: 151.2 }
    ];

    testCases.forEach(({ name, lat, lon }) => {
      const latRad = lat * (Math.PI / 180);
      const lonRad = lon * (Math.PI / 180);

      // Posición del punto en la esfera local
      const P = new BABYLON.Vector3(
        -Math.cos(latRad) * Math.cos(lonRad),
        Math.sin(latRad),
        -Math.cos(latRad) * Math.sin(lonRad)
      );

      // Vector tangente Norte (dP/dlat)
      const North = new BABYLON.Vector3(
        Math.sin(latRad) * Math.cos(lonRad),
        Math.cos(latRad),
        Math.sin(latRad) * Math.sin(lonRad)
      ).normalize();

      // Vector tangente Este (dP/dlon)
      const East = new BABYLON.Vector3(
        Math.cos(latRad) * Math.sin(lonRad),
        0,
        -Math.cos(latRad) * Math.cos(lonRad)
      ).normalize();

      // Rotación analítica: Ry luego Rx
      const ry = Math.atan2(P.x, -P.z);
      const rx = -latRad;

      const mY = BABYLON.Matrix.RotationY(ry);
      const mX = BABYLON.Matrix.RotationX(rx);
      const mTotal = mY.multiply(mX);

      const q = BABYLON.Quaternion.FromRotationMatrix(mTotal);
      const euler = q.toEulerAngles();

      // Matriz de transformación con los ángulos Euler
      const M = BABYLON.Matrix.RotationYawPitchRoll(euler.y, euler.x, euler.z);

      const pTrans = BABYLON.Vector3.TransformCoordinates(P, M);
      const northTrans = BABYLON.Vector3.TransformCoordinates(North, M);
      const eastTrans = BABYLON.Vector3.TransformCoordinates(East, M);

      // 1. El punto elegido debe mirar de frente a la cámara (Z = -1)
      expect(pTrans.x).toBeCloseTo(0, 3);
      expect(pTrans.y).toBeCloseTo(0, 3);
      expect(pTrans.z).toBeCloseTo(-1, 3);

      // 2. El Norte debe apuntar rigurosamente hacia ARRIBA (Y = +1), idéntico al mapa 2D
      expect(northTrans.x).toBeCloseTo(0, 3);
      expect(northTrans.y).toBeCloseTo(1, 3);
      expect(northTrans.z).toBeCloseTo(0, 3);

      // 3. El Este debe apuntar rigurosamente hacia la DERECHA (X = +1), idéntico al mapa 2D
      expect(eastTrans.x).toBeCloseTo(1, 3);
      expect(eastTrans.y).toBeCloseTo(0, 3);
      expect(eastTrans.z).toBeCloseTo(0, 3);
    });
  });
});

describe('Generador de Coordenadas Aleatorias de Análogos Terrestres', () => {
  it('Debe generar coordenadas válidas para análogos lunares', () => {
    const result = generateRandomAnalogCoordinates('Moon');
    expect(result.site.target_body).toBe('Moon');
    expect(result.coordinates.latitude).toBeGreaterThanOrEqual(-90);
    expect(result.coordinates.latitude).toBeLessThanOrEqual(90);
    expect(result.coordinates.longitude).toBeGreaterThanOrEqual(-180);
    expect(result.coordinates.longitude).toBeLessThanOrEqual(180);
    expect(result.site.name).toBeDefined();
    expect(result.site.similarity_score).toBeGreaterThan(0);
  });

  it('Debe generar coordenadas válidas para análogos marcianos', () => {
    const result = generateRandomAnalogCoordinates('Mars');
    expect(result.site.target_body).toBe('Mars');
    expect(result.coordinates.latitude).toBeGreaterThanOrEqual(-90);
    expect(result.coordinates.latitude).toBeLessThanOrEqual(90);
    expect(result.coordinates.longitude).toBeGreaterThanOrEqual(-180);
    expect(result.coordinates.longitude).toBeLessThanOrEqual(180);
    expect(result.site.scientific_justification).toBeDefined();
  });

  it('Debe generar variación aleatoria entre ejecuciones sucesivas', () => {
    const run1 = generateRandomAnalogCoordinates('Mars');
    const run2 = generateRandomAnalogCoordinates('Mars');
    const isDifferent = run1.coordinates.latitude !== run2.coordinates.latitude ||
                        run1.coordinates.longitude !== run2.coordinates.longitude ||
                        run1.site.id !== run2.site.id;
    expect(isDifferent).toBe(true);
  });
});

describe('Catálogo de Datos Científicos (Fidelidad NASA/ESA)', () => {
  it('Todos los sitios del catálogo deben tener fuentes contrastadas y estado válido', () => {
    expect(ANALOG_DATABASE.length).toBeGreaterThanOrEqual(6);
    ANALOG_DATABASE.forEach(site => {
      expect(site.sources.length).toBeGreaterThan(0);
      expect(['validated', 'candidate', 'local_only']).toContain(site.status);
      expect(site.similarity_score).toBeGreaterThan(30);
    });
  });

  it('Las métricas de Luna y Marte deben tener valores astronómicos reales', () => {
    expect(PLANET_METRICS.Moon.radius_km).toBe(1737);
    expect(PLANET_METRICS.Mars.radius_km).toBe(3390);
    expect(PLANET_METRICS.Moon.gravity_g).toBe(0.165);
    expect(PLANET_METRICS.Mars.gravity_g).toBe(0.38);
  });
});

