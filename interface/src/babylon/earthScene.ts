import * as BABYLON from 'babylonjs';
import { TargetPin } from './targetPin';
import { DeepSpaceEnvironment } from './spaceBackground';
import { CelestialBody, PlanetaryLayerMode, PlanetaryPOI } from '../types';
import { PLANETARY_DETAILS, VERIFIED_PLANETARY_POIS } from '../nasa/trekProviders';
import { XRSpatialUIManager } from '../xr/xrSpatialUI';

export class EarthSceneManager {
  private engine: BABYLON.Engine;
  private scene: BABYLON.Scene;
  private camera: BABYLON.ArcRotateCamera;
  private earthRoot: BABYLON.TransformNode;
  private earthMesh!: BABYLON.Mesh;
  private cloudsMesh!: BABYLON.Mesh;
  private targetPin!: TargetPin;
  private spaceEnv!: DeepSpaceEnvironment;
  private earthRadius = 2.8;

  // Estado planetario activo
  private currentPlanet: CelestialBody = 'Earth';
  private currentLayerMode: PlanetaryLayerMode = 'surface';

  // Gestor de Realidad Virtual (WebXR)
  private xrSpatialUI: XRSpatialUIManager | null = null;
  private isXRActive = false;
  private xrExperience: BABYLON.WebXRDefaultExperience | null = null;

  // Materiales planetarios de alta resolución (Tierra, Marte, Luna)
  private earthMat!: BABYLON.ShaderMaterial;
  private marsMatSurface!: BABYLON.StandardMaterial;
  private marsMatTopo!: BABYLON.StandardMaterial;
  private moonMatSurface!: BABYLON.StandardMaterial;
  private moonMatTopo!: BABYLON.StandardMaterial;

  // Balizas 3D para puntos de interés verificados
  private marsPOIPins: { poi: PlanetaryPOI; pin: TargetPin }[] = [];
  private moonPOIPins: { poi: PlanetaryPOI; pin: TargetPin }[] = [];

  // Control de auto-rotación e inactividad
  private autoRotate = true;
  private isPointerDown = false;
  private isTransitioning = false;
  private activeDragMode: 'none' | 'earth' | 'camera' = 'none';
  private lastPointerX = 0;
  private lastPointerY = 0;
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private sunDirection = new BABYLON.Vector3(-1.4, 0.15, 0.75).normalize();

  public onCoordinatesChange?: (lat: number, lon: number, body?: CelestialBody) => void;
  public onAtmosphericEntry?: (lat: number, lon: number) => void;
  public onZoomDiveTrigger?: (lat: number, lon: number, body?: CelestialBody) => void;
  public onPOIClicked?: (poi: PlanetaryPOI) => void;
  public onTextureProgress?: (name: string) => void;
  private firstFrameRendered = false;
  private onReadyCallbacks: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new BABYLON.Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true
    });

    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0.005, 0.01, 0.02, 1.0);

    // Detección de primer cuadro renderizado cuando todo el grafo esté listo
    this.scene.executeWhenReady(() => {
      this.scene.onAfterRenderObservable.addOnce(() => {
        this.firstFrameRendered = true;
        this.onReadyCallbacks.forEach(cb => cb());
        this.onReadyCallbacks = [];
      });
    });

    // 1. Fondo de espacio profundo con estrellas puntuales
    this.spaceEnv = new DeepSpaceEnvironment(this.scene);

    // 2. Nodo raíz que sostiene la Tierra/planeta y permite rotar el planeta directamente
    this.earthRoot = new BABYLON.TransformNode('earthRoot', this.scene);

    // 3. Cámara fija en posición frontal para ver la mitad de día y la mitad de noche
    this.camera = new BABYLON.ArcRotateCamera(
      'earthCamera',
      -Math.PI / 2,
      Math.PI / 2,
      8.5,
      BABYLON.Vector3.Zero(),
      this.scene
    );
    this.camera.minZ = 0.05; // Evita cualquier corte del plano cercano
    this.camera.lowerRadiusLimit = 3.60; // Cota segura sin atravesar la superficie
    this.camera.upperRadiusLimit = 16.0;
    this.camera.wheelPrecision = 30;
    this.camera.inertia = 0.88;

    // Desactivamos la rotación de cámara por puntero para que el ratón rote el planeta
    this.camera.inputs.remove(this.camera.inputs.attached.pointers);
    this.camera.attachControl(canvas, false, false); // Mantiene el zoom con la rueda del ratón

    // Detección de zoom in anticipado: al aproximarse a escala continental, transiciona a exploración
    canvas.addEventListener('wheel', (e) => {
      if (this.isTransitioning) return;
      if (e.deltaY < 0 && this.camera.radius <= 4.4) {
        this.triggerManualZoomDive();
      }
    }, { passive: true });

    // 4. Luz solar directa
    const sunLight = new BABYLON.DirectionalLight('sunLight', this.sunDirection.clone().scale(-1), this.scene);
    sunLight.intensity = 1.6;
    sunLight.diffuse = new BABYLON.Color3(1.0, 1.0, 1.0);

    // 5. Construcción de Tierra y shaders fotorealistas
    this.buildDayNightEarthShader();
    this.buildRealisticClouds();
    this.buildPlanetaryMaterials();

    // 6. Baliza holográfica vinculada al giro planetario
    this.targetPin = new TargetPin(this.scene, this.earthRadius);
    this.targetPin.getRoot().parent = this.earthRoot;

    // 7. Balizas 3D para puntos de interés científicos de Marte y la Luna
    this.setupPlanetaryPOIMarkers();

    // 8. Configuración de controles de ratón para rotar el planeta y temporizador de 30s
    this.setupPlanetRotationControls(canvas);

    // 9. Bucle de renderizado
    this.setupRenderLoop();

    window.addEventListener('resize', () => {
      this.engine.resize();
    });
  }

  public whenReady(): Promise<void> {
    if (this.firstFrameRendered) return Promise.resolve();
    return new Promise((resolve) => {
      this.onReadyCallbacks.push(resolve);
    });
  }

  /**
   * Shader personalizado de alta fidelidad:
   * - Día: Textura de satélite NASA con relieve y reflejo especular en océanos.
   * - Noche: Luces doradas de ciudades y pueblos (Black Marble NASA) en el lado oscuro.
   * - Orientación corregida: invertY: false sitúa el Polo Norte arriba (+Y) y la Antártida abajo (-Y).
   */
  private buildDayNightEarthShader() {
    BABYLON.Effect.ShadersStore['earthPhotorealVertexShader'] = `
      precision highp float;
      attribute vec3 position;
      attribute vec3 normal;
      attribute vec2 uv;

      uniform mat4 world;
      uniform mat4 worldViewProjection;

      varying vec2 vUV;
      varying vec3 vNormalW;
      varying vec3 vPositionW;

      void main(void) {
        vec4 worldPos = world * vec4(position, 1.0);
        vPositionW = worldPos.xyz;
        vNormalW = normalize((world * vec4(normal, 0.0)).xyz);
        // Coordenadas UV con U invertida (1.0 - uv.x) para corregir el efecto espejo horizontal:
        // Brasil/América a la izquierda (Oeste) y África a la derecha (Este)
        vUV = vec2(1.0 - uv.x, uv.y);
        gl_Position = worldViewProjection * vec4(position, 1.0);
      }
    `;

    BABYLON.Effect.ShadersStore['earthPhotorealFragmentShader'] = `
      precision highp float;
      varying vec2 vUV;
      varying vec3 vNormalW;
      varying vec3 vPositionW;

      uniform vec3 vSunDirection;
      uniform vec3 vCameraPosition;
      uniform sampler2D dayTexture;
      uniform sampler2D nightTexture;
      uniform sampler2D specularTexture;
      uniform sampler2D normalTexture;

      void main(void) {
        vec3 normal = normalize(vNormalW);
        vec3 sunDir = normalize(vSunDirection);
        vec3 viewDir = normalize(vCameraPosition - vPositionW);

        // Cálculo de iluminación solar y línea de terminador (amanecer/atardecer)
        float NdotL = dot(normal, sunDir);
        float dayFactor = smoothstep(-0.18, 0.18, NdotL);
        float nightFactor = 1.0 - dayFactor;

        // 1. Textura diurna
        vec3 dayColor = texture2D(dayTexture, vUV).rgb;
        vec3 finalDay = dayColor * (dayFactor * 1.35 + 0.02);

        // 2. Luces nocturnas de ciudades en la zona en sombra (cálidas y brillantes)
        vec3 nightColor = texture2D(nightTexture, vUV).rgb;
        vec3 warmCityLights = nightColor * vec3(1.35, 1.18, 0.85) * 3.2;
        vec3 finalNight = warmCityLights * nightFactor;

        // 3. Brillo especular natural del sol en los océanos durante el día
        float specMask = texture2D(specularTexture, vUV).r;
        vec3 reflectDir = reflect(-sunDir, normal);
        float spec = pow(max(dot(viewDir, reflectDir), 0.0), 55.0);
        vec3 specular = vec3(0.55, 0.55, 0.55) * spec * specMask * dayFactor;

        // 4. Limbo atmosférico muy sutil en el borde iluminado por el sol
        float rim = 1.0 - max(dot(viewDir, normal), 0.0);
        float atmoRim = pow(rim, 6.0) * max(dot(normal, sunDir) + 0.05, 0.0);
        vec3 atmosphere = vec3(0.12, 0.42, 0.85) * atmoRim * 0.35;

        gl_FragColor = vec4(finalDay + finalNight + specular + atmosphere, 1.0);
      }
    `;

    this.earthMesh = BABYLON.MeshBuilder.CreateSphere('earthMesh', {
      diameter: this.earthRadius * 2,
      segments: 64
    }, this.scene);
    this.earthMesh.parent = this.earthRoot;

    this.earthMat = new BABYLON.ShaderMaterial('earthShaderMat', this.scene, {
      vertex: 'earthPhotoreal',
      fragment: 'earthPhotoreal'
    }, {
      attributes: ['position', 'normal', 'uv'],
      uniforms: ['world', 'worldViewProjection', 'vSunDirection', 'vCameraPosition'],
      samplers: ['dayTexture', 'nightTexture', 'specularTexture', 'normalTexture']
    });

    // Texturas con invertY = false para orientar correctamente los polos (Norte arriba, Sur abajo)
    const notifyTex = (name: string) => {
      if (this.onTextureProgress) this.onTextureProgress(name);
    };

    const dayTex = new BABYLON.Texture('./textures/earth.jpg', this.scene, false, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE, () => notifyTex('Tierra Satélite'));
    const nightTex = new BABYLON.Texture('./textures/earth_lights.png', this.scene, false, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE, () => notifyTex('Luces Urbanas'));
    const specTex = new BABYLON.Texture('./textures/earth_specular.jpg', this.scene, false, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE, () => notifyTex('Máscara Oceánica'));
    const normTex = new BABYLON.Texture('./textures/earth_normal.jpg', this.scene, false, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE, () => notifyTex('Relieve Topográfico'));

    this.earthMat.setTexture('dayTexture', dayTex);
    this.earthMat.setTexture('nightTexture', nightTex);
    this.earthMat.setTexture('specularTexture', specTex);
    this.earthMat.setTexture('normalTexture', normTex);

    this.earthMat.setVector3('vSunDirection', this.sunDirection);

    this.scene.onBeforeRenderObservable.add(() => {
      this.earthMat.setVector3('vCameraPosition', this.camera.position);
    });

    this.earthMesh.material = this.earthMat;
  }

  /**
   * Construye los materiales de cartografía real de NASA Trek para Marte y la Luna:
   * - Superficie visual (Viking MDIM2.1 y LRO WAC)
   * - Topografía altimétrica en relieve sombreado (MOLA y LOLA)
   */
  private buildPlanetaryMaterials() {
    // 1. MARTE - Superficie Visual (Viking MDIM2.1)
    this.marsMatSurface = new BABYLON.StandardMaterial('marsMatSurface', this.scene);
    const marsSurfaceTex = new BABYLON.Texture('./textures/mars.jpg', this.scene, false, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    this.marsMatSurface.diffuseTexture = marsSurfaceTex;
    const marsBumpTex = new BABYLON.Texture('./textures/mars_bump.jpg', this.scene, false, false);
    marsBumpTex.level = 0.55;
    this.marsMatSurface.bumpTexture = marsBumpTex;
    this.marsMatSurface.specularColor = new BABYLON.Color3(0.06, 0.03, 0.02);
    this.marsMatSurface.ambientColor = new BABYLON.Color3(0.12, 0.08, 0.06);

    // 2. MARTE - Topografía Altimétrica (MGS MOLA Color Hillshade)
    this.marsMatTopo = new BABYLON.StandardMaterial('marsMatTopo', this.scene);
    const marsTopoTex = new BABYLON.Texture('./textures/mars_mola_topo.jpg', this.scene, false, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    this.marsMatTopo.diffuseTexture = marsTopoTex;
    this.marsMatTopo.bumpTexture = marsBumpTex;
    this.marsMatTopo.bumpTexture.level = 0.35;
    this.marsMatTopo.specularColor = new BABYLON.Color3(0.04, 0.04, 0.04);

    // 3. LUNA - Superficie Visual (LRO LROC WAC Mosaic)
    this.moonMatSurface = new BABYLON.StandardMaterial('moonMatSurface', this.scene);
    const moonSurfaceTex = new BABYLON.Texture('./textures/moon.jpg', this.scene, false, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    this.moonMatSurface.diffuseTexture = moonSurfaceTex;
    this.moonMatSurface.specularColor = new BABYLON.Color3(0.02, 0.02, 0.02);
    this.moonMatSurface.roughness = 0.95;

    // 4. LUNA - Topografía Altimétrica (LRO LOLA Color Hillshade)
    this.moonMatTopo = new BABYLON.StandardMaterial('moonMatTopo', this.scene);
    const moonTopoTex = new BABYLON.Texture('./textures/moon_lola_topo.jpg', this.scene, false, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    this.moonMatTopo.diffuseTexture = moonTopoTex;
    this.moonMatTopo.specularColor = new BABYLON.Color3(0.02, 0.02, 0.02);
  }

  /**
   * Instancia las balizas tridimensionales en las coordenadas verificadas de accidentes geográficos
   */
  private setupPlanetaryPOIMarkers() {
    // Marcadores para Marte (radio escalado 2.65)
    VERIFIED_PLANETARY_POIS.Mars.forEach(poi => {
      const pin = new TargetPin(this.scene, 2.65);
      pin.getRoot().parent = this.earthRoot;
      pin.setColor(new BABYLON.Color3(0.98, 0.45, 0.09)); // Naranja marciano
      pin.setCoordinates(poi.latitude, poi.longitude);
      pin.setVisible(false);
      this.marsPOIPins.push({ poi, pin });
    });

    // Marcadores para la Luna (radio escalado 2.50)
    VERIFIED_PLANETARY_POIS.Moon.forEach(poi => {
      const pin = new TargetPin(this.scene, 2.50);
      pin.getRoot().parent = this.earthRoot;
      pin.setColor(new BABYLON.Color3(0.75, 0.85, 0.98)); // Plata/azul lunar
      pin.setCoordinates(poi.latitude, poi.longitude);
      pin.setVisible(false);
      this.moonPOIPins.push({ poi, pin });
    });
  }

  private buildRealisticClouds() {
    this.cloudsMesh = BABYLON.MeshBuilder.CreateSphere('cloudsMesh', {
      diameter: (this.earthRadius + 0.007) * 2,
      segments: 64
    }, this.scene);
    this.cloudsMesh.parent = this.earthRoot;

    const cloudsMat = new BABYLON.StandardMaterial('cloudsMat', this.scene);
    const cloudsTex = new BABYLON.Texture('./textures/earth_clouds.png', this.scene, false, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE, () => {
      if (this.onTextureProgress) this.onTextureProgress('Atmósfera y Nubes');
    });
    cloudsTex.uScale = -1;
    cloudsTex.uOffset = 1;
    cloudsMat.diffuseTexture = cloudsTex;
    cloudsMat.opacityTexture = cloudsTex;
    cloudsMat.diffuseColor = new BABYLON.Color3(0.92, 0.92, 0.92);
    cloudsMat.specularColor = BABYLON.Color3.Black();
    cloudsMat.backFaceCulling = false;

    this.cloudsMesh.material = cloudsMat;
  }

  /**
   * Manejo directo del ratón sobre la escena y la Tierra:
   * - Click izquierdo arrastrando: Gira la Tierra sobre su eje (día/noche pasan frente al observador).
   * - Click derecho arrastrando: Mueve/orbita la perspectiva de la cámara ("como antes").
   * - La auto-rotación se detiene inmediatamente al maniobrar con cualquier botón.
   * - Tras 30 segundos de inactividad, reanuda la rotación lenta automáticamente.
   */
  private setupPlanetRotationControls(canvas: HTMLCanvasElement) {
    canvas.style.cursor = 'grab';

    // Evitar el menú contextual del navegador para permitir arrastre fluido con click derecho
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    let startPointerX = 0;
    let startPointerY = 0;

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 0) {
        this.activeDragMode = 'earth';
      } else if (e.button === 2) {
        this.activeDragMode = 'camera';
      } else {
        return;
      }

      this.isPointerDown = true;
      startPointerX = e.clientX;
      startPointerY = e.clientY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      canvas.style.cursor = 'grabbing';

      // Detener rotación automática al maniobrar
      this.autoRotate = false;
      if (this.inactivityTimer) {
        clearTimeout(this.inactivityTimer);
        this.inactivityTimer = null;
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isPointerDown) return;

      const deltaX = e.clientX - this.lastPointerX;
      const deltaY = e.clientY - this.lastPointerY;

      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;

      if (this.activeDragMode === 'earth') {
        // Click izquierdo: «agarrar» el planeta. La superficie sigue al puntero (arrastrar a la derecha
        // la lleva a la derecha; hacia abajo, abajo): giro sobre su eje polar e inclinación sobre el eje
        // horizontal de la pantalla, con el polo siempre en vertical (no se tumba de lado).
        this.spinTiltBy(-deltaX * 0.005, -deltaY * 0.005);
      } else if (this.activeDragMode === 'camera') {
        // Click derecho: Órbita de la perspectiva de la cámara ("como antes")
        this.camera.alpha -= deltaX * 0.005;
        const newBeta = this.camera.beta - deltaY * 0.005;
        this.camera.beta = Math.max(0.08, Math.min(Math.PI - 0.08, newBeta));
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (!this.isPointerDown) return;
      this.isPointerDown = false;
      this.activeDragMode = 'none';
      canvas.style.cursor = 'grab';

      // Detección de clic (sin arrastre apreciable) sobre balizas de accidentes geográficos
      const dragDist = Math.hypot(e.clientX - startPointerX, e.clientY - startPointerY);
      if (dragDist < 6 && this.currentLayerMode === 'exploration') {
        const activePOIs = this.currentPlanet === 'Mars' ? this.marsPOIPins : (this.currentPlanet === 'Moon' ? this.moonPOIPins : []);
        for (const item of activePOIs) {
          const worldPos = item.pin.getRoot().getAbsolutePosition();
          const screenPos = BABYLON.Vector3.Project(
            worldPos,
            BABYLON.Matrix.Identity(),
            this.scene.getTransformMatrix(),
            this.camera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight())
          );
          if (screenPos.z >= 0 && screenPos.z <= 1) {
            const clickDist = Math.hypot(screenPos.x - e.clientX, screenPos.y - e.clientY);
            if (clickDist < 32) {
              this.flyToPOI(item.poi.latitude, item.poi.longitude);
              if (this.onPOIClicked) {
                this.onPOIClicked(item.poi);
              }
              break;
            }
          }
        }
      }

      // Iniciar cuenta atrás de 30 segundos para volver a girar sola lentamente
      if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
      this.inactivityTimer = setTimeout(() => {
        this.autoRotate = true;
      }, 30000); // 30 segundos
    });
  }

  private setupRenderLoop() {
    this.engine.runRenderLoop(() => {
      // Rotación automática muy sutil y suave de la Tierra
      if (this.autoRotate) {
        this.spinTiltBy(0.0002, 0);   // sobre su eje polar: si está inclinado, ya no se bambolea
      }

      // Deriva atmosférica independiente de las nubes
      if (this.cloudsMesh) {
        this.cloudsMesh.rotation.y += 0.00008;
      }

      // Lectura de coordenadas según el punto central del planeta facing camera
      if (this.onCoordinatesChange) {
        const camDirWorld = this.camera.position.clone().normalize();
        this.earthRoot.computeWorldMatrix(true);
        const invWorld = this.earthRoot.getWorldMatrix().clone().invert();
        const localDir = BABYLON.Vector3.TransformNormal(camDirWorld, invWorld).normalize();

        const lat = Math.asin(Math.max(-1, Math.min(1, localDir.y))) * (180 / Math.PI);
        let lon = Math.atan2(-localDir.z, -localDir.x) * (180 / Math.PI);
        if (lon > 180) lon -= 360;
        if (lon < -180) lon += 360;

        this.onCoordinatesChange(Number(lat.toFixed(4)), Number(lon.toFixed(4)), this.currentPlanet);
      }

      this.scene.render();
    });
  }

  /**
   * Cambia el planeta activo central (Earth / Mars / Moon) con transición visual cinematográfica:
   * - Redimensiona la escala física del cuerpo celeste
   * - Aplica los sombreadores/texturas correspondientes (Superficie o Topografía MOLA/LOLA)
   * - Controla la presencia o ausencia de atmósfera y nubes
   * - Muestra u oculta los puntos de interés verificados
   * - Reubica la cámara suavemente en órbita global
   */
  public switchPlanet(body: CelestialBody, layerMode: PlanetaryLayerMode = 'surface') {
    this.currentPlanet = body;
    this.currentLayerMode = layerMode;

    const details = PLANETARY_DETAILS[body];
    const targetScale = details.scaledGlobeRadius / 2.8;

    // 1. Animación suave de escala
    const animScale = new BABYLON.Animation('scalePlanet', 'scaling', 60, BABYLON.Animation.ANIMATIONTYPE_VECTOR3, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    animScale.setKeys([
      { frame: 0, value: this.earthMesh.scaling.clone() },
      { frame: 25, value: new BABYLON.Vector3(targetScale, targetScale, targetScale) }
    ]);
    const easing = new BABYLON.CubicEase();
    easing.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);
    animScale.setEasingFunction(easing);
    this.scene.beginDirectAnimation(this.earthMesh, [animScale], 0, 25, false);

    // 2. Aplicar material y capas
    this.applyPlanetMaterial(body, layerMode);

    // 3. Ocultar baliza genérica
    this.targetPin.setVisible(false);

    // 4. Actualizar balizas de exploración
    this.updatePOIMarkersVisibility();

    // 5. Retraer cámara a cota orbital estándar de 8.5
    this.resetCameraToOrbit();

    // 6. Orientar hacia la ubicación de referencia del planeta
    this.orientToCoordinates(details.defaultLat, details.defaultLon);

    if (this.xrSpatialUI) {
      this.xrSpatialUI.setActivePlanet(body);
    }

    if (this.onCoordinatesChange) {
      this.onCoordinatesChange(details.defaultLat, details.defaultLon, body);
    }
  }

  public setLayerMode(layerMode: PlanetaryLayerMode) {
    this.currentLayerMode = layerMode;
    this.applyPlanetMaterial(this.currentPlanet, layerMode);
    this.updatePOIMarkersVisibility();
    if (this.xrSpatialUI) {
      this.xrSpatialUI.setActiveLayerMode(layerMode);
    }
  }

  private applyPlanetMaterial(body: CelestialBody, layerMode: PlanetaryLayerMode) {
    if (body === 'Earth') {
      this.earthMesh.material = this.earthMat;
      this.cloudsMesh.setEnabled(true);
    } else if (body === 'Mars') {
      this.cloudsMesh.setEnabled(false);
      this.earthMesh.material = (layerMode === 'topography') ? this.marsMatTopo : this.marsMatSurface;
    } else if (body === 'Moon') {
      this.cloudsMesh.setEnabled(false);
      this.earthMesh.material = (layerMode === 'topography') ? this.moonMatTopo : this.moonMatSurface;
    }
  }

  public updatePOIMarkersVisibility() {
    const isExploration = this.currentLayerMode === 'exploration';
    this.marsPOIPins.forEach(item => item.pin.setVisible(isExploration && this.currentPlanet === 'Mars'));
    this.moonPOIPins.forEach(item => item.pin.setVisible(isExploration && this.currentPlanet === 'Moon'));
  }

  public getCurrentPlanet(): CelestialBody {
    return this.currentPlanet;
  }

  public getCurrentLayerMode(): PlanetaryLayerMode {
    return this.currentLayerMode;
  }

  public resetCameraToOrbit() {
    const animRadius = new BABYLON.Animation('resetCamRad', 'radius', 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    animRadius.setKeys([
      { frame: 0, value: this.camera.radius },
      { frame: 25, value: 8.5 }
    ]);
    const animAlpha = new BABYLON.Animation('resetCamAlpha', 'alpha', 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    animAlpha.setKeys([
      { frame: 0, value: this.camera.alpha },
      { frame: 25, value: -Math.PI / 2 }
    ]);
    const animBeta = new BABYLON.Animation('resetCamBeta', 'beta', 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    animBeta.setKeys([
      { frame: 0, value: this.camera.beta },
      { frame: 25, value: Math.PI / 2 }
    ]);

    const easing = new BABYLON.CubicEase();
    easing.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);
    animRadius.setEasingFunction(easing);
    animAlpha.setEasingFunction(easing);
    animBeta.setEasingFunction(easing);

    this.scene.beginDirectAnimation(this.camera, [animRadius, animAlpha, animBeta], 0, 25, false);
  }

  public flyToPOI(lat: number, lon: number) {
    this.autoRotate = false;
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);

    const euler = EarthSceneManager.calculateOrientationEuler(lat, lon);
    const targetRotX = euler.x;
    const targetRotY = euler.y;
    const targetRotZ = euler.z;

    let currentY = this.earthRoot.rotation.y;
    const diffY = (targetRotY - currentY) % (2 * Math.PI);
    const shortestY = currentY + (((diffY + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);

    let currentX = this.earthRoot.rotation.x;
    const diffX = (targetRotX - currentX) % (2 * Math.PI);
    const shortestX = currentX + (((diffX + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);

    let currentZ = this.earthRoot.rotation.z;
    const diffZ = (targetRotZ - currentZ) % (2 * Math.PI);
    const shortestZ = currentZ + (((diffZ + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);

    const animRotY = new BABYLON.Animation('poiRotY', 'rotation.y', 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    animRotY.setKeys([{ frame: 0, value: this.earthRoot.rotation.y }, { frame: 40, value: shortestY }]);

    const animRotX = new BABYLON.Animation('poiRotX', 'rotation.x', 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    animRotX.setKeys([{ frame: 0, value: this.earthRoot.rotation.x }, { frame: 40, value: shortestX }]);

    const animRotZ = new BABYLON.Animation('poiRotZ', 'rotation.z', 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    animRotZ.setKeys([{ frame: 0, value: this.earthRoot.rotation.z }, { frame: 40, value: shortestZ }]);

    const animRadius = new BABYLON.Animation('poiRad', 'radius', 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    animRadius.setKeys([{ frame: 0, value: this.camera.radius }, { frame: 40, value: 5.2 }]);

    const easing = new BABYLON.CubicEase();
    easing.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);
    animRotY.setEasingFunction(easing);
    animRotX.setEasingFunction(easing);
    animRotZ.setEasingFunction(easing);
    animRadius.setEasingFunction(easing);

    this.scene.beginDirectAnimation(this.earthRoot, [animRotY, animRotX, animRotZ], 0, 40, false);
    this.scene.beginDirectAnimation(this.camera, [animRadius], 0, 40, false);
  }

  /**
   * Obtiene las coordenadas geográficas exactas (latitud, longitud) del centro de la pantalla
   */
  public getCurrentCenterCoordinates(): { lat: number; lon: number } {
    const camDirWorld = this.camera.position.clone().normalize();
    this.earthRoot.computeWorldMatrix(true);
    const invWorld = this.earthRoot.getWorldMatrix().clone().invert();
    const localDir = BABYLON.Vector3.TransformNormal(camDirWorld, invWorld).normalize();

    const lat = Math.asin(Math.max(-1, Math.min(1, localDir.y))) * (180 / Math.PI);
    let lon = Math.atan2(-localDir.z, -localDir.x) * (180 / Math.PI);
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;

    return {
      lat: Number(lat.toFixed(4)),
      lon: Number(lon.toFixed(4))
    };
  }

  /**
   * Transición manual suave de zoom cuando el usuario acerca la rueda del ratón a la Tierra
   */
  public triggerManualZoomDive() {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    this.autoRotate = false;
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);

    // Ocultar cualquier baliza para navegación limpia
    this.targetPin.setVisible(false);

    const coords = this.getCurrentCenterCoordinates();

    // Zoom continuo anticipado hacia la órbita continental (cota 4.1 sin atravesar la Tierra)
    const animRadius = new BABYLON.Animation('wheelDive', 'radius', 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    animRadius.setKeys([
      { frame: 0, value: this.camera.radius },
      { frame: 18, value: 4.1 }
    ]);
    const easing = new BABYLON.CubicEase();
    easing.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEOUT);
    animRadius.setEasingFunction(easing);

    this.scene.beginDirectAnimation(this.camera, [animRadius], 0, 18, false);

    setTimeout(() => {
      if (this.onZoomDiveTrigger) {
        this.onZoomDiveTrigger(coords.lat, coords.lon, this.currentPlanet);
      }
    }, 100);
  }

  /**
   * Anima la Tierra rotándola hacia las coordenadas elegidas y acercando la cámara
   * con una transición de zoom óptico continuo y cinematográfico (estilo Google Earth)
   */
  public animateToCoordinatesAndDive(lat: number, lon: number, onAtmosphereReached?: () => void) {
    this.isTransitioning = true;
    this.autoRotate = false;
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);

    // Posicionar baliza en la superficie de la Tierra con coordenadas no espejadas
    this.targetPin.setCoordinates(lat, lon);

    // Calcular ángulos de Euler con preservación estricta de Norte-Arriba
    const euler = EarthSceneManager.calculateOrientationEuler(lat, lon);
    const targetRotX = euler.x;
    const targetRotY = euler.y;
    const targetRotZ = euler.z;

    // Giro por el camino más corto
    let currentY = this.earthRoot.rotation.y;
    const diffY = (targetRotY - currentY) % (2 * Math.PI);
    const shortestY = currentY + (((diffY + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);

    let currentX = this.earthRoot.rotation.x;
    const diffX = (targetRotX - currentX) % (2 * Math.PI);
    const shortestX = currentX + (((diffX + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);

    let currentZ = this.earthRoot.rotation.z;
    const diffZ = (targetRotZ - currentZ) % (2 * Math.PI);
    const shortestZ = currentZ + (((diffZ + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);

    const fps = 60;
    const totalFrames = 75; // 1.25s de trayectoria continua y fluida

    // Animación de rotación de la Tierra en sus tres ejes para conservar la orientación vertical del mapa
    const animRotY = new BABYLON.Animation('earthRotY', 'rotation.y', fps, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    animRotY.setKeys([{ frame: 0, value: this.earthRoot.rotation.y }, { frame: totalFrames, value: shortestY }]);

    const animRotX = new BABYLON.Animation('earthRotX', 'rotation.x', fps, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    animRotX.setKeys([{ frame: 0, value: this.earthRoot.rotation.x }, { frame: totalFrames, value: shortestX }]);

    const animRotZ = new BABYLON.Animation('earthRotZ', 'rotation.z', fps, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    animRotZ.setKeys([{ frame: 0, value: this.earthRoot.rotation.z }, { frame: totalFrames, value: shortestZ }]);

    // Descenso de cámara que se detiene a cota orbital continental (radius = 4.1, sin atravesar la Tierra de radio 2.8)
    const animRadius = new BABYLON.Animation('camZoomRadius', 'radius', fps, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    animRadius.setKeys([
      { frame: 0, value: this.camera.radius },
      { frame: totalFrames * 0.45, value: 5.6 },
      { frame: totalFrames, value: 4.1 }
    ]);

    // Re-alineación suave de la cámara a vista frontal
    const animAlpha = new BABYLON.Animation('camAlpha', 'alpha', fps, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    const targetAlpha = -Math.PI / 2;
    const diffAlpha = (targetAlpha - this.camera.alpha) % (2 * Math.PI);
    const shortestAlpha = this.camera.alpha + (((diffAlpha + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    animAlpha.setKeys([{ frame: 0, value: this.camera.alpha }, { frame: totalFrames, value: shortestAlpha }]);

    const animBeta = new BABYLON.Animation('camBeta', 'beta', fps, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    animBeta.setKeys([{ frame: 0, value: this.camera.beta }, { frame: totalFrames, value: Math.PI / 2 }]);

    const easing = new BABYLON.CubicEase();
    easing.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);
    animRotY.setEasingFunction(easing);
    animRotX.setEasingFunction(easing);
    animRotZ.setEasingFunction(easing);
    animRadius.setEasingFunction(easing);
    animAlpha.setEasingFunction(easing);
    animBeta.setEasingFunction(easing);

    this.scene.beginDirectAnimation(this.earthRoot, [animRotY, animRotX, animRotZ], 0, totalFrames, false);
    this.scene.beginDirectAnimation(this.camera, [animRadius, animAlpha, animBeta], 0, totalFrames, false);

    // Disparar el fundido del mapa 2D con anticipación (a los 680ms)
    setTimeout(() => {
      if (onAtmosphereReached) onAtmosphereReached();
      if (this.onAtmosphericEntry) this.onAtmosphericEntry(lat, lon);
    }, 680);
  }

  /**
   * Prepara la orientación 3D para el regreso suave desde el mapa 2D:
   * 1. Orienta la Tierra hacia las coordenadas exactas observadas en el mapa 2D.
   * 2. Ajusta la cámara de forma frontal (alpha = -PI/2, beta = PI/2) a cota continental cercana (radius = 4.1).
   * 3. Oculta balizas para permitir una transición limpia.
   */
  public prepareOrbitAscent(lat: number, lon: number) {
    this.autoRotate = false;
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }

    this.scene.stopAnimation(this.camera);
    this.scene.stopAnimation(this.earthRoot);

    this.targetPin.setVisible(false);

    // Posición frontal en cota continental coincidente con la vista 2D
    this.camera.alpha = -Math.PI / 2;
    this.camera.beta = Math.PI / 2;
    this.camera.radius = 4.1;

    this.orientToCoordinates(lat, lon);
    this.earthRoot.computeWorldMatrix(true);

    if (this.onCoordinatesChange) {
      this.onCoordinatesChange(Number(lat.toFixed(4)), Number(lon.toFixed(4)));
    }
  }

  public ascendToOrbit(durationMs = 1200) {
    this.isTransitioning = false;
    const fps = 60;
    const totalFrames = (durationMs / 1000) * fps;

    // Asegurar que la cámara empiece en cota continental cercana (4.1) y ascienda suavemente al espacio (8.5)
    const startRadius = Math.min(this.camera.radius, 4.2);
    this.camera.radius = startRadius;

    const animRadius = new BABYLON.Animation('ascendRad', 'radius', fps, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    animRadius.setKeys([
      { frame: 0, value: startRadius },
      { frame: totalFrames, value: 8.5 }
    ]);

    const easing = new BABYLON.CubicEase();
    easing.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEOUT);
    animRadius.setEasingFunction(easing);

    this.scene.beginDirectAnimation(this.camera, [animRadius], 0, totalFrames, false);

    // Reanudar temporizador de 30 segundos
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    this.inactivityTimer = setTimeout(() => {
      this.autoRotate = true;
    }, 30000);
  }

  public hidePin() {
    this.targetPin.setVisible(false);
  }

  public resetToGlobalView() {
    this.ascendToOrbit(1000);
  }

  public zoomIn() {
    if (this.camera.radius <= 4.8) {
      this.triggerManualZoomDive();
    } else {
      const newRad = Math.max(4.0, this.camera.radius - 1.2);
      this.animateRadius(newRad);
    }
  }

  public zoomOut() {
    const newRad = Math.min(16.0, this.camera.radius + 1.2);
    this.animateRadius(newRad);
  }

  private animateRadius(targetRadius: number) {
    const anim = new BABYLON.Animation('stepRad', 'radius', 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    anim.setKeys([{ frame: 0, value: this.camera.radius }, { frame: 20, value: targetRadius }]);
    const easing = new BABYLON.CubicEase();
    easing.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEOUT);
    anim.setEasingFunction(easing);
    this.scene.beginDirectAnimation(this.camera, [anim], 0, 20, false);
  }

  /**
   * Calcula analíticamente los ángulos de rotación Euler (rx, ry, rz) requeridos para situar
   * unas coordenadas (lat, lon) exactamente frente a la cámara (0, 0, -1),
   * preservando rigurosamente el Norte estrictamente hacia ARRIBA (+Y) y el Este a la DERECHA (+X),
   * garantizando que la orientación sea 100% idéntica al mapa 2D (sin inclinaciones laterales).
   */
  public static calculateOrientationEuler(lat: number, lon: number): BABYLON.Vector3 {
    const latRad = lat * (Math.PI / 180);
    const lonRad = lon * (Math.PI / 180);

    const P = new BABYLON.Vector3(
      -Math.cos(latRad) * Math.cos(lonRad),
      Math.sin(latRad),
      -Math.cos(latRad) * Math.sin(lonRad)
    );

    const ry = Math.atan2(P.x, -P.z);
    const rx = -latRad;

    const mY = BABYLON.Matrix.RotationY(ry);
    const mX = BABYLON.Matrix.RotationX(rx);
    const mTotal = mY.multiply(mX);

    const q = BABYLON.Quaternion.FromRotationMatrix(mTotal);
    return q.toEulerAngles();
  }

  /** Inclinación máxima a la que se llega arrastrando (la misma que antes: ±π/3.5). */
  private static readonly MAX_DRAG_TILT = Math.PI / 3.5;

  /**
   * Orientación «tipo globo» del planeta: primero un giro `spin` sobre su eje polar y después una
   * inclinación `tilt` sobre el eje X de la escena (la misma forma mY·mX de calculateOrientationEuler).
   * Se deduce de la rotación actual, para respetar lo que hayan dejado las animaciones.
   * Polo en el mundo = (0, cos t, sin t); eje X local = (cos s, sin s·sin t, −sin s·cos t).
   */
  private getSpinTilt(): { spin: number; tilt: number } {
    const r = this.earthRoot.rotation;
    const m = BABYLON.Matrix.RotationYawPitchRoll(r.y, r.x, r.z);
    const pole = BABYLON.Vector3.TransformNormal(BABYLON.Axis.Y, m);
    const east = BABYLON.Vector3.TransformNormal(BABYLON.Axis.X, m);
    const tilt = Math.atan2(pole.z, pole.y);
    const spin = Math.atan2(east.y * Math.sin(tilt) - east.z * Math.cos(tilt), east.x);
    return { spin, tilt };
  }

  /** Gira el planeta sobre su eje polar (`dSpin`) y lo inclina hacia/desde la cámara (`dTilt`). */
  private spinTiltBy(dSpin: number, dTilt: number) {
    const { spin, tilt } = this.getSpinTilt();
    let newTilt = tilt + dTilt;
    // Tope de inclinación; si una animación dejó el planeta más inclinado (un polo), no salta: solo
    // impide inclinarlo aún más.
    if (Math.abs(newTilt) > EarthSceneManager.MAX_DRAG_TILT && Math.abs(newTilt) > Math.abs(tilt)) newTilt = tilt;
    const m = BABYLON.Matrix.RotationY(spin + dSpin).multiply(BABYLON.Matrix.RotationX(newTilt));
    this.earthRoot.rotation.copyFrom(BABYLON.Quaternion.FromRotationMatrix(m).toEulerAngles());
  }

  /**
   * Sincroniza la orientación de la Tierra 3D con unas coordenadas (lat, lon) específicas,
   * manteniendo el eje vertical (Norte Arriba) alineado exactamente con la cartografía 2D.
   */
  public orientToCoordinates(lat: number, lon: number) {
    const euler = EarthSceneManager.calculateOrientationEuler(lat, lon);
    this.earthRoot.rotation.x = euler.x;
    this.earthRoot.rotation.y = euler.y;
    this.earthRoot.rotation.z = euler.z;
  }

  public getEarthRoot(): BABYLON.TransformNode {
    return this.earthRoot;
  }

  /**
   * Inicia el Entorno Espacial Holográfico WebXR:
   * - Configura la suite de paneles 3D flotantes en el espacio (sin planetas orbitando la Tierra).
   * - Ajusta la cámara para una visión holográfica óptima de mando aeroespacial.
   * - Si se detecta hardware de realidad virtual (Meta Quest, Pico, VisionPro), lanza sesión WebXR nativa.
   */
  public async enterXREnvironment(onPlanetSwitchExternal?: (planet: CelestialBody) => void) {
    this.isXRActive = true;

    // 1. Instanciar o reactivar la interfaz espacial flotante
    if (!this.xrSpatialUI) {
      this.xrSpatialUI = new XRSpatialUIManager(this.scene, {
        onPlanetSwitch: (planet) => {
          this.switchPlanet(planet, this.currentLayerMode);
          if (onPlanetSwitchExternal) onPlanetSwitchExternal(planet);
        },
        onLayerModeSwitch: (mode) => {
          this.setLayerMode(mode);
        },
        onCameraTool: (action) => {
          this.handleXRCameraTool(action);
        },
        onCompareWithEarth: (target) => {
          this.switchPlanet(target, this.currentLayerMode);
          if (onPlanetSwitchExternal) onPlanetSwitchExternal(target);
        }
      });
      this.xrSpatialUI.buildSpatialInterface();
    } else {
      this.xrSpatialUI.setVisible(true);
    }

    this.xrSpatialUI.setActivePlanet(this.currentPlanet);
    this.xrSpatialUI.setActiveLayerMode(this.currentLayerMode);

    // 2. Colocar la cámara en la perspectiva holográfica óptima de mando
    this.camera.radius = 7.5;
    this.camera.beta = Math.PI / 2.05;
    this.camera.alpha = -Math.PI / 2;
    this.camera.target = new BABYLON.Vector3(0, 0.35, 0);

    // 3. Iniciar sesión WebXR nativa si el dispositivo es un visor VR físico
    try {
      if (!this.xrExperience && typeof this.scene.createDefaultXRExperienceAsync === 'function') {
        this.xrExperience = await this.scene.createDefaultXRExperienceAsync({
          disableTeleportation: true
        });
        if (this.xrExperience?.baseExperience) {
          const isSupported = await BABYLON.WebXRSessionManager.IsSessionSupportedAsync('immersive-vr');
          if (isSupported) {
            await this.xrExperience.baseExperience.enterXRAsync('immersive-vr', 'local-floor');
          }
        }
      }
    } catch (err) {
      console.info('Modo WebXR nativo no iniciado, ejecutando simulador espacial:', err);
    }
  }

  private handleXRCameraTool(action: 'orbit' | 'move' | 'zoomIn' | 'zoomOut' | 'fit') {
    switch (action) {
      case 'orbit':
        this.autoRotate = !this.autoRotate;
        break;
      case 'zoomIn':
        this.camera.radius = Math.max(3.5, this.camera.radius - 0.8);
        break;
      case 'zoomOut':
        this.camera.radius = Math.min(14.0, this.camera.radius + 0.8);
        break;
      case 'fit':
        this.camera.radius = 7.5;
        this.camera.beta = Math.PI / 2.05;
        this.camera.alpha = -Math.PI / 2;
        this.camera.target = new BABYLON.Vector3(0, 0.35, 0);
        break;
      case 'move':
        this.autoRotate = false;
        break;
    }
  }

  public exitXREnvironment() {
    this.isXRActive = false;
    if (this.xrSpatialUI) {
      this.xrSpatialUI.setVisible(false);
    }
    if (this.xrExperience?.baseExperience) {
      try {
        this.xrExperience.baseExperience.exitXRAsync();
      } catch (err) {
        // Ignorar
      }
    }
    this.resetCameraToOrbit();
  }

  public getIsXRActive(): boolean {
    return this.isXRActive;
  }
}
