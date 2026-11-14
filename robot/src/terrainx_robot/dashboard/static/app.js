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
  const replay = !!(s.source && s.source.kind === "replay");
  const canControl = connected && !replay;            // en replay no hay robot que conducir
  renderExtras(s, replay);
  $("btn-arm").disabled = !canControl || armed;
  $("btn-cap-start").disabled = !connected || s.capture_state === "capturing";
  $("btn-cap-stop").disabled = s.capture_state !== "capturing";
  $("ctrl-badge").textContent = s.control_enabled ? "CONTROL ACTIVO" : "solo lectura";
  $("ctrl-badge").className = "badge " + (s.control_enabled ? "warn" : "");
}

// ---------------------------------------------------------------- estado del robot, replay, acumulado
const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v, d = 1, unit = "") => (v === null || v === undefined ? "no disponible" : Number(v).toFixed(d) + unit);
const STATE_TXT = { ok: "ok", stale: "parado", no_data: "sin datos" };
const EVIDENCE_TXT = { robot_measured: "medido por el robot", synthetic_test: "SINTÉTICO (demo)",
  derived: "derivado", orbital_nasa: "orbital NASA" };

function renderExtras(s, replay) {
  window.terrainxStatus = s;          // el visor LiDAR (lidarView.js) lo lee para etiquetar el origen
  const d = s.robot_details || {};
  const b = d.battery || {}, l = d.lidar || {}, st = d.settings || {};

  // Origen de los datos (arriba): robot en vivo, replay o nada
  const src = s.source || { kind: "none" };
  const sb = $("src-badge");
  if (src.kind === "replay") {
    sb.textContent = `REPLAY · ${EVIDENCE_TXT[src.evidence_class] || src.evidence_class}`;
    sb.className = "badge " + (src.demo ? "demo" : "replay");
  } else if (src.kind === "live") { sb.textContent = "ROBOT EN VIVO"; sb.className = "badge live"; }
  else { sb.textContent = "sin fuente"; sb.className = "badge"; }
  $("btn-connect").disabled = replay;
  if (replay) $("cam-overlay").textContent = "Replay: las sesiones grabadas no incluyen vídeo";
  else $("cam-overlay").textContent = "Sin señal — conecta el robot";

  // Batería: aviso arriba si está baja (solo con datos)
  const alert = $("batt-alert");
  if (b.level === "low" || b.level === "critical") {
    alert.hidden = false;
    alert.className = "alert" + (b.level === "critical" ? " critical" : "");
    alert.textContent = replay
      ? `Replay: la grabación marca batería ${b.level === "critical" ? "crítica" : "baja"} (${num(b.soc_pct, 0, " %")})`
      : (b.level === "critical" ? "⚠ BATERÍA CRÍTICA " : "⚠ Batería baja ") + num(b.soc_pct, 0, " %") +
        (b.level === "critical" ? " — no hagas pruebas de movimiento" : " — termina la prueba y carga");
  } else alert.hidden = true;
  const lvl = { ok: "lvl-ok", low: "lvl-low", critical: "lvl-critical" }[b.level] || "";
  $("t-batt").className = lvl;
  $("h-soc").textContent = num(b.soc_pct, 0, " %"); $("h-soc").className = lvl;
  $("h-volt").textContent = num(b.power_v, 2, " V");
  $("h-cur").textContent = num(b.current_raw, 0);
  $("h-cyc").textContent = num(b.cycles, 0);
  $("h-temp").textContent = (b.bms_temp_raw || b.mcu_temp_raw)
    ? `${(b.bms_temp_raw || ["—"]).join(" / ")} · ${(b.mcu_temp_raw || ["—"]).join(" / ")}` : "no disponible";
  $("health-badge").textContent = src.kind === "replay" ? "replay" : (s.connected ? "en vivo" : "—");
  $("health-badge").className = "badge " + (src.kind === "replay" ? "replay" : (s.connected ? "live" : ""));

  // LiDAR y ajustes del robot
  $("h-dirty").textContent = num(l.dirty_pct, 0, " %");
  $("h-loss").textContent = (l.cloud_packet_loss_pct == null && l.imu_packet_loss_pct == null) ? "no disponible"
    : `${num(l.cloud_packet_loss_pct, 0, " %")} · ${num(l.imu_packet_loss_pct, 0, " %")}`;
  $("h-lerr").textContent = l.error_state_raw == null ? "no disponible" : String(l.error_state_raw);
  $("h-lfw").textContent = l.firmware_version || "no disponible";
  $("h-avoid").textContent = st.obstacle_avoidance == null ? "no disponible"
    : (st.obstacle_avoidance ? "activada" : "desactivada");

  // Flujos de datos
  const tb = $("h-topics").querySelector("tbody"); tb.innerHTML = "";
  (d.topics || []).forEach((t) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${esc(t.topic)}</td><td>${t.rate_hz == null ? "—" : Number(t.rate_hz).toFixed(1)}</td>` +
      `<td>${t.age_s == null ? "—" : Number(t.age_s).toFixed(1) + " s"}</td>` +
      `<td class="st-${t.state}">${STATE_TXT[t.state] || t.state}</td>`;
    tb.appendChild(tr);
  });

  // Mapa acumulado
  const sl = s.slam || {};
  $("slam-info").textContent = `Acumulado — ${EVIDENCE_TXT[sl.evidence_class] || sl.evidence_class}: ` +
    `${num(sl.area, 1, " m²")} · ${sl.frames || 0} mapas sumados · ${(sl.voxels || 0).toLocaleString("es-ES")} vóxeles` +
    (sl.errors ? ` · ${sl.errors} descartados` : "");
  $("btn-slam-save").disabled = !s.connected || !sl.voxels;

  // Replay
  $("btn-replay-stop").disabled = !replay;
  $("replay-badge").textContent = replay ? "reproduciendo" : "—";
  $("replay-badge").className = "badge " + (replay ? "replay" : "");
  $("replay-status").textContent = replay
    ? `Reproduciendo ${src.session_id} · pasadas completas: ${src.passes}${src.loop ? " (en bucle)" : ""}`
    : (s.connected ? "Robot conectado: desconéctalo para reproducir una sesión." : "Elige una sesión para reproducirla.");
  document.querySelectorAll(".rbtn").forEach((btn) => (btn.disabled = s.connected && !replay));
}

$("btn-slam-save").onclick = async () => {
  $("slam-save-status").textContent = "guardando…";
  try {
    const m = await api("/api/slam/save", { method: "POST" });
    $("slam-save-status").textContent = `guardado ${m.id} · ${m.point_count} puntos · ${m.evidence_class}${m.demo ? " (demo)" : ""}`;
  } catch (e) { $("slam-save-status").textContent = "error: " + e.message; }
  loadScans();
};

async function loadSessions() {
  let list; try { list = await api("/api/sessions"); } catch (e) { $("replay-status").textContent = "error: " + e.message; return; }
  const tb = $("sessions").querySelector("tbody"); tb.innerHTML = "";
  if (!list.length) {
    tb.innerHTML = `<tr><td colspan="4" class="note">No hay sesiones grabadas. Graba una con el robot: Capturas → marca
      «grabar sesión cruda» → Iniciar captura → muévelo → Detener y guardar.</td></tr>`;
    return;
  }
  list.forEach((x) => {
    const tr = document.createElement("tr");
    const kind = x.demo ? `<span class="badge demo">DEMO sintética</span>` : esc(EVIDENCE_TXT[x.evidence_class] || x.evidence_class);
    tr.innerHTML = `<td>${esc(x.session_id)}</td><td>${kind}</td>` +
      `<td>${x.duration_s == null ? "" : x.duration_s + " s · "}${x.lidar_records} mapas${x.size_mb == null ? "" : " · " + x.size_mb + " MB"}</td>` +
      `<td><button class="rbtn small" data-id="${esc(x.session_id)}">▶ Reproducir</button></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll(".rbtn").forEach((btn) => btn.onclick = async () => {
    $("replay-status").textContent = "verificando la sesión (SHA-256) y arrancando…";
    try {
      await api("/api/replay/start", { method: "POST", body: JSON.stringify({ session_id: btn.dataset.id, loop: $("replay-loop").checked }) });
    } catch (e) { $("replay-status").textContent = "error: " + e.message; }
    refresh();
  });
  refresh();
}
$("btn-sessions").onclick = loadSessions;
$("btn-replay-stop").onclick = async () => {
  try { await api("/api/replay/stop", { method: "POST" }); } catch (e) { $("replay-status").textContent = "error: " + e.message; }
  refresh();
};

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
    tr.innerHTML = `<td>${m.id}</td><td>${m.point_count}</td><td>${m.evidence_class}${m.demo ? " (demo)" : ""}` +
      `${m.delivery_mode === "replay" ? " · replay" : ""}</td>` +
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
// El visor (mapa como la app de Unitree, en vivo / acumulado) está en static/lidar/lidarView.js.

// ---------------------------------------------------------------- CONTROL WASD
let armed = false, ws = null, heartbeat = null;
const pressed = new Set();
// Niveles de velocidad (m/s, m/s, rad/s). El backend recorta además a sus topes
// (go2_webrtc.MAX_*), así que aunque aquí se suba algo, al robot no llega más.
const SPEED_LEVELS = {
  lento:  { vx: 0.3, vy: 0.25, yaw: 0.5 },   // el de antes
  normal: { vx: 0.6, vy: 0.4,  yaw: 1.0 },
  rapido: { vx: 1.0, vy: 0.5,  yaw: 1.5 },
};
let SPEED = SPEED_LEVELS.normal;
const KEYS = ["w", "a", "s", "d", "q", "e"];

function setSpeedLevel(level) {
  if (!SPEED_LEVELS[level]) return;
  SPEED = SPEED_LEVELS[level];
  document.querySelectorAll(".sbtn").forEach((b) => b.classList.toggle("active", b.dataset.level === level));
  $("speed-now").textContent = `avance ${SPEED.vx} m/s · lateral ${SPEED.vy} m/s · giro ${SPEED.yaw} rad/s`;
  sendDrive();   // si hay una tecla pulsada, la nueva velocidad se aplica ya
}
document.querySelectorAll(".sbtn").forEach((b) => b.onclick = () => { setSpeedLevel(b.dataset.level); b.blur(); });

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
setSpeedLevel("normal");
refresh(); loadScans(); loadSessions();
setInterval(refresh, 1000);
