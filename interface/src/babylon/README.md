# 3D Planetary Engine (`interface/src/babylon`)

## Responsibility
The `babylon` module orchestrates all 3D WebGL rendering for planetary bodies and deep space environments using **Babylon.js**. It implements mathematically accurate coordinate conversions, dynamic PBR shading, and transition hooks into WebXR.

---

## File Breakdown

### `earthScene.ts`
- **Role**: Primary scene manager.
- **Key Logic**:
  - Initializes the WebGL canvas, ArcRotateCamera, hemispheric ambient lighting, and directional sunlight.
  - Builds the multi-layered planetary sphere:
    - Base Sphere: Diffuse, normal, and specular maps.
    - Cloud Sphere: Rotates independently at $+0.0006\text{ rad/frame}$ with alpha transparency.
    - Night Lights Layer: Shader blend revealing illumination on the dark side of the terminator line.
  - Implements latitude/longitude $\leftrightarrow$ Cartesian 3D coordinate transformations:
    $$x = R \cos(\phi) \sin(\lambda), \quad y = R \sin(\phi), \quad z = R \cos(\phi) \cos(\lambda)$$
  - Handles the seamless transition between desktop orbit mode and WebXR room-scale mode (`enterXR()`, `setupXRStage()`).

### `spaceBackground.ts`
- **Role**: Deep-space skybox and stellar ambiance.
- **Key Logic**:
  - Creates a 360° celestial sphere with nebula gradients and Milky Way textures.
  - Instantiates 3D particle systems for near-field stars, creating realistic parallax motion when the camera translates.

### `miniPlanets.ts`
- **Role**: Concentric orbital visualization.
- **Key Logic**:
  - Renders miniature 3D meshes of Moon and Mars orbiting the central Earth model on glowing elliptical trails.
  - Real-time trigonometric position updates on render ticks.

### `targetPin.ts`
- **Role**: Surface point-of-interest indicators.
- **Key Logic**:
  - Aligns holographic markers perpendicularly to the sphere's surface normal at designated GPS coordinates.
  - Features pulsating radar rings and click-to-focus camera interpolation.

### `textureGenerator.ts`
- **Role**: Procedural texture generation.
- **Key Logic**:
  - Generates heightmap color ramps and synthetic DEM canvas textures for fallback offline operations.

---

## Coding Best Practices
- **Garbage Collection Optimization**: Texture and material allocations are cached in class instances; render observables check mesh readiness before triggering draw calls.
- **Frustum Culling**: Deep space meshes have `freezeWorldMatrix()` applied where possible to eliminate unnecessary per-frame CPU matrix evaluations.
