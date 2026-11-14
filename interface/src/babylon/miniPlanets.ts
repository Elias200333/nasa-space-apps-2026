import * as BABYLON from 'babylonjs';
import { PlanetaryTextureGenerator } from './textureGenerator';

/**
 * Renderizador fotorrealista de mini esferas 3D de Luna y Marte
 */
export class MiniPlanetViewer {
  private engine: BABYLON.Engine;
  private scene: BABYLON.Scene;
  private mesh: BABYLON.Mesh;

  constructor(canvas: HTMLCanvasElement, type: 'Moon' | 'Mars') {
    this.engine = new BABYLON.Engine(canvas, true, {
      preserveDrawingBuffer: true,
      antialias: true
    });

    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);

    // Perspectiva girada 90º para Marte según solicitud del usuario para ver medio día y medio noche
    const initialAlpha = type === 'Mars' ? 0 : -Math.PI / 2;

    const camera = new BABYLON.ArcRotateCamera(
      'miniCam',
      initialAlpha,
      Math.PI / 2.2,
      2.5,
      BABYLON.Vector3.Zero(),
      this.scene
    );
    camera.attachControl(canvas, false);
    camera.lowerRadiusLimit = 2.0;
    camera.upperRadiusLimit = 4.0;

    // Iluminación solar lateral calculada para crear un terminador exacto (medio día, medio noche)
    const sunDir = type === 'Mars'
      ? new BABYLON.Vector3(0.25, -0.15, -1.4).normalize()
      : new BABYLON.Vector3(-1.4, -0.15, 0.25).normalize();

    const sun = new BABYLON.DirectionalLight(
      'miniSun',
      sunDir,
      this.scene
    );
    sun.intensity = 2.2;
    sun.diffuse = new BABYLON.Color3(1.0, 0.96, 0.90);

    const fillLight = new BABYLON.HemisphericLight(
      'miniFill',
      new BABYLON.Vector3(0, 1, 0),
      this.scene
    );
    fillLight.intensity = 0.25;
    fillLight.diffuse = new BABYLON.Color3(0.35, 0.42, 0.55);

    this.mesh = BABYLON.MeshBuilder.CreateSphere(`mini_${type}`, {
      diameter: 1.55,
      segments: 64
    }, this.scene);

    const mat = new BABYLON.StandardMaterial(`miniMat_${type}`, this.scene);

    if (type === 'Moon') {
      const moonTex = new BABYLON.Texture(
        './textures/moon.jpg',
        this.scene,
        false,
        true,
        BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
        null,
        () => {
          mat.diffuseTexture = PlanetaryTextureGenerator.createMoonTexture(this.scene);
        }
      );
      mat.diffuseTexture = moonTex;
      mat.specularColor = new BABYLON.Color3(0.04, 0.04, 0.04);
      mat.roughness = 0.9;
    } else {
      const marsTex = new BABYLON.Texture(
        './textures/mars.jpg',
        this.scene,
        false,
        true,
        BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
        null,
        () => {
          mat.diffuseTexture = PlanetaryTextureGenerator.createMarsTexture(this.scene);
        }
      );
      mat.diffuseTexture = marsTex;

      const marsBump = new BABYLON.Texture('./textures/mars_bump.jpg', this.scene);
      mat.bumpTexture = marsBump;
      mat.bumpTexture.level = 0.5;
      mat.specularColor = new BABYLON.Color3(0.08, 0.04, 0.02);
    }

    this.mesh.material = mat;

    this.engine.runRenderLoop(() => {
      this.mesh.rotation.y += 0.0035;
      this.scene.render();
    });

    window.addEventListener('resize', () => {
      this.engine.resize();
    });
  }

  public whenReady(): Promise<void> {
    return new Promise((resolve) => {
      this.scene.executeWhenReady(() => {
        resolve();
      });
    });
  }

  public spinFast() {
    let count = 0;
    const interval = setInterval(() => {
      this.mesh.rotation.y += 0.045;
      count++;
      if (count > 25) clearInterval(interval);
    }, 16);
  }
}
