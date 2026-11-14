import * as BABYLON from 'babylonjs';
import { PlanetaryTextureGenerator } from './textureGenerator';
import { TargetPin } from './targetPin';

export interface CameraPositionUpdate {
  alpha: number;
  beta: number;
  radius: number;
  currentLat: number;
  currentLon: number;
}

export class EarthSceneManager {
  private engine: BABYLON.Engine;
  private scene: BABYLON.Scene;
  private camera: BABYLON.ArcRotateCamera;
  private earthMesh!: BABYLON.Mesh;
  private cloudsMesh!: BABYLON.Mesh;
  private atmosphereMesh!: BABYLON.Mesh;
  private hudRingMesh!: BABYLON.Mesh;
  private targetPin!: TargetPin;
  private earthRadius = 2.8;

  public onCoordinatesChange?: (lat: number, lon: number) => void;

  constructor(canvas: HTMLCanvasElement) {
    // 1. Inicialización de motor WebGL de BabylonJS
    this.engine = new BABYLON.Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true
    });

    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0.02, 0.04, 0.08, 0.0); // Transparente hacia el fondo estelar CSS

    // 2. Cámara orbital ArcRotateCamera
    this.camera = new BABYLON.ArcRotateCamera(
      'earthCamera',
      -Math.PI / 2, // Centrada en el meridiano 0
      Math.PI / 2.3, // Vista ligeramente elevada sobre el ecuador
      8.8,           // Radio inicial global
      BABYLON.Vector3.Zero(),
      this.scene
    );
    this.camera.attachControl(canvas, true);
    this.camera.lowerRadiusLimit = 3.6;  // Límite de zoom máximo hacia la superficie
    this.camera.upperRadiusLimit = 16.0; // Límite de alejamiento
    this.camera.wheelPrecision = 40;
    this.camera.inertia = 0.85;

    // 3. Luces: Sol direccional + Luz ambiente espacial
    const sunLight = new BABYLON.DirectionalLight(
      'sunLight',
      new BABYLON.Vector3(-1, -0.4, 0.8).normalize(),
      this.scene
    );
    sunLight.intensity = 1.6;
    sunLight.diffuse = new BABYLON.Color3(1.0, 0.98, 0.94);

    const ambientLight = new BABYLON.HemisphericLight(
      'ambientLight',
      new BABYLON.Vector3(0, 1, 0),
      this.scene
    );
    ambientLight.intensity = 0.35;
    ambientLight.diffuse = new BABYLON.Color3(0.3, 0.45, 0.65);
    ambientLight.groundColor = new BABYLON.Color3(0.05, 0.08, 0.15);

    // 4. Construcción de la Tierra, Nubes y Atmósfera
    this.buildEarth();
    this.buildClouds();
    this.buildAtmosphere();
    this.buildHudRing();

    // 5. Baliza holográfica de destino
    this.targetPin = new TargetPin(this.scene, this.earthRadius);

    // 6. Bucle de renderizado y rotación sutil
    this.setupRenderLoop();

    // Redimensionamiento responsive
    window.addEventListener('resize', () => {
      this.engine.resize();
    });
  }

  private buildEarth() {
    this.earthMesh = BABYLON.MeshBuilder.CreateSphere('earthMesh', {
      diameter: this.earthRadius * 2,
      segments: 64
    }, this.scene);

    const earthMat = new BABYLON.StandardMaterial('earthMat', this.scene);
    earthMat.diffuseTexture = PlanetaryTextureGenerator.createEarthTexture(this.scene);
    earthMat.specularColor = new BABYLON.Color3(0.25, 0.35, 0.5); // Brillo sutil en océanos
    earthMat.specularPower = 24;

    this.earthMesh.material = earthMat;
  }

  private buildClouds() {
    this.cloudsMesh = BABYLON.MeshBuilder.CreateSphere('cloudsMesh', {
      diameter: (this.earthRadius + 0.04) * 2,
      segments: 48
    }, this.scene);

    const cloudsMat = new BABYLON.StandardMaterial('cloudsMat', this.scene);
    cloudsMat.diffuseTexture = PlanetaryTextureGenerator.createCloudsTexture(this.scene);
    cloudsMat.opacityTexture = cloudsMat.diffuseTexture;
    cloudsMat.specularColor = new BABYLON.Color3(0, 0, 0);
    cloudsMat.backFaceCulling = false;

    this.cloudsMesh.material = cloudsMat;
  }

  private buildAtmosphere() {
    this.atmosphereMesh = BABYLON.MeshBuilder.CreateSphere('atmosphereMesh', {
      diameter: (this.earthRadius + 0.14) * 2,
      segments: 48
    }, this.scene);

    const atmoMat = new BABYLON.StandardMaterial('atmoMat', this.scene);
    atmoMat.diffuseColor = new BABYLON.Color3(0.12, 0.5, 0.95);
    atmoMat.emissiveColor = new BABYLON.Color3(0.08, 0.35, 0.7);
    atmoMat.alpha = 0.18;
    atmoMat.backFaceCulling = false;

    this.atmosphereMesh.material = atmoMat;
  }

  private buildHudRing() {
    // Anillo orbital HUD que rodea la Tierra estilo interfaz espacial
    this.hudRingMesh = BABYLON.MeshBuilder.CreateTorus('hudRing', {
      diameter: this.earthRadius * 2.7,
      thickness: 0.015,
      tessellation: 64
    }, this.scene);

    const ringMat = new BABYLON.StandardMaterial('ringMat', this.scene);
    ringMat.emissiveColor = new BABYLON.Color3(0.13, 0.83, 0.93); // Cyan
    ringMat.alpha = 0.35;
    this.hudRingMesh.material = ringMat;
    this.hudRingMesh.rotation.x = Math.PI / 4;
  }

  private setupRenderLoop() {
    this.engine.runRenderLoop(() => {
      // Rotación lenta de las nubes independiente de la Tierra
      if (this.cloudsMesh) {
        this.cloudsMesh.rotation.y += 0.0003;
      }

      // Rotación sutil del anillo HUD
      if (this.hudRingMesh) {
        this.hudRingMesh.rotation.z += 0.0006;
      }

      // Cálculo de latitud/longitud en el centro de la vista
      if (this.onCoordinatesChange) {
        // En ArcRotateCamera: alpha gira en horizontal, beta en vertical
        const lat = (Math.PI / 2 - this.camera.beta) * (180 / Math.PI);
        let lon = (-this.camera.alpha * (180 / Math.PI)) - 180;
        // Normalizar lon entre -180 y +180
        lon = ((lon + 180) % 360 + 360) % 360 - 180;
        this.onCoordinatesChange(Number(lat.toFixed(4)), Number(lon.toFixed(4)));
      }

      this.scene.render();
    });
  }

  /**
   * Enfoque suave y acercamiento a unas coordenadas terrestres específicas (lat, lon)
   */
  public animateToCoordinates(lat: number, lon: number, zoomDistance = 4.6, durationMs = 1800) {
    // Colocar baliza holográfica en la superficie de la Tierra
    this.targetPin.setCoordinates(lat, lon);

    // Calcular ángulos de cámara para centrar esas coordenadas
    // Longitud -> Alpha, Latitud -> Beta
    const targetBeta = (90 - lat) * (Math.PI / 180);
    // Para alinear con Greenwich + textura:
    const targetAlpha = -((lon + 180) * (Math.PI / 180));

    // Normalizar targetAlpha para que el giro sea por la trayectoria más corta
    let currentAlpha = this.camera.alpha;
    const diff = (targetAlpha - currentAlpha) % (2 * Math.PI);
    const shortestDiff = ((diff + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    const endAlpha = currentAlpha + shortestDiff;

    const fps = 60;
    const totalFrames = (durationMs / 1000) * fps;

    // Animación de rotación horizontal (Alpha)
    const animAlpha = new BABYLON.Animation(
      'camAlpha',
      'alpha',
      fps,
      BABYLON.Animation.ANIMATIONTYPE_FLOAT,
      BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    animAlpha.setKeys([
      { frame: 0, value: this.camera.alpha },
      { frame: totalFrames, value: endAlpha }
    ]);

    // Animación de ángulo vertical (Beta)
    const animBeta = new BABYLON.Animation(
      'camBeta',
      'beta',
      fps,
      BABYLON.Animation.ANIMATIONTYPE_FLOAT,
      BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    animBeta.setKeys([
      { frame: 0, value: this.camera.beta },
      { frame: totalFrames, value: Math.max(0.1, Math.min(Math.PI - 0.1, targetBeta)) }
    ]);

    // Animación de acercamiento / zoom (Radius)
    const animRadius = new BABYLON.Animation(
      'camRadius',
      'radius',
      fps,
      BABYLON.Animation.ANIMATIONTYPE_FLOAT,
      BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    animRadius.setKeys([
      { frame: 0, value: this.camera.radius },
      { frame: totalFrames * 0.4, value: Math.max(this.camera.radius, 7.5) }, // Ligero alejamiento al inicio para trayectoria orbital
      { frame: totalFrames, value: zoomDistance } // Acercamiento final a la superficie
    ]);

    // Curva de interpolación suave (CubicEaseInOut)
    const easing = new BABYLON.CubicEase();
    easing.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);
    animAlpha.setEasingFunction(easing);
    animBeta.setEasingFunction(easing);
    animRadius.setEasingFunction(easing);

    this.scene.beginDirectAnimation(
      this.camera,
      [animAlpha, animBeta, animRadius],
      0,
      totalFrames,
      false
    );
  }

  /**
   * Restablece la vista global de la Tierra alejando la cámara
   */
  public resetToGlobalView(durationMs = 1200) {
    const fps = 60;
    const totalFrames = (durationMs / 1000) * fps;

    const animRadius = new BABYLON.Animation(
      'resetRadius',
      'radius',
      fps,
      BABYLON.Animation.ANIMATIONTYPE_FLOAT,
      BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    animRadius.setKeys([
      { frame: 0, value: this.camera.radius },
      { frame: totalFrames, value: 8.8 }
    ]);

    const easing = new BABYLON.CubicEase();
    easing.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEOUT);
    animRadius.setEasingFunction(easing);

    this.scene.beginDirectAnimation(this.camera, [animRadius], 0, totalFrames, false);
  }

  public zoomIn() {
    const newRad = Math.max(this.camera.lowerRadiusLimit || 3.6, this.camera.radius - 1.2);
    this.animateRadius(newRad);
  }

  public zoomOut() {
    const newRad = Math.min(this.camera.upperRadiusLimit || 16.0, this.camera.radius + 1.2);
    this.animateRadius(newRad);
  }

  private animateRadius(targetRadius: number) {
    const anim = new BABYLON.Animation(
      'stepRadius',
      'radius',
      60,
      BABYLON.Animation.ANIMATIONTYPE_FLOAT,
      BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    anim.setKeys([
      { frame: 0, value: this.camera.radius },
      { frame: 20, value: targetRadius }
    ]);
    const easing = new BABYLON.CubicEase();
    easing.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEOUT);
    anim.setEasingFunction(easing);
    this.scene.beginDirectAnimation(this.camera, [anim], 0, 20, false);
  }

  public getScene(): BABYLON.Scene {
    return this.scene;
  }
}

