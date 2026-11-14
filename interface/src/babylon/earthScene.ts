import * as BABYLON from 'babylonjs';
import { TargetPin } from './targetPin';
import { DeepSpaceEnvironment } from './spaceBackground';

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

  // Control de auto-rotación e inactividad
  private autoRotate = true;
  private isPointerDown = false;
  private isTransitioning = false;
  private activeDragMode: 'none' | 'earth' | 'camera' = 'none';
  private lastPointerX = 0;
  private lastPointerY = 0;
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private sunDirection = new BABYLON.Vector3(-1.4, 0.15, 0.75).normalize();

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

    // 1. Fondo de espacio profundo con estrellas puntuales
    this.spaceEnv = new DeepSpaceEnvironment(this.scene);

    // 2. Nodo raíz que sostiene la Tierra y permite rotar el planeta directamente
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
    this.camera.lowerRadiusLimit = 2.89; // Permite descender hasta baja órbita (radio Tierra = 2.8)
    this.camera.upperRadiusLimit = 16.0;
    this.camera.wheelPrecision = 35;
    this.camera.inertia = 0.88;

    // Desactivamos la rotación de cámara por puntero para que el ratón rote el planeta
    this.camera.inputs.remove(this.camera.inputs.attached.pointers);
    this.camera.attachControl(canvas, false, false); // Mantiene el zoom con la rueda del ratón

    // Detección de zoom in cercano para transición fluida al mapa 2D
    canvas.addEventListener('wheel', (e) => {
      if (this.isTransitioning) return;
      if (e.deltaY < 0 && this.camera.radius <= 3.12) {
        this.triggerManualZoomDive();
      }
    }, { passive: true });

    // 4. Luz solar directa
    const sunLight = new BABYLON.DirectionalLight('sunLight', this.sunDirection.clone().scale(-1), this.scene);
    sunLight.intensity = 1.6;
    sunLight.diffuse = new BABYLON.Color3(1.0, 1.0, 1.0);

    // 5. Construcción de Tierra con shader de día/noche y luces urbanas nocturnas
    this.buildDayNightEarthShader();
    this.buildRealisticClouds();

    // 6. Baliza holográfica vinculada al giro de la Tierra
    this.targetPin = new TargetPin(this.scene, this.earthRadius);
    this.targetPin.getRoot().parent = this.earthRoot;

    // 7. Configuración de controles de ratón para rotar el planeta y temporizador de 30s
    this.setupPlanetRotationControls(canvas);

    // 8. Bucle de renderizado
    this.setupRenderLoop();

    window.addEventListener('resize', () => {
      this.engine.resize();
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

    const earthMat = new BABYLON.ShaderMaterial('earthShaderMat', this.scene, {
      vertex: 'earthPhotoreal',
      fragment: 'earthPhotoreal'
    }, {
      attributes: ['position', 'normal', 'uv'],
      uniforms: ['world', 'worldViewProjection', 'vSunDirection', 'vCameraPosition'],
      samplers: ['dayTexture', 'nightTexture', 'specularTexture', 'normalTexture']
    });

    // Texturas con invertY = false para orientar correctamente los polos (Norte arriba, Sur abajo)
    const dayTex = new BABYLON.Texture('./textures/earth.jpg', this.scene, false, false);
    const nightTex = new BABYLON.Texture('./textures/earth_lights.png', this.scene, false, false);
    const specTex = new BABYLON.Texture('./textures/earth_specular.jpg', this.scene, false, false);
    const normTex = new BABYLON.Texture('./textures/earth_normal.jpg', this.scene, false, false);

    earthMat.setTexture('dayTexture', dayTex);
    earthMat.setTexture('nightTexture', nightTex);
    earthMat.setTexture('specularTexture', specTex);
    earthMat.setTexture('normalTexture', normTex);

    earthMat.setVector3('vSunDirection', this.sunDirection);

    this.scene.onBeforeRenderObservable.add(() => {
      earthMat.setVector3('vCameraPosition', this.camera.position);
    });

    this.earthMesh.material = earthMat;
  }

  private buildRealisticClouds() {
    this.cloudsMesh = BABYLON.MeshBuilder.CreateSphere('cloudsMesh', {
      diameter: (this.earthRadius + 0.007) * 2,
      segments: 64
    }, this.scene);
    this.cloudsMesh.parent = this.earthRoot;

    const cloudsMat = new BABYLON.StandardMaterial('cloudsMat', this.scene);
    const cloudsTex = new BABYLON.Texture('./textures/earth_clouds.png', this.scene, false, false);
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

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 0) {
        this.activeDragMode = 'earth';
      } else if (e.button === 2) {
        this.activeDragMode = 'camera';
      } else {
        return;
      }

      this.isPointerDown = true;
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
        // Click izquierdo: Gira la Tierra sobre su eje (continentes rotan frente al observador)
        this.earthRoot.rotation.y += deltaX * 0.005;

        // Inclinación vertical restringida para preservar la orientación de los polos
        const newRotX = this.earthRoot.rotation.x + deltaY * 0.005;
        this.earthRoot.rotation.x = Math.max(-Math.PI / 3.5, Math.min(Math.PI / 3.5, newRotX));
      } else if (this.activeDragMode === 'camera') {
        // Click derecho: Órbita de la perspectiva de la cámara ("como antes")
        this.camera.alpha -= deltaX * 0.005;
        const newBeta = this.camera.beta - deltaY * 0.005;
        this.camera.beta = Math.max(0.08, Math.min(Math.PI - 0.08, newBeta));
      }
    });

    window.addEventListener('pointerup', () => {
      if (!this.isPointerDown) return;
      this.isPointerDown = false;
      this.activeDragMode = 'none';
      canvas.style.cursor = 'grab';

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
        this.earthRoot.rotation.y += 0.0002;
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

        this.onCoordinatesChange(Number(lat.toFixed(4)), Number(lon.toFixed(4)));
      }

      this.scene.render();
    });
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

    const coords = this.getCurrentCenterCoordinates();

    // Zoom continuo final hacia la superficie terrestre
    const animRadius = new BABYLON.Animation('wheelDive', 'radius', 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    animRadius.setKeys([
      { frame: 0, value: this.camera.radius },
      { frame: 25, value: 2.89 }
    ]);
    const easing = new BABYLON.CubicEase();
    easing.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEOUT);
    animRadius.setEasingFunction(easing);

    this.scene.beginDirectAnimation(this.camera, [animRadius], 0, 25, false);

    setTimeout(() => {
      if (this.onZoomDiveTrigger) {
        this.onZoomDiveTrigger(coords.lat, coords.lon);
      }
    }, 180);
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

    // Vector unitario del punto en el marco local de la Tierra
    const phi = (90 - lat) * (Math.PI / 180);
    const lonRad = lon * (Math.PI / 180);
    const v = new BABYLON.Vector3(
      -Math.sin(phi) * Math.cos(lonRad),
      Math.cos(phi),
      -Math.sin(phi) * Math.sin(lonRad)
    );

    // Rotaciones analíticas para situar el punto exactamente frente a la cámara (0, 0, -1)
    const rx = Math.atan2(-v.y, -v.z);
    const mX = BABYLON.Matrix.RotationX(rx);
    const vX = BABYLON.Vector3.TransformCoordinates(v, mX);
    const ry = Math.atan2(vX.x, -vX.z);

    const targetRotX = rx;
    const targetRotY = ry;

    // Giro por el camino más corto
    let currentY = this.earthRoot.rotation.y;
    const diffY = (targetRotY - currentY) % (2 * Math.PI);
    const shortestY = currentY + (((diffY + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);

    let currentX = this.earthRoot.rotation.x;
    const diffX = (targetRotX - currentX) % (2 * Math.PI);
    const shortestX = currentX + (((diffX + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);

    const fps = 60;
    const totalFrames = 85; // 1.4s de trayectoria continua y fluida

    // Animación de rotación de la Tierra
    const animRotY = new BABYLON.Animation('earthRotY', 'rotation.y', fps, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    animRotY.setKeys([{ frame: 0, value: this.earthRoot.rotation.y }, { frame: totalFrames, value: shortestY }]);

    const animRotX = new BABYLON.Animation('earthRotX', 'rotation.x', fps, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    animRotX.setKeys([{ frame: 0, value: this.earthRoot.rotation.x }, { frame: totalFrames, value: shortestX }]);

    // Descenso continuo de la cámara hacia la superficie
    const animRadius = new BABYLON.Animation('camZoomRadius', 'radius', fps, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    animRadius.setKeys([
      { frame: 0, value: this.camera.radius },
      { frame: totalFrames * 0.45, value: 5.2 },
      { frame: totalFrames, value: 2.92 }
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
    animRadius.setEasingFunction(easing);
    animAlpha.setEasingFunction(easing);
    animBeta.setEasingFunction(easing);

    this.scene.beginDirectAnimation(this.earthRoot, [animRotY, animRotX], 0, totalFrames, false);
    this.scene.beginDirectAnimation(this.camera, [animRadius, animAlpha, animBeta], 0, totalFrames, false);

    // Disparar el fundido del mapa 2D en el momento en que la Tierra ocupa todo el visor
    setTimeout(() => {
      if (onAtmosphereReached) onAtmosphereReached();
      if (this.onAtmosphericEntry) this.onAtmosphericEntry(lat, lon);
    }, 950);
  }

  public ascendToOrbit(durationMs = 1200) {
    this.isTransitioning = false;
    const fps = 60;
    const totalFrames = (durationMs / 1000) * fps;

    const animRadius = new BABYLON.Animation('ascendRad', 'radius', fps, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    animRadius.setKeys([{ frame: 0, value: this.camera.radius }, { frame: totalFrames, value: 8.5 }]);

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

  public resetToGlobalView() {
    this.ascendToOrbit(1000);
  }

  public zoomIn() {
    if (this.camera.radius <= 3.25) {
      this.triggerManualZoomDive();
    } else {
      const newRad = Math.max(2.92, this.camera.radius - 1.2);
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

  public getEarthRoot(): BABYLON.TransformNode {
    return this.earthRoot;
  }
}
