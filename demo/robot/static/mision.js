"use strict";
// Página de la misión «Mapear zona subterránea» (la abre la interfaz TERRAIN-X en el PC o en las
// gafas XR). Mismas seguridades que la conducción del dashboard (app.js):
//   · solo se manda «drive» mientras hay un botón o una tecla pulsados (cada 100 ms: es también la
//     señal de hombre muerto del servidor) y un «stop» al soltar el último;
//   · perder el foco, ocultar la página o perder la conexión detienen el robot;
//   · el servidor recorta la velocidad a sus topes y solo deja pasar la lista blanca de órdenes.
// Detrás del proxy de la interfaz las rutas llevan el prefijo /robot y, desde otro equipo, el código
// de emparejamiento (?code=); se dejan en window.TERRAINX_BRIDGE para el visor LiDAR.

(function () {
  const params = new URLSearchParams(location.search);
  const base = location.pathname.startsWith("/robot/") ? "/robot" : "";
  const code = (params.get("code") || "").trim();
  window.TERRAINX_BRIDGE = { base, code };
  const url = (p) => base + p + (code ? (p.includes("?") ? "&" : "?") + "code=" + encodeURIComponent(code) : "");
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------ estado (cada segundo)
  let camOn = false;
  async function refresh() {
    let s;
    try {
      const r = await fetch(url("/api/status"));
      if (!r.ok) throw new Error(r.status === 401 ? "falta el código de emparejamiento" : "HTTP " + r.status);
      s = await r.json();
    } catch (e) {
      setBadge("conn", "sin servidor del robot (" + e.message + ")", "err");
      renderControl(false);
      return;
    }
    window.terrainxStatus = s;      // el visor LiDAR lee de aquí la clase de evidencia del acumulado
    setBadge("conn", s.connected ? "unidad conectada" : (s.last_error ? "error: " + s.last_error : "desconectada"),
      s.connected ? "ok" : (s.last_error ? "err" : ""));
    const b = (s.robot_details || {}).battery || {};
    setBadge("batt", "batería " + (b.soc_pct == null ? "—" : Math.round(b.soc_pct) + " %"),
      b.level === "critical" ? "err" : (b.level === "low" ? "warn" : ""));
    const hasVideo = !!(s.video && s.video.has_frame);
    if (s.connected && !camOn) { $("cam").src = url("/video/stream"); camOn = true; }
    if (!s.connected && camOn) { $("cam").removeAttribute("src"); camOn = false; }
    $("cam-off").style.display = hasVideo ? "none" : "flex";
    renderControl(!!s.control_available);
  }
  function setBadge(id, text, cls) { $(id).textContent = text; $(id).className = "badge" + (cls ? " " + cls : ""); }

  // ------------------------------------------------------------ conducción
  const SPEED_LEVELS = {            // m/s, m/s, rad/s (el servidor recorta además a sus topes)
    lento: { vx: 0.3, vy: 0.25, yaw: 0.5 },
    normal: { vx: 0.6, vy: 0.4, yaw: 1.0 },
    rapido: { vx: 1.0, vy: 0.5, yaw: 1.5 },
  };
  const KEYS = ["w", "a", "s", "d", "q", "e"];
  let SPEED = SPEED_LEVELS.lento;   // en una misión se empieza despacio
  let driveOK = false, ws = null;
  const pressed = new Set();

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
  function send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
  function sendDrive() { if (driveOK && pressed.size) send(Object.assign({ type: "drive" }, velocity())); }
  function highlight() {
    document.querySelectorAll("#pad button").forEach((b) => b.classList.toggle("active", pressed.has(b.dataset.k)));
  }
  function press(k) { if (!driveOK || pressed.has(k)) return; pressed.add(k); highlight(); sendDrive(); }
  function release(k) {
    if (!pressed.delete(k)) return;
    highlight();
    if (pressed.size) sendDrive(); else send({ type: "stop" });
  }
  function stopNow() {
    const was = pressed.size > 0;
    pressed.clear(); highlight();
    if (was || driveOK) send({ type: "stop" });
  }
  function renderControl(ok) {
    driveOK = ok;
    if (!ok && pressed.size) { pressed.clear(); highlight(); }
    $("btn-stop").disabled = !ok;
    document.querySelectorAll(".pbtn").forEach((b) => (b.disabled = !ok));
    setBadge("ctrl", ok ? "CONTROL ACTIVO" : "sin control", ok ? "warn" : "");
  }
  function setSpeed(level) {
    SPEED = SPEED_LEVELS[level] || SPEED;
    document.querySelectorAll("#speeds button").forEach((b) => b.classList.toggle("sel", b.dataset.level === level));
    sendDrive();
  }

  // Botones del mando: mantener pulsado (ratón, dedo o puntero de las gafas)
  document.querySelectorAll("#pad button").forEach((b) => {
    const k = b.dataset.k;
    let captured = false;
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      captured = false;
      try { b.setPointerCapture(e.pointerId); captured = true; } catch (_) { /* sin captura: ver pointerleave */ }
      press(k);
    });
    b.addEventListener("pointerleave", () => { if (!captured) release(k); });   // salir del botón también para
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) => b.addEventListener(ev, () => release(k)));
    b.addEventListener("contextmenu", (e) => e.preventDefault());
  });
  document.querySelectorAll("#speeds button").forEach((b) => (b.onclick = () => { setSpeed(b.dataset.level); b.blur(); }));
  document.querySelectorAll(".pbtn").forEach((b) => (b.onclick = () => { send({ type: "posture", command: b.dataset.cmd }); b.blur(); }));
  $("btn-stop").onclick = () => { stopNow(); $("btn-stop").blur(); };

  // Teclado (PC): igual que el dashboard
  function typing(e) {
    const t = e.target;
    if (!t || !t.tagName) return false;
    if (t.isContentEditable || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return true;
    return t.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "range"].includes(t.type);
  }
  window.addEventListener("keydown", (e) => {
    const k = (e.key || "").toLowerCase();
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey || !driveOK) return;
    if (!KEYS.includes(k) && k !== " ") return;
    e.preventDefault();
    if (k === " ") { stopNow(); return; }
    if (!e.repeat) press(k);
  });
  window.addEventListener("keyup", (e) => release((e.key || "").toLowerCase()));
  window.addEventListener("blur", () => { if (pressed.size) stopNow(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && pressed.size) stopNow(); });
  // La interfaz (página madre) puede pedir parar, p. ej. al pulsar «Terminar recorrido»
  window.addEventListener("message", (e) => {
    if (e.origin === location.origin && e.data && e.data.type === "terrainx-stop") stopNow();
  });
  setInterval(sendDrive, 100);

  // Canal de control: siempre abierto; si se cierra, se para y se vuelve a abrir solo
  function openControl() {
    const sock = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + url("/ws/control"));
    sock.onclose = () => {
      if (ws === sock) ws = null;
      if (pressed.size) { pressed.clear(); highlight(); }
      setTimeout(openControl, 1000);
    };
    ws = sock;
  }

  setSpeed("lento");
  openControl();
  refresh();
  setInterval(refresh, 1000);
})();
