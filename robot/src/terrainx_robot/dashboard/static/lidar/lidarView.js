// Visor LiDAR 3D del dashboard, como la app de Unitree: el mapa de vóxeles del perro con la
// paleta y las aristas de la app («En vivo») o el mapa SLAM que va juntando el dashboard con
// todo lo que ha visto («Acumulado»). El trabajo pesado va en LidarMapEngine / SlamMapEngine
// + Web Workers.
//
// Origen: port a JS sin React de Lidar3DView.jsx del visor LiDAR «Bridge» aportado al equipo
// (2026-11-14). Se ha quitado A PROPÓSITO:
//   · «Ir aquí», waypoints y patrulla (clic en el suelo): harían que el perro se moviera
//     solo; este dashboard solo permite conducción WASD con hombre muerto.
//   · El modelo 3D del Go2 (go2Model, archivo GLB): se usa el perro de bloques del original.
//   · La capa de ruta (routeLayer) y los stores de React (aquí, un objeto `ui`).
// Cambiado (TERRAIN-X): el botón de descarga abre un menú (modelo 3D .glb, que se ve igual que
// este visor, o array de coordenadas .json) y GUARDA el mapa SLAM acumulado en el dashboard
// (POST /api/slam/save: PLY malla + GLB + coordenadas + metadatos + SHA-256). La pausa también
// congela el acumulado en el dashboard (no suma mapas): así lo que se ve es lo que se guarda, y
// las dos descargas salen del mismo escaneo. Sustituyen al antiguo panel «Capturas y datos».
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { getLidarEngine } from './LidarMapEngine.js'
import { getSlamEngine } from './SlamMapEngine.js'
import { TerrainxLidarSource } from './TerrainxLidarSource.js'

const BG = 0x26272b   // gris oscuro, como la app de Unitree

// Perro de bloques (Go2: ~0,7 × 0,3 × 0,4 m), mirando hacia +X (copiado del original)
function createDog() {
  const dog = new THREE.Group()
  const shell = new THREE.MeshStandardMaterial({ color: 0xe4e6ea, emissive: 0x2a2c30, metalness: 0.2, roughness: 0.5 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x3b3f46, metalness: 0.2, roughness: 0.7 })
  const box = (w, d, h, x, y, z, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), mat)
    m.position.set(x, y, z)
    dog.add(m)
  }
  box(0.5, 0.22, 0.12, 0, 0, 0.31, shell)            // cuerpo
  box(0.15, 0.19, 0.11, 0.29, 0, 0.33, shell)        // cabeza
  box(0.02, 0.13, 0.05, 0.37, 0, 0.33, dark)         // cara (cámara)
  for (const sx of [0.19, -0.19]) {
    for (const sy of [0.13, -0.13]) {
      box(0.07, 0.05, 0.15, sx, sy, 0.22, dark)      // muslo
      box(0.04, 0.04, 0.16, sx + 0.03, sy, 0.09, shell)   // pierna
    }
  }
  return dog
}

// Iconos (trazos simples, 24 × 24)
const ICON = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
}
const svg = (name) => `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
  stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`

function el(tag, cls, parent) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (parent) parent.appendChild(e)
  return e
}

function darkButton(parent, label, icon, onClick) {
  const b = el('button', 'lv-btn', parent)
  b.type = 'button'
  b.title = label
  b.setAttribute('aria-label', label)
  b.innerHTML = svg(icon)
  b.addEventListener('click', () => { onClick(); b.blur() })   // sin foco: Espacio no lo «pulsa»
  return b
}

/** Monta el visor en `mount`. onStats({ mode, voxels, fps, receiving, paused }) cada 500 ms */
export function mountLidarView(mount, { onStats } = {}) {
  const engine = getLidarEngine()
  const slam = getSlamEngine()
  const ui = { mode: 'live', paused: false, follow: true }
  const slamMode = () => ui.mode === 'slam'
  const floorZ = () => (slamMode() ? slam.floorZ(engine.pose) : engine.floorZ())

  // ── Escena ──
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearColor(BG, 1)
  renderer.domElement.className = 'lv-canvas'
  mount.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(BG, 25, 90)            // la cuadrícula se pierde a lo lejos
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 400)
  camera.up.set(0, 0, 1)                           // Z hacia arriba, como el robot
  scene.add(new THREE.AmbientLight(0xffffff, 1.2))
  const sun = new THREE.DirectionalLight(0xffffff, 1.6)
  sun.position.set(3, -4, 8)
  scene.add(sun)

  // Suelo: cuadrícula de 1 m en el plano XY
  const grid = new THREE.GridHelper(200, 200, 0x8a8d94, 0x55585f)
  grid.rotation.x = Math.PI / 2
  grid.material.transparent = true
  grid.material.opacity = 0.6
  scene.add(grid)

  scene.add(engine.mesh)
  scene.add(slam.group)
  const dog = createDog()
  dog.visible = false
  scene.add(dog)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.screenSpacePanning = false             // desplazar = moverse por el suelo
  controls.minDistance = 0.8
  controls.maxDistance = 150
  controls.maxPolarAngle = Math.PI * 0.495        // sin meterse bajo el suelo

  // Vista inicial: detrás del robot y desde arriba (como en la app)
  const place = () => {
    const p = engine.pose
    const yaw = p?.yaw ?? 0
    controls.target.set(p?.x ?? 0, p?.y ?? 0, floorZ())
    camera.position.copy(controls.target).add(new THREE.Vector3(-Math.cos(yaw) * 4.5, -Math.sin(yaw) * 4.5, 4))
    controls.update()
  }
  place()

  // Seguir al robot (como la app): la cámara va DETRÁS del robot y gira con él. Se respetan
  // la distancia y la altura que elija el usuario; el giro horizontal lo marca el rumbo.
  const followRobot = () => {
    const p = engine.pose
    if (!p) return
    const target = new THREE.Vector3(p.x, p.y, floorZ())
    const off = camera.position.clone().sub(controls.target)
    const r = off.length() || 6
    const polar = Math.acos(THREE.MathUtils.clamp(off.z / r, -1, 1))       // desde la vertical
    const az = (p.yaw ?? 0) + Math.PI                                       // detrás del robot
    controls.target.copy(target)
    camera.position.set(
      target.x + r * Math.sin(polar) * Math.cos(az),
      target.y + r * Math.sin(polar) * Math.sin(az),
      target.z + r * Math.cos(polar),
    )
  }
  const zoom = (f) => {
    const off = camera.position.clone().sub(controls.target).multiplyScalar(f)
    off.setLength(THREE.MathUtils.clamp(off.length(), controls.minDistance, controls.maxDistance))
    camera.position.copy(controls.target).add(off)
  }

  // ── Tamaño ──
  const resize = () => {
    const w = mount.clientWidth, h = mount.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(mount)
  resize()

  // ── Datos del robot ──
  const source = new TerrainxLidarSource()
  const offCloud = source.onPointCloud((f) => engine.ingest(f))
  let placed = !!engine.pose
  const offPose = source.onPose((p) => {
    engine.setPose(p)
    if (!placed) { placed = true; place() }
  })
  const offSlam = source.onSlamChunk((head, payload) => slam.ingest(head, payload))
  const offInfo = source.onSlamInfo((info) => slam.setInfo(info))
  source.connect()
  // Al pedir el acumulado, el dashboard lo manda entero: lo que hubiera aquí se tira
  let asked = null
  const stream = () => {
    if (ui.mode === asked) return
    asked = ui.mode
    if (asked === 'slam') slam.clear()
    source.setStreaming(true, ui.mode)
  }
  stream()

  // ── Controles sobre el mapa ──
  // Arriba a la izquierda: «En vivo» (el mapa del perro, como la app) o «Acumulado» (SLAM)
  const seg = el('div', 'lv-seg', mount)
  seg.setAttribute('role', 'radiogroup')
  seg.setAttribute('aria-label', 'Mapa')
  const MODES = [
    { id: 'live', label: 'En vivo', title: 'El mapa del perro tal cual: solo lo que tiene alrededor (como la app)' },
    { id: 'slam', label: 'Acumulado', title: 'Mapa SLAM: se va juntando todo lo que el perro ha visto (derivado)' },
  ]
  const modeButtons = MODES.map((m) => {
    const b = el('button', 'lv-seg-btn', seg)
    b.type = 'button'
    b.textContent = m.label
    b.title = m.title
    b.setAttribute('role', 'radio')
    b.addEventListener('click', () => { if (ui.mode !== m.id) { ui.mode = m.id; stream(); render() } b.blur() })
    return { b, id: m.id }
  })

  // Arriba a la derecha: borrar el acumulado (con confirmación), congelar, guardar y descargar
  const top = el('div', 'lv-top', mount)
  let confirmClear = false, confirmTimer = null
  const clearBtn = darkButton(top, 'Borrar el mapa acumulado', 'trash', () => {
    if (!confirmClear) {
      confirmClear = true
      clearTimeout(confirmTimer)
      confirmTimer = setTimeout(() => { confirmClear = false; render() }, 4000)   // «¿Borrar?» dura unos segundos
      render()
      return
    }
    confirmClear = false
    clearTimeout(confirmTimer)
    source.send('SLAM_RESET')
    render()
  })
  const pauseBtn = darkButton(top, 'Congelar el mapa', 'pause', () => {
    ui.paused = !ui.paused
    // En vivo se congela aquí; el acumulado lo congela el dashboard (deja de sumar mapas), así
    // que este visor sigue mostrando justo lo que se guardaría, también al cambiar de modo
    engine.paused = ui.paused
    source.setPaused(ui.paused)
    render()
  })
  // TERRAIN-X: el botón de descarga abre un menú: modelo 3D (.glb, se ve como este visor) o array
  // de coordenadas (.json, centro de cada cubo). Las dos opciones guardan el mapa ACUMULADO en el
  // dashboard (PLY malla + GLB + coordenadas + metadatos, en runtime/scans); si el mapa no ha
  // cambiado desde el último guardado, el dashboard devuelve ese mismo escaneo. Se pasa a
  // «Acumulado» para que lo que se ve sea lo que se guarda.
  const toastEl = el('div', 'lv-toast', mount)
  toastEl.style.display = 'none'
  let toastTimer = null, saving = false
  const toast = (text, err = false, ms = 9000) => {
    clearTimeout(toastTimer)
    toastEl.textContent = text
    toastEl.classList.toggle('err', err)
    toastEl.style.display = ''
    if (ms) toastTimer = setTimeout(() => { toastEl.style.display = 'none' }, ms)
  }
  const DOWNLOADS = [
    { format: 'glb', ext: '.glb', doing: 'Se descarga el .glb', label: 'Modelo 3D (.glb)', hint: 'se ve como aquí' },
    { format: 'coords', ext: '.coords.json', doing: 'Se descargan las coordenadas', label: 'Coordenadas (.json)',
      hint: '[x, y, z] en m del centro de cada cubo' },
  ]
  const menu = el('div', 'lv-menu', mount)
  menu.style.display = 'none'
  menu.setAttribute('role', 'menu')
  for (const d of DOWNLOADS) {
    const item = el('button', 'lv-menu-item', menu)
    item.type = 'button'
    item.setAttribute('role', 'menuitem')
    item.innerHTML = `${d.label}<small>${d.hint}</small>`
    item.addEventListener('click', () => { item.blur(); showMenu(false); saveAndDownload(d) })
  }
  el('div', 'lv-menu-note', menu).textContent =
    'Se guarda todo en runtime/scans. Con el mapa en pausa, las dos descargas salen del mismo escaneo.'
  const downloadBtn = darkButton(top, 'Guardar el mapa acumulado y descargar: modelo 3D (.glb) o coordenadas (.json)',
    'download', () => showMenu(menu.style.display === 'none'))
  function showMenu(on) {
    menu.style.display = on ? '' : 'none'
    downloadBtn.classList.toggle('active', on)
    if (on) toastEl.style.display = 'none'
  }
  // El menú se cierra al pulsar fuera o con Escape
  const onDocDown = (e) => {
    if (menu.style.display !== 'none' && !menu.contains(e.target) && !downloadBtn.contains(e.target)) showMenu(false)
  }
  const onDocKey = (e) => { if (e.key === 'Escape') showMenu(false) }
  document.addEventListener('pointerdown', onDocDown)
  document.addEventListener('keydown', onDocKey)

  async function saveAndDownload(d) {
    if (saving) return
    if (ui.mode !== 'slam') { ui.mode = 'slam'; stream(); render() }
    saving = true
    toast('Guardando el mapa acumulado…', false, 0)
    try {
      const r = await fetch('/api/slam/save', { method: 'POST' })
      const m = await r.json().catch(() => ({}))
      if (!r.ok) { toast(typeof m.detail === 'string' ? m.detail : 'No se pudo guardar el mapa.', true); return }
      const a = Object.assign(document.createElement('a'), {
        href: `/api/scans/${encodeURIComponent(m.id)}/download?format=${d.format}`,
        download: `${m.id}${d.ext}`,
      })
      a.click()
      const n = (m.provenance?.mesh?.voxels ?? 0).toLocaleString('es-ES')
      toast(m.reused
        ? `Sin cambios desde el último guardado: ${d.doing.toLowerCase()} de ese mismo escaneo (${m.id}).`
        : `Guardado ${m.id}: ${n} vóxeles. ${d.doing}; el .ply, el .glb, las coordenadas y los ` +
          'metadatos quedan en runtime/scans.')
    } catch (e) {
      toast('Sin respuesta del dashboard: no se pudo guardar.', true)
    } finally {
      saving = false
    }
  }

  // Abajo a la derecha: acercar, alejar, seguir al robot
  const zoomBox = el('div', 'lv-zoom', mount)
  darkButton(zoomBox, 'Acercar', 'plus', () => zoom(0.8))
  darkButton(zoomBox, 'Alejar', 'minus', () => zoom(1.25))
  const followBtn = darkButton(zoomBox, 'Centrar y seguir al robot', 'locate', () => {
    if (!ui.follow) followRobot()
    ui.follow = !ui.follow
    render()
  })

  // Abajo a la izquierda: estado del LiDAR
  const status = el('div', 'lv-status', mount)

  function render() {
    for (const { b, id } of modeButtons) {
      b.classList.toggle('active', ui.mode === id)
      b.setAttribute('aria-checked', String(ui.mode === id))
    }
    clearBtn.style.display = slamMode() ? '' : 'none'
    clearBtn.classList.toggle('danger', confirmClear)
    clearBtn.innerHTML = confirmClear ? '¿Borrar?' : svg('trash')
    clearBtn.title = confirmClear ? 'Pulsa otra vez para borrar el mapa acumulado' : 'Borrar el mapa acumulado'
    pauseBtn.innerHTML = svg(ui.paused ? 'play' : 'pause')
    pauseBtn.title = ui.paused ? 'Reanudar el mapa (vuelve a sumar mapas del perro)'
      : 'Congelar el mapa (el acumulado deja de sumar: lo que ves es lo que se guarda)'
    pauseBtn.classList.toggle('active', ui.paused)
    followBtn.classList.toggle('active', ui.follow)
    followBtn.title = ui.follow ? 'Siguiendo al robot (pulsa para mover la cámara libre)' : 'Centrar y seguir al robot'
  }
  render()

  // ── Dibujo (independiente de la llegada de datos) ──
  let raf
  let frames = 0
  let fps = 0
  let fpsT = performance.now()
  const tick = () => {
    raf = requestAnimationFrame(tick)
    controls.enablePan = !ui.follow
    if (ui.follow) followRobot()
    controls.update()
    const floor = floorZ()
    const acc = slamMode()
    engine.mesh.visible = !acc && engine.voxels > 0
    slam.group.visible = acc
    grid.position.z = floor - 0.03
    const p = engine.pose
    if (p) {
      dog.visible = true
      dog.rotation.z = p.yaw || 0
      dog.position.set(p.x, p.y, floor)               // sobre los vóxeles del suelo
    }
    renderer.render(scene, camera)
    frames++
    const now = performance.now()
    if (now - fpsT >= 500) {
      fps = Math.round((frames * 1000) / (now - fpsT))
      frames = 0
      fpsT = now
    }
  }
  tick()

  const statsTimer = setInterval(() => {
    const acc = slamMode()
    const st = (acc ? slam : engine).stats(fps)
    let text = null
    if (!st.receiving) text = 'Esperando datos del LiDAR…'
    else if (ui.paused) text = 'Mapa congelado'
    else if (acc && !st.voxels) text = 'Acumulando… mueve el perro para ir llenando el mapa'
    status.textContent = text ?? ''
    status.style.display = text ? '' : 'none'
    onStats?.({ mode: ui.mode, paused: ui.paused, ...st })
  }, 500)

  return () => {
    cancelAnimationFrame(raf)
    clearInterval(statsTimer)
    clearTimeout(confirmTimer)
    clearTimeout(toastTimer)
    document.removeEventListener('pointerdown', onDocDown)
    document.removeEventListener('keydown', onDocKey)
    source.disconnect()
    offCloud(); offPose(); offSlam(); offInfo()
    ro.disconnect()
    controls.dispose()
    scene.remove(engine.mesh)
    engine.releaseGpu()
    scene.remove(slam.group)
    slam.releaseGpu()
    dog.traverse((o) => { o.geometry?.dispose(); o.material?.dispose() })
    grid.geometry.dispose()
    grid.material.dispose()
    renderer.dispose()
    mount.replaceChildren()
  }
}

// ── Arranque en el dashboard: panel «LiDAR 3D» ──
const host = document.getElementById('lidar-canvas')
if (host) {
  const $ = (id) => document.getElementById(id)
  const NOTE = {
    live: 'En vivo: vóxeles ocupados que publica el robot (ventana de ~6,4 m, 5 cm, marco odom). '
      + 'Dato MEDIDO. Unidades: metros asumidos.',
    slam: 'Acumulado: unión filtrada de los mapas del robot (un vóxel cuenta si sale en varios mapas). '
      + 'Dato DERIVADO, sin cierre de bucles: la deriva de la odometría puede desplazar paredes.',
  }
  // El origen de los datos lo pone app.js (window.terrainxStatus, de /api/status): el visor no
  // debe llamar «medido» a una sesión SINTÉTICA reproducida.
  const EVIDENCE = { robot_measured: 'medido', synthetic_test: 'SINTÉTICO (demo)', derived: 'derivado' }
  mountLidarView(host, {
    onStats: ({ mode, voxels, fps, receiving }) => {
      const st = window.terrainxStatus || {}
      const src = st.source || {}
      const replay = src.kind === 'replay'
      const slamEv = st.slam?.evidence_class
      $('lidar-count').textContent = receiving
        ? `${voxels.toLocaleString('es-ES')} vóxeles · ${fps} fps` : 'sin datos'
      let badge, cls
      if (mode === 'slam') {
        badge = `acumulado · ${EVIDENCE[slamEv] || 'derivado'}${replay ? ' · replay' : ''}`
        cls = slamEv === 'synthetic_test' ? 'demo' : 'warn'
      } else if (replay) {
        badge = `replay · ${EVIDENCE[src.evidence_class] || src.evidence_class}`
        cls = src.demo ? 'demo' : 'replay'
      } else {
        badge = 'en vivo · medido'
        cls = 'live'
      }
      $('lidar-badge').textContent = badge
      $('lidar-badge').className = 'badge ' + cls
      $('lidar-note').textContent = replay
        ? `REPLAY de la sesión ${src.session_id}: los mapas se reproducen tal como se grabaron. ` + NOTE[mode]
        : NOTE[mode]
    },
  })
}
