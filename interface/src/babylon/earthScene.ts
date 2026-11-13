import * as BABYLON from 'babylonjs';
import { PlanetaryTextureGenerator } from './textureGenerator';
import { TargetPin } from './targetPin';
import { DeepSpaceEnvironment } from './spaceBackground';

export class EarthSceneManager {
  private engine: BABYLON.Engine;
  private scene: BABYLON.Scene;
  private camera: BABYLON.ArcRotateCamera;
  private earthMesh!: BABYLON.Mesh;
  private cloudsMesh!: BABYLON.Mesh;
  private hudRingMesh!: BABYLON.Mesh;
  private targetPin!: TargetPin;
  private spaceEnv!: DeepSpaceEnvironment;
  private earthRadius = 2.8;

  public onCoordinatesChange?: (lat: number, lon: number) => void;
  public onAtmosphericEntry?: (lat: number, lon: number) => void;
  public onZoomDiveTrigger?: (lat: number, lon: number) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new BABYLON.Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true
    });

    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0.005, 0.01, 0.02, 1.0);

    // 1. Espacio profundo realista con estrellas (estilo Google Earth)
    this.spaceEnv = new DeepSpaceEnvironment(this.scene);

    // 2. Cámara orbital precisa
    this.camera = new BABYLON.ArcRotateCamera(
      'earthCamera',
      -Math.PI / 2,
      Math.PI / 2.3,
      8.5,
      BABYLON.Vector3.Zero(),
      this.scene
    );
    this.camera.attachControl(canvas, true);
    this.camera.lowerRadiusLimit = 2.95;
    this.camera.upperRadiusLimit = 18.0;
    this.camera.wheelPrecision = 35;
    this.camera.inertia = 0.88;

    // 3. Iluminación Solar Limpia (Idéntica a la Luna: luz blanca directa sin tinte azul)
    const sunLight = new BABYLON.DirectionalLight(
      'sunLight',
      new BABYLON.Vector3(-1.3, -0.25, 0.85).normalize(),
      this.scene
    );
    sunLight.intensity = 1.7;
    sunLight.diffuse = new BABYLON.Color3(1.0, 1.0, 1.0); // Luz solar blanca pura
    sunLight.specular = new BABYLON.Color3(0.5, 0.5, 0.5);

    // Luz ambiental mínima y neutra (sólo para que el lado nocturno no sea un agujero plano)
    const spaceAmbient = new BABYLON.HemisphericLight(
      'spaceAmbient',
      new BABYLON.Vector3(0, 1, 0),
      this.scene
    );
    spaceAmbient.intensity = 0.06;
    spaceAmbient.diffuse = new BABYLON.Color3(0.1, 0.1, 0.1); // Gris neutro, cero azul
    spaceAmbient.groundColor = new BABYLON.Color3(0.01, 0.01, 0.01);

    // 4. Construcción de la Tierra realista (sin cúpulas azules ni halos)
    this.buildRealisticEarth();
    this.buildRealisticClouds();
    this.buildHudRing();

    // 5. Baliza holográfica
    this.targetPin = new TargetPin(this.scene, this.earthRadius);

    // 6. Bucle de renderizado y detección de zoom cercano
    this.setupRenderLoop();

    window.addEventListener('resize', () => {
      this.engine.resize();
    });
  }

  private buildRealisticEarth() {
    this.earthMesh = BABYLON.MeshBuilder.CreateSphere('earthMesh', {
      diameter: this.earthRadius * 2,
      segments: 64
    }, this.scene);

    const earthMat = new BABYLON.StandardMaterial('earthPhotorealMat', this.scene);

    // Textura difusa en alta definición de NASA Blue Marble
    const diffuseTex = new BABYLON.Texture(
      './textures/earth.jpg',
      this.scene,
      false,
      true,
      BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
      null,
      () => {
        earthMat.diffuseTexture = PlanetaryTextureGenerator.createEarthTexture(this.scene);
      }
    );
    earthMat.diffuseTexture = diffuseTex;
    earthMat.diffuseColor = new BABYLON.Color3(1.0, 1.0, 1.0); // Color natural puro 1:1

    // Mapa de normales para relieve topográfico realista
    const normalTex = new BABYLON.Texture('./textures/earth_normal.jpg', this.scene);
    earthMat.bumpTexture = normalTex;
    earthMat.bumpTexture.level = 0.45;

    // Mapa especular (océanos con reflejo nítido, continentes mate)
    const specTex = new BABYLON.Texture('./textures/earth_specular.jpg', this.scene);
    earthMat.specularTexture = specTex;
    earthMat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);
    earthMat.specularPower = 55;

    // Luces nocturnas sutiles en la zona oscura
    const lightsTex = new BABYLON.Texture('./textures/earth_lights.png', this.scene);
    earthMat.emissiveTexture = lightsTex;
    earthMat.emissiveColor = new BABYLON.Color3(0.25, 0.22, 0.18);

    // Cero halos, cero emisivos azules adicionales
    this.earthMesh.material = earthMat;
  }

  private buildRealisticClouds() {
    // La capa de nubes se sitúa pegada a la corteza terrestre (a escala física real)
    this.cloudsMesh = BABYLON.MeshBuilder.CreateSphere('cloudsMesh', {
      diameter: (this.earthRadius + 0.008) * 2,
      segments: 64
    }, this.scene);

    const cloudsMat = new BABYLON.StandardMaterial('cloudsMat', this.scene);
    const cloudsTex = new BABYLON.Texture(
      './textures/earth_clouds.png',
      this.scene,
      false,
      true,
      BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
      null,
      () => {
        cloudsMat.diffuseTexture = PlanetaryTextureGenerator.createCloudsTexture(this.scene);
        cloudsMat.opacityTexture = cloudsMat.diffuseTexture;
      }
    );
    cloudsMat.diffuseTexture = cloudsTex;
    cloudsMat.opacityTexture = cloudsTex;
    cloudsMat.diffuseColor = new BABYLON.Color3(0.9, 0.9, 0.9);
    cloudsMat.specularColor = new BABYLON.Color3(0, 0, 0); // Las nubes no reflejan como cristal
    cloudsMat.backFaceCulling = false;

    this.cloudsMesh.material = cloudsMat;
  }

  private buildHudRing() {
    this.hudRingMesh = BABYLON.MeshBuilder.CreateTorus('hudRing', {
      diameter: this.earthRadius * 2.65,
      thickness: 0.006,
      tessellation: 64
    }, this.scene);

    const ringMat = new BABYLON.StandardMaterial('ringMat', this.scene);
    ringMat.emissiveColor = new BABYLON.Color3(0.13, 0.83, 0.93);
    ringMat.alpha = 0.18;
    this.hudRingMesh.material = ringMat;
    this.hudRingMesh.rotation.x = Math.PI / 4;
  }

  private setupRenderLoop() {
    let lastZoomCheck = 0;

    this.engine.runRenderLoop(() => {
      if (this.cloudsMesh) {
        this.cloudsMesh.rotation.y += 0.00015;
      }
      if (this.hudRingMesh) {
        this.hudRingMesh.rotation.z += 0.0003;
      }

      if (this.onCoordinatesChange) {
        const lat = (Math.PI / 2 - this.camera.beta) * (180 / Math.PI);
        let lon = (-this.camera.alpha * (180 / Math.PI)) - 180;
        lon = ((lon + 180) % 360 + 360) % 360 - 180;
        this.onCoordinatesChange(Number(lat.toFixed(4)), Number(lon.toFixed(4)));
      }

      // Detección cuando el usuario se acerca al máximo con la rueda del ratón hacia la superficie
      const now = performance.now();
      if (now - lastZoomCheck > 400) {
        lastZoomCheck = now;
        if (this.camera.radius <= 3.05 && this.onZoomDiveTrigger) {
          const lat = (Math.PI / 2 - this.camera.beta) * (180 / Math.PI);
          let lon = (-this.camera.alpha * (180 / Math.PI)) - 180;
          lon = ((lon + 180) % 360 + 360) % 360 - 180;
          this.onZoomDiveTrigger(Number(lat.toFixed(4)), Number(lon.toFixed(4)));
        }
      }

      this.scene.render();
    });
  }

  /**
   * Animación suave hacia las coordenadas generadas y descenso para conectar con el mapa 2D
   */
  public animateToCoordinatesAndDive(lat: number, lon: number, onAtmosphereReached?: () => void) {
    this.targetPin.setCoordinates(lat, lon);

    const targetBeta = (90 - lat) * (Math.PI / 180);
    const targetAlpha = -((lon + 180) * (Math.PI / 180));

    let currentAlpha = this.camera.alpha;
    const diff = (targetAlpha - currentAlpha) % (2 * Math.PI);
    const shortestDiff = ((diff + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    const endAlpha = currentAlpha + shortestDiff;

    const fps = 60;
    const totalFrames = 120;

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

    const animRadius = new BABYLON.Animation(
      'camRadius',
      'radius',
      fps,
      BABYLON.Animation.ANIMATIONTYPE_FLOAT,
      BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    animRadius.setKeys([
      { frame: 0, value: this.camera.radius },
      { frame: totalFrames * 0.45, value: 5.5 },
      { frame: totalFrames, value: 3.02 }
    ]);

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

    setTimeout(() => {
      if (onAtmosphereReached) {
        onAtmosphereReached();
      }
      if (this.onAtmosphericEntry) {
        this.onAtmosphericEntry(lat, lon);
      }
    }, 1600);
  }

  public ascendToOrbit(durationMs = 1200) {
    const fps = 60;
    const totalFrames = (durationMs / 1000) * fps;

    const animRadius = new BABYLON.Animation(
      'ascendRadius',
      'radius',
      fps,
      BABYLON.Animation.ANIMATIONTYPE_FLOAT,
      BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    animRadius.setKeys([
      { frame: 0, value: this.camera.radius },
      { frame: totalFrames, value: 8.5 }
    ]);

    const easing = new BABYLON.CubicEase();
    easing.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEOUT);
    animRadius.setEasingFunction(easing);

    this.scene.beginDirectAnimation(this.camera, [animRadius], 0, totalFrames, false);
  }

  public resetToGlobalView() {
    this.ascendToOrbit(1000);
  }

  public zoomIn() {
    const newRad = Math.max(2.98, this.camera.radius - 1.2);
    this.animateRadius(newRad);
  }

  public zoomOut() {
    const newRad = Math.min(18.0, this.camera.radius + 1.2);
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

  public getCamera(): BABYLON.ArcRotateCamera {
    return this.camera;
  }
}
