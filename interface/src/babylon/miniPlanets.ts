import * as BABYLON from 'babylonjs';
import { PlanetaryTextureGenerator } from './textureGenerator';

/**
 * Renderizador de mini esferas 3D interactivas para las tarjetas laterales de Luna y Marte
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
    this.scene.clearColor = new BABYLON.Color4(0, 0, 0, 0); // Fondo transparente

    const camera = new BABYLON.ArcRotateCamera(
      'miniCam',
      -Math.PI / 2,
      Math.PI / 2.2,
      2.6,
      BABYLON.Vector3.Zero(),
      this.scene
    );
    camera.attachControl(canvas, false); // Permite rotar arrastrando
    camera.lowerRadiusLimit = 2.0;
    camera.upperRadiusLimit = 4.0;

    // Luz solar suave con sombras para resaltar cráteres y valles
    const light = new BABYLON.DirectionalLight(
      'miniLight',
      new BABYLON.Vector3(-1, -0.2, 0.7).normalize(),
      this.scene
    );
    light.intensity = 1.4;

    const fillLight = new BABYLON.HemisphericLight(
      'miniFill',
      new BABYLON.Vector3(0, 1, 0),
      this.scene
    );
    fillLight.intensity = 0.25;

    // Esfera planetaria
    this.mesh = BABYLON.MeshBuilder.CreateSphere(`mini_${type}`, {
      diameter: 1.6,
      segments: 48
    }, this.scene);

    const mat = new BABYLON.StandardMaterial(`miniMat_${type}`, this.scene);
    if (type === 'Moon') {
      mat.diffuseTexture = PlanetaryTextureGenerator.createMoonTexture(this.scene);
      mat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05); // Superficie mate
    } else {
      mat.diffuseTexture = PlanetaryTextureGenerator.createMarsTexture(this.scene);
      mat.specularColor = new BABYLON.Color3(0.1, 0.05, 0.02);
    }
    this.mesh.material = mat;

    // Bucle de renderizado con rotación suave constante
    this.engine.runRenderLoop(() => {
      this.mesh.rotation.y += 0.004;
      this.scene.render();
    });

    window.addEventListener('resize', () => {
      this.engine.resize();
    });
  }

  public spinFast() {
    // Acelerar rotación temporalmente al seleccionar
    let count = 0;
    const interval = setInterval(() => {
      this.mesh.rotation.y += 0.05;
      count++;
      if (count > 30) clearInterval(interval);
    }, 16);
  }
}

