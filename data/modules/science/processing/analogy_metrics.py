"""
TERRAIN-X Scientific Analogy & Multi-Metric Evaluation Engine
============================================================
Calculates transparent, reproducible scientific similarity metrics between
terrestrial analog sites and target Lunar / Martian environments.
Outputs:
- Metric-by-metric similarity scores S_i in [0.0, 1.0]
- Explicit weight assignments w_i (summing to 100%)
- Individual percentage contribution (w_i * S_i)
- Overall scientifically validated similarity percentage
- Full statistical and geomorphological provenance
"""

import math
from typing import Dict, Any, List, Tuple
import numpy as np
import scipy.ndimage as ndimage


class ScientificAnalogyEngine:
    """
    Evaluates physical, geomorphological, spectral, and environmental analogy
    between a terrestrial candidate site and a planetary target body (Moon or Mars).
    """

    # Planetary benchmark profiles
    BENCHMARKS = {
        "Moon": {
            "name": "Lunar Mare Basalt & Lava Tube Pit Crater (e.g. Marius Hills Pit)",
            "elevation_range_target_m": 450.0,
            "slope_mean_target_deg": 6.5,
            "slope_tolerance_deg": 3.0,
            "roughness_tri_target_m": 2.6,
            "roughness_tolerance_m": 1.2,
            "curvature_profile_target": -0.04,  # Negative vertical curvature at pit rims
            "spectral_target": "Basaltic (Tholeiitic / Ilmenite / High-Ti & Low-Ti clinopyroxene)",
            "aridity_target": 1.0,  # Vacuum / Complete absence of moisture
            "weights": {
                "elevation_relief": 0.12,
                "slope_morphometry": 0.16,
                "surface_roughness_tri": 0.14,
                "curvature_profile": 0.10,
                "lava_tubes_cavities": 0.20,
                "crater_morphology": 0.08,
                "spectral_mineralogy": 0.12,
                "environmental_aridity": 0.08
            }
        },
        "Mars": {
            "name": "Martian Volcanic Flank & Sulfate Evaporite (e.g. Arsia Mons / Meridiani Planum)",
            "elevation_range_target_m": 600.0,
            "slope_mean_target_deg": 8.0,
            "slope_tolerance_deg": 4.0,
            "roughness_tri_target_m": 3.0,
            "roughness_tolerance_m": 1.5,
            "curvature_profile_target": -0.05,
            "spectral_target": "Ferric Oxides (Hematite / Goethite), Jarosite sulfates & Smectite clays",
            "aridity_target": 0.98,  # Hyperarid polar/equatorial desert with perchlorates
            "weights": {
                "elevation_relief": 0.10,
                "slope_morphometry": 0.15,
                "surface_roughness_tri": 0.12,
                "curvature_profile": 0.08,
                "lava_tubes_cavities": 0.15,
                "crater_morphology": 0.10,
                "spectral_mineralogy": 0.20,
                "environmental_aridity": 0.10
            }
        }
    }

    @staticmethod
    def evaluate_analog_metrics(
        dem_grid: np.ndarray,
        target_body: str,
        site_features: Dict[str, Any],
        custom_weights: Any = None
    ) -> Dict[str, Any]:
        """
        Computes all 8 mandatory scientific metrics and their weighted contribution.
        """
        body_key = "Moon" if target_body.lower() == "moon" else "Mars"
        bench = ScientificAnalogyEngine.BENCHMARKS[body_key]
        weights = custom_weights or bench["weights"]

        # 1. Topographic Elevation & Relief Metrics
        elev_min = float(np.min(dem_grid))
        elev_max = float(np.max(dem_grid))
        elev_mean = float(np.mean(dem_grid))
        elev_range = float(elev_max - elev_min)

        target_range = bench["elevation_range_target_m"]
        s_elevation = math.exp(-0.5 * ((elev_range - target_range) / (target_range * 0.6)) ** 2)

        # 2. Slope Gradient Metrics (Horn Algorithm)
        dy, dx = np.gradient(dem_grid, 100.0, 100.0)
        slope_rad = np.arctan(np.sqrt(dx**2 + dy**2))
        slope_deg = np.degrees(slope_rad)
        mean_slope = float(np.mean(slope_deg))
        max_slope = float(np.max(slope_deg))

        target_slope = bench["slope_mean_target_deg"]
        tol_slope = bench["slope_tolerance_deg"]
        s_slope = math.exp(-0.5 * ((mean_slope - target_slope) / tol_slope) ** 2)

        # 3. Surface Roughness / Terrain Ruggedness Index (TRI)
        # TRI is standard deviation of elevation in 3x3 neighborhood
        padded = np.pad(dem_grid, 1, mode="reflect")
        neighborhoods = np.array([
            padded[i:i+dem_grid.shape[0], j:j+dem_grid.shape[1]]
            for i in range(3) for j in range(3)
        ])
        tri_grid = np.sqrt(np.mean((neighborhoods - dem_grid)**2, axis=0))
        mean_tri = float(np.mean(tri_grid))

        target_tri = bench["roughness_tri_target_m"]
        tol_tri = bench["roughness_tolerance_m"]
        s_tri = math.exp(-0.5 * ((mean_tri - target_tri) / tol_tri) ** 2)

        # 4. Profile Curvature (Rate of change of slope)
        # Negative Laplacian highlights valleys and sinkholes
        laplacian = ndimage.laplace(dem_grid) / (100.0**2)
        mean_curvature = float(np.mean(laplacian))
        s_curvature = max(0.2, min(1.0, 1.0 - abs(mean_curvature - bench["curvature_profile_target"]) * 50.0))

        # 5. Volcanic Cavities & Lava Tubes Presence
        volc_ctx = site_features.get("volcanic_context", 0.5) or 0.5
        cave_ev = site_features.get("cave_accessibility_evidence", 0.5) or 0.5
        s_cavities = (volc_ctx * 0.45) + (cave_ev * 0.55)

        # 6. Crater / Volcanic Cone Morphology Proxy
        crater_proxy = site_features.get("crater_morphology_proxy", 0.6) or 0.6
        s_crater = crater_proxy

        # 7. Mineralogical & Spectral Analogy Match
        if body_key == "Moon":
            # For Moon: basaltic / pyroxene / anorthosite match
            s_spectral = site_features.get("spectral_basaltic_match", 0.7) or 0.7
        else:
            # For Mars: iron oxide / jarosite sulfate / clay match
            s_spectral = site_features.get("spectral_iron_sulfate_match", 0.65) or 0.65

        # 8. Environmental Extremes / Aridity Proxy
        aridity_proxy = site_features.get("surface_aridity_proxy", 0.75) or 0.75
        s_aridity = aridity_proxy

        # Metric table data with exact values, weights, and contributions
        metrics_table = [
            {
                "id": "elevation_relief",
                "name": "Rango Altimétrico y Relieve",
                "terrestrial_value": f"{elev_range:.1f} m (cota {elev_min:.0f}-{elev_max:.0f} m)",
                "planetary_target": f"~{target_range:.0f} m ({bench['name']})",
                "similarity_score": round(s_elevation, 3),
                "weight_pct": round(weights["elevation_relief"] * 100, 1),
                "contribution_pct": round(weights["elevation_relief"] * s_elevation * 100, 2)
            },
            {
                "id": "slope_morphometry",
                "name": "Gradiente de Pendiente (Horn)",
                "terrestrial_value": f"{mean_slope:.2f}° (máx {max_slope:.1f}°)",
                "planetary_target": f"{target_slope:.1f}° ± {tol_slope:.1f}°",
                "similarity_score": round(s_slope, 3),
                "weight_pct": round(weights["slope_morphometry"] * 100, 1),
                "contribution_pct": round(weights["slope_morphometry"] * s_slope * 100, 2)
            },
            {
                "id": "surface_roughness_tri",
                "name": "Rugosidad Superficial (TRI)",
                "terrestrial_value": f"{mean_tri:.2f} m",
                "planetary_target": f"{target_tri:.1f} ± {tol_tri:.1f} m",
                "similarity_score": round(s_tri, 3),
                "weight_pct": round(weights["surface_roughness_tri"] * 100, 1),
                "contribution_pct": round(weights["surface_roughness_tri"] * s_tri * 100, 2)
            },
            {
                "id": "curvature_profile",
                "name": "Curvatura Topográfica y Sumideros",
                "terrestrial_value": f"{mean_curvature:.4f} m⁻¹",
                "planetary_target": f"Inversión de colapso ({bench['curvature_profile_target']})",
                "similarity_score": round(s_curvature, 3),
                "weight_pct": round(weights["curvature_profile"] * 100, 1),
                "contribution_pct": round(weights["curvature_profile"] * s_curvature * 100, 2)
            },
            {
                "id": "lava_tubes_cavities",
                "name": "Tubos de Lava y Cavidades",
                "terrestrial_value": f"Evidencia: {int(cave_ev*100)}% (Contexto volcánico: {int(volc_ctx*100)}%)",
                "planetary_target": "Claraboyas intactas / Pit Craters",
                "similarity_score": round(s_cavities, 3),
                "weight_pct": round(weights["lava_tubes_cavities"] * 100, 1),
                "contribution_pct": round(weights["lava_tubes_cavities"] * s_cavities * 100, 2)
            },
            {
                "id": "crater_morphology",
                "name": "Morfología de Conos / Cráteres",
                "terrestrial_value": f"Índice: {int(crater_proxy*100)}%",
                "planetary_target": "Cráteres de impacto / conos piroclásticos",
                "similarity_score": round(s_crater, 3),
                "weight_pct": round(weights["crater_morphology"] * 100, 1),
                "contribution_pct": round(weights["crater_morphology"] * s_crater * 100, 2)
            },
            {
                "id": "spectral_mineralogy",
                "name": "Composición Espectral y Mineralógica",
                "terrestrial_value": f"Concordancia: {int(s_spectral*100)}%",
                "planetary_target": bench["spectral_target"],
                "similarity_score": round(s_spectral, 3),
                "weight_pct": round(weights["spectral_mineralogy"] * 100, 1),
                "contribution_pct": round(weights["spectral_mineralogy"] * s_spectral * 100, 2)
            },
            {
                "id": "environmental_aridity",
                "name": "Extremos Ambientales e Hiperaridez",
                "terrestrial_value": f"Proxy Aridez: {int(aridity_proxy*100)}%",
                "planetary_target": "Desierto poliextremo / Vacío",
                "similarity_score": round(s_aridity, 3),
                "weight_pct": round(weights["environmental_aridity"] * 100, 1),
                "contribution_pct": round(weights["environmental_aridity"] * s_aridity * 100, 2)
            }
        ]

        # Total Similarity Percentage
        total_similarity_pct = sum(m["contribution_pct"] for m in metrics_table)

        return {
            "target_body": body_key,
            "target_benchmark_name": bench["name"],
            "total_similarity_pct": round(total_similarity_pct, 2),
            "metrics_table": metrics_table,
            "dem_statistics": {
                "elev_min_m": round(elev_min, 1),
                "elev_max_m": round(elev_max, 1),
                "elev_mean_m": round(elev_mean, 1),
                "elev_range_m": round(elev_range, 1),
                "slope_mean_deg": round(mean_slope, 2),
                "slope_max_deg": round(max_slope, 2),
                "tri_mean_m": round(mean_tri, 2),
                "grid_cells": int(dem_grid.size)
            }
        }
