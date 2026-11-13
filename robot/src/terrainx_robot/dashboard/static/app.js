"use strict";
// Dashboard del Go2 AIR. Toda la autenticación/credenciales viajan solo a
// 127.0.0.1; la clave AES nunca llega aquí (solo "configurada" + huella).

const $ = (id) => document.getElementById(id);
async function api(path, opts) {
  const r = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, opts || {}));
  const text = await r.text();
  const data = text ? JSON.parse(text) : {};
  if (!r.ok) throw new Error(typeof data.detail === "object" ? (data.detail.message || JSON.stringify(data.detail)) : (data.detail || r.statusText));
  return data;
}
const fmt = (v, unit = "") => (v === null || v === undefined ? "no disponible" : v + unit);

// ---------------------------------------------------------------- conexión
$("btn-connect").onclick = async () => {
  setConn("conectando…", "off");
  try {
    await api("/api/connect", { method: "POST" });
    $("cam").src = "/video/stream?" + Date.now();
  } catch (e) { setConn("error: " + e.message, "err"); }
  refresh();
};
$("btn-disconnect").onclick = async () => {
  await disarm();
  try { await api("/api/disconnect", { method: "POST" }); } catch (e) {}
  $("cam").removeAttribute("src");
  refresh();
};
function setConn(text, cls) { $("conn-text").textContent = text; $("dot").className = "dot " + cls; }

// ---------------------------------------------------------------- estado
async function refresh() {
  let s;
  try { s = await api("/api/status"); } catch (e) { setConn("sin servidor", "err"); return; }
  const connected = s.connected;
  setConn(connected ? (s.connection_state || "conectado") : "desconectado", connected ? "on" : (s.last_error ? "err" : "off"));

  // Cámara
  const v = s.video || {};
  $("cam-fps").textContent = "FPS: " + fmt(v.fps);
  $("cam-frames").textContent = "fotogramas: " + (v.frames || 0);
  $("cam-overlay").style.display = v.has_frame ? "none" : "flex";
  $("cam-badge").textContent = v.has_frame ? "en directo" : (connected ? "esperando vídeo…" : "—");
  $("cam-badge").className = "badge " + (v.has_frame ? "live" : "");

  // Telemetría
  const t = s.telemetry || {};
  $("t-conn").textContent = connected ? (s.connection_state) : "desconectado";
  $("t-batt").textContent = fmt(t.battery_soc_pct, " %");
  $("t-volt").textContent = fmt(t.power_v, " V");
  $("t-imu").textContent = t.imu_rpy_raw ? t.imu_rpy_raw.map((x) => x.toFixed(2)).join(", ") + "  (sin unidad verificada)" : "no disponible";
  $("t-pos").textContent = t.position_raw ? t.position_raw.map((x) => x.toFixed(2)).join(", ") : "no disponible";
  $("t-lidar").textContent = connected ? ((s.lidar_frames || 0) + " frames" + (s.lidar_decode_errors ? ", " + s.lidar_decode_errors + " con error" : "")) : "—";
  $("t-video").textContent = v.has_frame ? "recibiendo" : (connected ? "sin señal" : "—");

  // Diagnóstico
  $("d-ip").textContent = (s.ip || "(sin IP)") + " / " + (s.method || "—");
  $("d-auth").textContent = s.aes_key_configured ? ("clave configurada (" + (s.aes_key_fingerprint || "") + ")") : "clave no configurada";
  $("d-video").textContent = (s.connection_info && s.connection_info.video) || (v.has_frame ? "recibiendo" : "—");
  $("d-lidar").textContent = s.connection_info && s.connection_info.lidar_switch || "—";
  $("d-guard").textContent = s.control_enabled ? "MODO CONTROL" : "solo lectura";
  $("d-lib").textContent = s.library_version || "—";
  $("d-err").textContent = s.last_error || "ninguno";
  $("d-model").textContent = "Unitree Go2 " + (s.model_variant && s.model_variant !== "unknown" ? s.model_variant : "(modelo sin declarar)");

  // Autenticación
  $("auth-status").textContent = "Clave AES: " + (s.aes_key_configured ? "configurada · " + (s.aes_key_fingerprint || "") : "no configurada");

  // Control / límites
  const lim = s.speed_limits || {};
  $("limits").textContent = `Topes: avance ${lim.vx_ms} m/s · lateral ${lim.vy_ms} m/s · giro ${lim.yaw_rps} rad/s`;
  const canControl = connected;
  $("btn-arm").disabled = !canControl || armed;
  $("btn-cap-start").disabled = !connected || s.capture_state === "capturing";
  $("btn-cap-stop").disabled = s.capture_state !== "capturing";
  $("ctrl-badge").textContent = s.control_enabled ? "CONTROL ACTIVO" : "solo lectura";
  $("ctrl-badge").className = "badge " + (s.control_enabled ? "warn" : "");
}

// ---------------------------------------------------------------- capturas
$("btn-cap-start").onclick = async () => {
  try { await api("/api/capture/start", { method: "POST", body: JSON.stringify({ record_session: $("cap-record").checked }) }); $("cap-status").textContent = "capturando…"; }
  catch (e) { $("cap-status").textContent = "error: " + e.message; }
  refresh();
};
$("btn-cap-stop").onclick = async () => {
  $("cap-status").textContent = "procesando…";
  try { const m = await api("/api/capture/stop", { method: "POST" }); $("cap-status").textContent = `guardado ${m.id} · ${m.point_count} puntos`; }
  catch (e) { $("cap-status").textContent = "error: " + e.message; }
  loadScans(); refresh();
};
async function loadScans() {
  let scans; try { scans = await api("/api/scans"); } catch (e) { return; }
  const tb = $("scans").querySelector("tbody"); tb.innerHTML = "";
  scans.slice().reverse().forEach((m) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${m.id}</td><td>${m.point_count}</td><td>${m.evidence_class}${m.demo ? " (demo)" : ""}</td>` +
      `<td><a href="/api/scans/${m.id}/download">PLY</a></td>`;
    tb.appendChild(tr);
  });
}

// ---------------------------------------------------------------- autenticación
let selectedSN = null;
$("btn-devices").onclick = async () => {
  const email = $("au-email").value.trim(), password = $("au-pass").value;
  $("dev-list").innerHTML = "<span class='note'>consultando…</span>";
  try {
    const r = await api("/api/auth/devices", { method: "POST", body: JSON.stringify({ email, password }) });
    $("au-pass").value = "";
    $("dev-list").innerHTML = "";
    if (!r.devices.length) { $("dev-list").innerHTML = "<span class='note'>sin robots en la cuenta</span>"; return; }
    r.devices.forEach((d) => {
      const el = document.createElement("label"); el.className = "dev";
      el.innerHTML = `<input type="radio" name="dev" value="${d.sn}"> <b>${d.alias}</b> <small>SN ${d.sn} · ${d.series} · ${d.online ? "en línea" : "desconectado"} · ${d.has_key ? "clave disponible" : "sin clave"}</small>`;
      el.querySelector("input").onchange = () => { selectedSN = d.sn; $("btn-fetch").disabled = false; };
      $("dev-list").appendChild(el);
    });
  } catch (e) { $("dev-list").innerHTML = "<span class='note'>error: " + e.message + "</span>"; }
};
$("btn-fetch").onclick = async () => {
  if (!selectedSN) return;
  const email = $("au-email").value.trim(), password = $("au-pass").value;
  try {
    const r = await api("/api/auth/fetch-key", { method: "POST", body: JSON.stringify({ email, password, serial: selectedSN }) });
    $("au-pass").value = "";
    $("auth-status").textContent = "Clave AES: configurada · " + (r.fingerprint || "");
  } catch (e) { $("auth-status").textContent = "error: " + e.message; }
  refresh();
};

// ---------------------------------------------------------------- LiDAR 3D
let three = null;
function initLidar() {
  const host = $("lidar-canvas");
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x060a10);
  const camera = new THREE.PerspectiveCamera(60, host.clientWidth / host.clientHeight, 0.05, 500);
  camera.position.set(4, 4, 4);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(host.clientWidth, host.clientHeight); host.appendChild(renderer.domElement);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  scene.add(new THREE.AxesHelper(1));                // 1 m en cada eje
  scene.add(new THREE.GridHelper(10, 20, 0x223044, 0x15202e));
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
  const points = new THREE.Points(geom, new THREE.PointsMaterial({ color: 0x38bdf8, size: 0.03 }));
  scene.add(points);
  three = { scene, camera, renderer, controls, geom, points };
  (function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); })();
  window.addEventListener("resize", () => {
    camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight);
  });
}
async function updateLidar() {
  if (!three) return;
  let d; try { d = await api("/api/lidar"); } catch (e) { return; }
  $("lidar-count").textContent = d.available ? `${d.point_count} puntos (${d.shown} mostrados)` : "0 puntos";
  $("lidar-badge").textContent = d.available ? (d.point_type || "") : "—";
  $("lidar-badge").className = "badge " + (d.evidence_class === "robot_measured" ? "live" : "warn");
  if (d.available && d.points && d.points.length) {
    const arr = new Float32Array(d.points);
    three.geom.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    three.geom.attributes.position.needsUpdate = true;
    three.geom.setDrawRange(0, arr.length / 3);
    three.geom.computeBoundingSphere();
  }
}
$("lidar-refresh").onclick = updateLidar;

// ---------------------------------------------------------------- CONTROL WASD
let armed = false, ws = null, heartbeat = null;
const pressed = new Set();
const SPEED = { vx: 0.3, vy: 0.25, yaw: 0.5 };   // dentro de los topes del backend
const KEYS = ["w", "a", "s", "d", "q", "e"];

function velocity() {
  let vx = 0, vy = 0, yaw = 0;
  if (pressed.has("w")) vx += SPEED.vx;
  if (pressed.has("s")) vx -= SPEED.vx;
  if (pressed.has("q")) vy += SPEED.vy;
  if (pressed.has("e")) vy -= SPEED.vy;
  if (pressed.has("a")) yaw += SPEED.yaw;
  if (pressed.has("d")) yaw -= SPEED.yaw;
  return { vx, vy, yaw };
}
function sendDrive() {
  if (!armed || !ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify(Object.assign({ type: "drive" }, velocity())));
}
function highlight() {
  document.querySelectorAll(".key").forEach((k) => k.classList.toggle("active", pressed.has(k.dataset.k)));
}
function onKey(down) {
  return (e) => {
    if (!armed) return;
    const k = e.key.toLowerCase();
    if (!KEYS.includes(k) && k !== " ") return;
    e.preventDefault();
    if (k === " ") { pressed.clear(); if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "stop" })); highlight(); return; }
    if (down) pressed.add(k); else pressed.delete(k);
    highlight(); sendDrive();
  };
}

$("btn-arm").onclick = async () => {
  if (!confirm("¿Habilitar la conducción del robot físico?\n\nEl Go2 se moverá con WASD mientras mantengas la tecla pulsada. Asegúrate de que hay espacio libre y alguien junto al paro de emergencia.")) return;
  try { await api("/api/control/arm", { method: "POST" }); } catch (e) { alert("No se pudo habilitar: " + e.message); return; }
  armed = true;
  ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws/control");
  ws.onclose = () => { if (armed) disarm(); };
  heartbeat = setInterval(sendDrive, 100);   // también es la señal de hombre muerto
  $("btn-disarm").disabled = false; $("btn-stop").disabled = false;
  document.querySelectorAll(".pbtn").forEach((b) => (b.disabled = false));
  refresh();
};
async function disarm() {
  if (!armed) return;
  armed = false; pressed.clear(); highlight();
  if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
  if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify({ type: "stop" })); } catch (e) {} ws.close(); }
  ws = null;
  try { await api("/api/control/disarm", { method: "POST" }); } catch (e) {}
  $("btn-disarm").disabled = true; $("btn-stop").disabled = true;
  document.querySelectorAll(".pbtn").forEach((b) => (b.disabled = true));
  refresh();
}
$("btn-disarm").onclick = disarm;
$("btn-stop").onclick = () => { pressed.clear(); highlight(); if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "stop" })); };
document.querySelectorAll(".pbtn").forEach((b) => b.onclick = () => {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "posture", command: b.dataset.cmd }));
});
window.addEventListener("keydown", onKey(true));
window.addEventListener("keyup", onKey(false));
window.addEventListener("blur", () => { if (armed) { pressed.clear(); highlight(); sendDrive(); } });  // soltar el foco detiene

// ---------------------------------------------------------------- arranque
initLidar();
refresh(); loadScans();
setInterval(refresh, 1000);
setInterval(() => { if ($("lidar-auto").checked) updateLidar(); }, 1200);
