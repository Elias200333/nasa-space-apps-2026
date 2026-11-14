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
  private atmosphereMesh!: BABYLON.Mesh;
  private hudRingMesh!: BABYLON.Mesh;
  private targetPin!: TargetPin;
  private spaceEnv!: DeepSpaceEnvironment;
  private earthRadius = 2.8;

  public onCoordinatesChange?: (lat: number, lon: number) => void;
  public onAtmosphericEntry?: (lat: number, lon: number) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new BABYLON.Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true
    });

    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0.01, 0.02, 0.05, 1.0);

    // 1. Entorno de Espacio Profundo con estrellas y nebulosas
    this.spaceEnv = new DeepSpaceEnvironment(this.scene);

    // 2. Cámara Orbital con controles suaves
    this.camera = new BABYLON.ArcRotateCamera(
      'earthCamera',
      -Math.PI / 2,
      Math.PI / 2.3,
      8.8,
      BABYLON.Vector3.Zero(),
      this.scene
    );
    this.camera.attachControl(canvas, true);
    this.camera.lowerRadiusLimit = 2.95; // Permite rozar la atmósfera
    this.camera.upperRadiusLimit = 18.0;
    this.camera.wheelPrecision = 35;
    this.camera.inertia = 0.88;

    // 3. Iluminación Solar Fotorrealista (Sol directo de alta energía + luz estelar)
    const sunLight = new BABYLON.DirectionalLight(
      'sunLight',
      new BABYLON.Vector3(-1.2, -0.3, 0.9).normalize(),
      this.scene
    );
    sunLight.intensity = 2.0;
    sunLight.diffuse = new BABYLON.Color3(1.0, 0.98, 0.95);
    sunLight.specular = new BABYLON.Color3(1.0, 1.0, 1.0);

    const spaceAmbient = new BABYLON.HemisphericLight(
      'spaceAmbient',
      new BABYLON.Vector3(0, 1, 0),
      this.scene
    );
    spaceAmbient.intensity = 0.22;
    spaceAmbient.diffuse = new BABYLON.Color3(0.2, 0.35, 0.6);
    spaceAmbient.groundColor = new BABYLON.Color3(0.02, 0.04, 0.08);

    // 4. Construcción de Tierra Fotorrealista, Nubes y Atmósfera
    this.buildRealisticEarth();
    this.buildRealisticClouds();
    this.buildAtmosphereFresnel();
    this.buildHudRing();

    // 5. Baliza holográfica sobre la superficie
    this.targetPin = new TargetPin(this.scene, this.earthRadius);

    // 6. Bucle de renderizado
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

    // Cargar textura fotorrealista de la NASA Blue Marble
    const diffuseTex = new BABYLON.Texture(
      './textures/earth.jpg',
      this.scene,
      false,
      true,
      BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
      null,
      () => {
        // Fallback procedural automático si no carga
        earthMat.diffuseTexture = PlanetaryTextureGenerator.createEarthTexture(this.scene);
      }
    );
    earthMat.diffuseTexture = diffuseTex;

    // Mapa de normales para relieve montañoso (Andes, Rocosas, Himalaya)
    const normalTex = new BABYLON.Texture('./textures/earth_normal.jpg', this.scene);
    earthMat.bumpTexture = normalTex;
    earthMat.bumpTexture.level = 0.6;

    // Mapa especular (los océanos reflejan el sol brillante, los continentes son mate)
    const specTex = new BABYLON.Texture('./textures/earth_specular.jpg', this.scene);
    earthMat.specularTexture = specTex;
    earthMat.specularColor = new BABYLON.Color3(0.9, 0.95, 1.0);
    earthMat.specularPower = 32;

    // Luces nocturnas de ciudades en la zona oscura
    const lightsTex = new BABYLON.Texture('./textures/earth_lights.png', this.scene);
    earthMat.emissiveTexture = lightsTex;
    earthMat.emissiveColor = new BABYLON.Color3(0.4, 0.35, 0.3);

    this.earthMesh.material = earthMat;
  }

  private buildRealisticClouds() {
    this.cloudsMesh = BABYLON.MeshBuilder.CreateSphere('cloudsMesh', {
      diameter: (this.earthRadius + 0.035) * 2,
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
    cloudsMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    cloudsMat.backFaceCulling = false;

    this.cloudsMesh.material = cloudsMat;
  }

  private buildAtmosphereFresnel() {
    // Atmósfera con dispersión de Rayleigh exterior
    this.atmosphereMesh = BABYLON.MeshBuilder.CreateSphere('atmosphereGlow', {
      diameter: (this.earthRadius + 0.12) * 2,
      segments: 48
    }, this.scene);

    const atmoMat = new BABYLON.StandardMaterial('atmoFresnelMat', this.scene);
    atmoMat.diffuseColor = new BABYLON.Color3(0.1, 0.45, 0.95);
    atmoMat.emissiveColor = new BABYLON.Color3(0.15, 0.55, 1.0);
    atmoMat.alpha = 0.22;
    atmoMat.backFaceCulling = false;

    // Efecto Fresnel para iluminar intensamente solo el borde del horizonte
    atmoMat.opacityFresnelParameters = new BABYLON.FresnelParameters();
    atmoMat.opacityFresnelParameters.leftColor = BABYLON.Color3.White();
    atmoMat.opacityFresnelParameters.rightColor = BABYLON.Color3.Black();
    atmoMat.opacityFresnelParameters.bias = 0.05;
    atmoMat.opacityFresnelParameters.power = 3.5;

    this.atmosphereMesh.material = atmoMat;
  }

  private buildHudRing() {
    this.hudRingMesh = BABYLON.MeshBuilder.CreateTorus('hudRing', {
      diameter: this.earthRadius * 2.7,
      thickness: 0.012,
      tessellation: 64
    }, this.scene);

    const ringMat = new BABYLON.StandardMaterial('ringMat', this.scene);
    ringMat.emissiveColor = new BABYLON.Color3(0.13, 0.83, 0.93);
    ringMat.alpha = 0.35;
    this.hudRingMesh.material = ringMat;
    this.hudRingMesh.rotation.x = Math.PI / 4;
  }

  private setupRenderLoop() {
    this.engine.runRenderLoop(() => {
      if (this.cloudsMesh) {
        this.cloudsMesh.rotation.y += 0.00025;
      }
      if (this.hudRingMesh) {
        this.hudRingMesh.rotation.z += 0.0005;
      }

      if (this.onCoordinatesChange) {
        const lat = (Math.PI / 2 - this.camera.beta) * (180 / Math.PI);
        let lon = (-this.camera.alpha * (180 / Math.PI)) - 180;
        lon = ((lon + 180) % 360 + 360) % 360 - 180;
        this.onCoordinatesChange(Number(lat.toFixed(4)), Number(lon.toFixed(4)));
      }

      this.scene.render();
    });
  }

  /**
   * Animación cinematográfica de inmersión / descenso atmosférico hacia las coordenadas generadas
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
    const totalFrames = 130;

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
      { frame: totalFrames * 0.45, value: 5.8 },
      { frame: totalFrames, value: 3.08 }
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

    // Cuando la cámara penetra en la atmósfera, disparar evento
    setTimeout(() => {
      if (onAtmosphereReached) {
        onAtmosphereReached();
      }
      if (this.onAtmosphericEntry) {
        this.onAtmosphericEntry(lat, lon);
      }
    }, 1700);
  }

  public ascendToOrbit(durationMs = 1400) {
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
      { frame: totalFrames, value: 8.8 }
    ]);

    const easing = new BABYLON.CubicEase();
    easing.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEOUT);
    animRadius.setEasingFunction(easing);

    this.scene.beginDirectAnimation(this.camera, [animRadius], 0, totalFrames, false);
  }

  public resetToGlobalView() {
    this.ascendToOrbit(1200);
  }

  public zoomIn() {
    const newRad = Math.max(3.05, this.camera.radius - 1.2);
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
}
