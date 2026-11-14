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
  stopNow();      // el servidor además para y vuelve a solo lectura al desconectar
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
  renderAuth(s);

  // Control / límites
  const lim = s.speed_limits || {};
  $("limits").textContent = `Topes: avance ${lim.vx_ms} m/s · lateral ${lim.vy_ms} m/s · giro ${lim.yaw_rps} rad/s`;
  renderExtras(s);
  renderControl(!!s.control_available);
}

// ---------------------------------------------------------------- estado del robot, acumulado
const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v, d = 1, unit = "") => (v === null || v === undefined ? "no disponible" : Number(v).toFixed(d) + unit);
const STATE_TXT = { ok: "ok", stale: "parado", no_data: "sin datos" };
const EVIDENCE_TXT = { robot_measured: "medido por el robot", synthetic_test: "SINTÉTICO (demo)",
  derived: "derivado", orbital_nasa: "orbital NASA" };

function renderExtras(s) {
  window.terrainxStatus = s;          // el visor LiDAR (lidarView.js) lo lee para etiquetar el origen
  const d = s.robot_details || {};
  const b = d.battery || {}, l = d.lidar || {}, st = d.settings || {};

  // Origen de los datos (arriba): robot en vivo o nada
  const live = !!(s.source && s.source.kind === "live");
  $("src-badge").textContent = live ? "ROBOT EN VIVO" : "sin robot";
  $("src-badge").className = "badge" + (live ? " live" : "");

  // Batería: aviso arriba si está baja (solo con datos)
  const alert = $("batt-alert");
  if (b.level === "low" || b.level === "critical") {
    alert.hidden = false;
    alert.className = "alert" + (b.level === "critical" ? " critical" : "");
    alert.textContent = (b.level === "critical" ? "⚠ BATERÍA CRÍTICA " : "⚠ Batería baja ") + num(b.soc_pct, 0, " %") +
      (b.level === "critical" ? " — no hagas pruebas de movimiento" : " — termina la prueba y carga");
  } else alert.hidden = true;
  const lvl = { ok: "lvl-ok", low: "lvl-low", critical: "lvl-critical" }[b.level] || "";
  $("h-soc").textContent = num(b.soc_pct, 0, " %"); $("h-soc").className = lvl;
  $("h-volt").textContent = num(b.power_v, 2, " V");
  $("h-cur").textContent = num(b.current_raw, 0);
  $("h-cyc").textContent = num(b.cycles, 0);
  $("h-temp").textContent = (b.bms_temp_raw || b.mcu_temp_raw)
    ? `${(b.bms_temp_raw || ["—"]).join(" / ")} · ${(b.mcu_temp_raw || ["—"]).join(" / ")}` : "no disponible";
  $("health-badge").textContent = s.connected ? "en vivo" : "—";
  $("health-badge").className = "badge " + (s.connected ? "live" : "");

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
    (sl.errors ? ` · ${sl.errors} descartados` : "") + (sl.paused ? " · EN PAUSA (no suma mapas)" : "") +
    (sl.saving ? " · guardando…" : "");

}

// ---------------------------------------------------------------- autenticación
// Con la clave guardada, conectar no pide correo ni contraseña: el formulario queda plegado tras
// «Cambiar o renovar la clave…». Solo se pliega/despliega solo cuando cambia el estado de la clave
// (refresh() corre cada segundo y no debe pelearse con el operador).
let selectedSN = null, authKeyKnown = null;
function renderAuth(s) {
  const ok = !!s.aes_key_configured;
  $("auth-status").textContent = ok
    ? "✓ Clave del perro guardada · " + (s.aes_key_fingerprint || "") + ". Para conectar no hace falta correo ni contraseña."
    : "Clave AES: no configurada. Vincula la cuenta Unitree una vez para recuperarla.";
  $("auth-summary").textContent = ok ? "Cambiar o renovar la clave…" : "Vincular la cuenta y recuperar la clave";
  if (ok !== authKeyKnown) { $("auth-renew").open = !ok; authKeyKnown = ok; }
}
$("btn-devices").onclick = async () => {
  const email = $("au-email").value.trim(), password = $("au-pass").value;
  $("dev-list").innerHTML = "<span class='note'>consultando…</span>";
  try {
    // La contraseña se queda en el campo hasta «Recuperar y guardar»: esa llamada la vuelve a
    // necesitar (el servidor no guarda sesión ni token). Antes se borraba aquí y la recuperación
    // se enviaba sin contraseña.
    const r = await api("/api/auth/devices", { method: "POST", body: JSON.stringify({ email, password }) });
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
  $("auth-msg").textContent = "recuperando la clave…";
  try {
    const r = await api("/api/auth/fetch-key", { method: "POST", body: JSON.stringify({ email, password, serial: selectedSN }) });
    $("auth-msg").textContent = "Clave guardada (" + (r.fingerprint || "") + "). Reinicia el dashboard para que la use al conectar.";
  } catch (e) { $("auth-msg").textContent = "error: " + e.message; }
  $("au-pass").value = "";
  refresh();
};

// ---------------------------------------------------------------- LiDAR 3D
// El visor (mapa como la app de Unitree, en vivo / acumulado) está en static/lidar/lidarView.js;
// sus botones (borrar, congelar, guardar y descargar el .glb) hacen lo que antes hacía el panel
// «Capturas y datos».

// ---------------------------------------------------------------- CONTROL WASD
// ACTIVO POR DEFECTO (sin «Habilitar»): con el robot real conectado, WASD conduce.
//   · Solo se manda algo mientras hay una tecla pulsada («drive» cada 100 ms, que es también
//     la señal de hombre muerto) y un «stop» al soltar la última. Sin teclas, nada al robot.
//   · Las teclas no cuentan mientras se escribe en un campo de texto (p. ej. el correo).
//   · Soltar el foco de la ventana, perder la conexión o cerrar la pestaña detienen el robot.
let driveOK = false, ws = null, wsRetry = null;
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
function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function sendDrive() {
  if (!driveOK || !pressed.size) return;          // sin teclas pulsadas no se manda nada
  send(Object.assign({ type: "drive" }, velocity()));
}
function stopNow() {
  const was = pressed.size > 0;
  pressed.clear(); highlight();
  if (was || driveOK) send({ type: "stop" });
}
function highlight() {
  document.querySelectorAll(".key").forEach((k) => k.classList.toggle("active", pressed.has(k.dataset.k)));
}
// ¿Se está escribiendo? (las casillas y los botones no cuentan: ahí WASD sigue conduciendo)
function typing(e) {
  const t = e.target;
  if (!t || !t.tagName) return false;
  if (t.isContentEditable || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return true;
  return t.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "range"].includes(t.type);
}
function onKey(down) {
  return (e) => {
    const k = (e.key || "").toLowerCase();
    if (!down) {     // soltar cuenta SIEMPRE (aunque el foco esté en un campo de texto): es lo seguro
      if (pressed.delete(k)) { highlight(); if (pressed.size) sendDrive(); else send({ type: "stop" }); }
      return;
    }
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey || !driveOK) return;
    if (!KEYS.includes(k) && k !== " ") return;
    e.preventDefault();
    if (k === " ") { stopNow(); return; }
    if (e.repeat || pressed.has(k)) return;        // la repetición del teclado no añade nada
    pressed.add(k); highlight(); sendDrive();
  };
}
function renderControl(available) {
  driveOK = available;
  if (!driveOK && pressed.size) { pressed.clear(); highlight(); }
  $("btn-stop").disabled = !driveOK;
  document.querySelectorAll(".pbtn").forEach((b) => (b.disabled = !driveOK));
  $("ctrl-badge").textContent = driveOK ? "CONTROL ACTIVO" : "sin robot";
  $("ctrl-badge").className = "badge " + (driveOK ? "warn" : "");
}
// Canal de control: abierto siempre; si se cierra, se para y se vuelve a abrir solo.
function openControl() {
  clearTimeout(wsRetry);
  const sock = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws/control");
  sock.onclose = () => {
    if (ws === sock) ws = null;
    if (pressed.size) { pressed.clear(); highlight(); }
    wsRetry = setTimeout(openControl, 1000);
  };
  ws = sock;
}

$("btn-stop").onclick = () => { stopNow(); $("btn-stop").blur(); };
document.querySelectorAll(".pbtn").forEach((b) => b.onclick = () => {
  send({ type: "posture", command: b.dataset.cmd });
  b.blur();                                        // sin foco: Espacio no repite la postura
});
window.addEventListener("keydown", onKey(true));
window.addEventListener("keyup", onKey(false));
window.addEventListener("blur", () => { if (pressed.size) stopNow(); });   // soltar el foco detiene
document.addEventListener("focusin", (e) => { if (pressed.size && typing(e)) stopNow(); });   // pasar a escribir detiene
document.addEventListener("visibilitychange", () => { if (document.hidden && pressed.size) stopNow(); });
setInterval(sendDrive, 100);   // mientras haya una tecla pulsada: también es la señal de hombre muerto

// ---------------------------------------------------------------- arranque
setSpeedLevel("normal");
openControl();
refresh();
setInterval(refresh, 1000);
