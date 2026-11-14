/**
 * TERRAIN-X: Contratos y tipos para la interfaz de visualización planetaria
 * Versión de contrato 1.0 (NASA Space Apps 2026)
 */

export type CelestialBody = 'Moon' | 'Earth' | 'Mars';

export interface GeoCoordinates {
  latitude: number;   // -90 a +90
  longitude: number;  // -180 a +180
  altitude_m?: number;
  label?: string;
}

export interface AnalogSite {
  id: string;
  name: string;
  target_body: 'Moon' | 'Mars';
  coordinates: GeoCoordinates;
  region: string;
  country: string;
  geological_features: string[];
  scientific_justification: string;
  similarity_score: number; // 0 - 100%
  coverage_percentage: number;
  surface_area_km2?: number;
  avg_temp_c?: string;
  dominant_terrain?: string;
  gravity_ratio?: number;
  sources: string[];
  status: 'validated' | 'candidate' | 'local_only';
}

export interface PlanetMetrics {
  name: string;
  subtitle: string;
  radius_km: number;
  surface_area_mkm2: number;
  gravity_g: number;
  gravity_percentage_earth: number;
  avg_temp_range: string;
  dominant_terrain: string;
  overview_text: string;
  terrain_text: string;
  geology_text: string;
  data_text: string;
}

export interface CavityCandidate {
  id: string;
  type: string;
  latitude: number;
  longitude: number;
  elevation_m: number;
  estimated_depth_m: number;
  rim_slope_deg: number;
  confidence_score: number;
}

export interface Terrain3DMetrics {
  elevation_rmse_m?: number;
  elevation_mae_m?: number;
  pearson_correlation_r?: number;
  elevation_accuracy_pct?: number;
  relief_accuracy_pct?: number;
  overall_similarity_pct?: number;
  total_pixels_evaluated?: number;
  elevation_min_m?: number;
  elevation_max_m?: number;
  mean_slope_deg?: number;
  max_slope_deg?: number;
}

export interface Terrain3DResponse {
  success: boolean;
  center: { lat: number; lon: number };
  radius_km: number;
  metrics: Terrain3DMetrics;
  cavities: CavityCandidate[];
  html_url: string;
  thematic_url: string;
}

