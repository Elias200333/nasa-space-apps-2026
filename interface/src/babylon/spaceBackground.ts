import * as BABYLON from 'babylonjs';

/**
 * Genera un entorno inmersivo de espacio profundo con estrellas 3D,
 * polvo estelar, nebulosas y banda galáctica de la Vía Láctea en BabylonJS.
 */
export class DeepSpaceEnvironment {
  private skyDome: BABYLON.Mesh;
  private starParticles: BABYLON.PointsCloudSystem;

  constructor(scene: BABYLON.Scene) {
    // 1. Cúpula estelar de fondo infinito (SkyDome invertido)
    this.skyDome = BABYLON.MeshBuilder.CreateSphere('deepSpaceDome', {
      diameter: 600,
      segments: 32,
      sideOrientation: BABYLON.Mesh.BACKSIDE
    }, scene);

    const skyMat = new BABYLON.StandardMaterial('deepSpaceMat', scene);
    skyMat.backFaceCulling = false;
    skyMat.disableLighting = true; // El espacio profundo es autoiluminado
    skyMat.emissiveTexture = this.generateDeepSpaceTexture(scene);
    this.skyDome.material = skyMat;

    // 2. Sistema de estrellas 3D con efecto de paralaje
    this.starParticles = new BABYLON.PointsCloudSystem('starCloud', 1, scene);
    const starCount = 2500;

    this.starParticles.addPoints(starCount, (particle) => {
      // Distribución esférica aleatoria en el espacio exterior
      const radius = 120 + Math.random() * 150;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);

      particle.position.x = radius * Math.sin(phi) * Math.cos(theta);
      particle.position.y = radius * Math.sin(phi) * Math.sin(theta);
      particle.position.z = radius * Math.cos(phi);

      // Color térmico astronómico de las estrellas (O, B, A, F, G, K, M)
      const starType = Math.random();
      if (starType > 0.85) {
        particle.color = new BABYLON.Color4(0.7, 0.85, 1.0, 0.95); // Azul/blanco brillante
      } else if (starType > 0.65) {
        particle.color = new BABYLON.Color4(1.0, 0.95, 0.8, 0.9);  // Blanco cálido
      } else if (starType > 0.4) {
        particle.color = new BABYLON.Color4(1.0, 0.8, 0.6, 0.85); // Naranja (tipo K)
      } else {
        particle.color = new BABYLON.Color4(0.85, 0.9, 1.0, 0.7);  // Blanco estándar
      }
    });

    this.starParticles.buildMeshAsync();

    // Rotación sutil y majestuosa del fondo cósmico
    scene.onBeforeRenderObservable.add(() => {
      this.skyDome.rotation.y += 0.00004;
      this.skyDome.rotation.x += 0.00002;
    });
  }

  /**
   * Genera proceduralmente el mapa del espacio profundo con nebulosas y Vía Láctea
   */
  private generateDeepSpaceTexture(scene: BABYLON.Scene): BABYLON.DynamicTexture {
    const width = 2048;
    const height = 1024;
    const tex = new BABYLON.DynamicTexture('deepSpaceTex', { width, height }, scene, false);
    const ctx = tex.getContext();

    // Fondo negro espacial absoluto
    ctx.fillStyle = '#02040a';
    ctx.fillRect(0, 0, width, height);

    // 1. Nebulosas y gas interestelar (gradientes suaves azul/púrpura/cian)
    const nebulae = [
      { x: 500, y: 350, r: 420, color1: 'rgba(24, 48, 89, 0.45)', color2: 'rgba(8, 20, 42, 0)' },
      { x: 1400, y: 650, r: 500, color1: 'rgba(54, 21, 74, 0.35)', color2: 'rgba(15, 6, 28, 0)' },
      { x: 1000, y: 250, r: 350, color1: 'rgba(14, 65, 85, 0.3)', color2: 'rgba(4, 18, 28, 0)' },
      { x: 300, y: 750, r: 400, color1: 'rgba(28, 38, 70, 0.35)', color2: 'rgba(6, 10, 24, 0)' }
    ];

    nebulae.forEach(n => {
      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      grad.addColorStop(0, n.color1);
      grad.addColorStop(0.6, n.color1.replace(/[\d\.]+\)$/, '0.15)'));
      grad.addColorStop(1, n.color2);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // 2. Banda de la Vía Láctea (diagonal sutil con miles de estrellas tenues)
    const mwGrad = ctx.createLinearGradient(0, height * 0.2, width, height * 0.8);
    mwGrad.addColorStop(0, 'rgba(0,0,0,0)');
    mwGrad.addColorStop(0.45, 'rgba(38, 55, 90, 0.18)');
    mwGrad.addColorStop(0.5, 'rgba(60, 85, 130, 0.28)');
    mwGrad.addColorStop(0.55, 'rgba(45, 60, 100, 0.18)');
    mwGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = mwGrad;
    ctx.fillRect(0, 0, width, height);

    // 3. Pintar estrellas estáticas de fondo (más de 1.800 estrellas con magnitudes)
    for (let i = 0; i < 2200; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const radius = Math.random() < 0.9 ? (0.4 + Math.random() * 0.9) : (1.4 + Math.random() * 1.6);
      const alpha = 0.3 + Math.random() * 0.7;

      // Color de estrella
      const randColor = Math.random();
      let color = `rgba(255, 255, 255, ${alpha})`;
      if (randColor > 0.85) color = `rgba(186, 230, 253, ${alpha})`; // Cian claro
      else if (randColor > 0.7) color = `rgba(254, 240, 138, ${alpha})`; // Dorado
      else if (randColor > 0.6) color = `rgba(254, 202, 178, ${alpha})`; // Rojizo tenue

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Brillo en cruz difuso para las estrellas más brillantes
      if (radius > 2.2) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.4})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(x - 5, y);
        ctx.lineTo(x + 5, y);
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x, y + 5);
        ctx.stroke();
      }
    }

    tex.update();
    return tex;
  }
}

