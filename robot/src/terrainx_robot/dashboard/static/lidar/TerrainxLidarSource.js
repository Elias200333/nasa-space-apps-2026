// Fuente LiDAR del dashboard TERRAIN-X: sustituye a UnitreeLidarSource + websocketService del
// visor «Bridge» original. Habla con /ws/lidar (dashboard/server.py), que reenvía los bytes
// ORIGINALES de rt/utlidar/voxel_map_compressed (mensaje binario LIDAR_VOXELS), los trozos del
// mapa acumulado (SLAM_CHUNK, mismo formato de bits) y la pose del LiDAR (rt/utlidar/robot_pose,
// mismo marco que el mapa). Nada de lo que se pide aquí llega al robot: solo cambia qué nos
// reenvía el dashboard.
//
// Binario: b"LVX1" | uint32 LE largo de la cabecera | cabecera JSON | bytes lz4
// Texto:   {"type": "POSE", x, y, z, yaw, frame_id} · {"type": "SLAM_INFO", epoch, voxels, …}
import { LidarSource } from './LidarSource.js'

const MAGIC = [0x4c, 0x56, 0x58, 0x31]   // "LVX1"
const RETRY_MS = 1500
const decoder = new TextDecoder()

export class TerrainxLidarSource extends LidarSource {
  _slamCbs = new Set()
  _infoCbs = new Set()
  _ws = null
  _want = { mode: 'off' }
  _paused = false
  _closed = true
  _retry = null

  /** Trozos del mapa SLAM acumulado: cb(cabecera, bytes). @returns {() => void} */
  onSlamChunk(cb) { this._slamCbs.add(cb); return () => this._slamCbs.delete(cb) }

  /** Estado del mapa acumulado (SLAM_INFO, cada segundo). @returns {() => void} */
  onSlamInfo(cb) { this._infoCbs.add(cb); return () => this._infoCbs.delete(cb) }

  connect() {
    this._closed = false
    this._open()
  }

  /** Pedir o dejar de pedir el LiDAR (la pose sigue llegando).
   *  mode 'slam': el mapa acumulado (al pedirlo, el dashboard lo manda entero) */
  setStreaming(on, mode = 'live') {
    this._want = { mode: !on ? 'off' : mode === 'slam' ? 'slam' : 'live' }
    this._send(this._want)
  }

  /** Órdenes al dashboard: 'SLAM_RESET' (borrar el acumulado) · 'SLAM_SYNC' (reenviarlo) */
  send(type) { this._send({ type }) }

  /** TERRAIN-X: congelar el acumulado en el dashboard (no suma mapas mientras tanto). Se vuelve
   *  a pedir al reconectar: si este canal se cierra, el dashboard lo reanuda solo. */
  setPaused(paused) {
    this._paused = !!paused
    this._send({ type: 'SLAM_PAUSE', paused: this._paused })
  }

  disconnect() {
    this._closed = true
    clearTimeout(this._retry)
    if (this._ws) { try { this._ws.close() } catch { /* ya cerrado */ } }
    this._ws = null
  }

  _send(obj) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) this._ws.send(JSON.stringify(obj))
  }

  _open() {
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/lidar'
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    this._ws = ws
    ws.onopen = () => {                                // lo que estuviera pidiendo el visor
      this._send(this._want)
      if (this._paused) this._send({ type: 'SLAM_PAUSE', paused: true })
    }
    ws.onmessage = (ev) => (typeof ev.data === 'string' ? this._onText(ev.data) : this._onBinary(ev.data))
    ws.onclose = () => {
      if (this._ws === ws) this._ws = null
      if (!this._closed) this._retry = setTimeout(() => this._open(), RETRY_MS)
    }
  }

  _onText(text) {
    let msg
    try { msg = JSON.parse(text) } catch { return }
    if (msg.type === 'POSE') this._emitPose({ x: msg.x, y: msg.y, z: msg.z ?? null, yaw: msg.yaw })
    else if (msg.type === 'SLAM_INFO') for (const cb of this._infoCbs) cb(msg)
  }

  _onBinary(buf) {
    if (buf.byteLength < 8) return
    const u8 = new Uint8Array(buf, 0, 8)
    if (MAGIC.some((b, i) => u8[i] !== b)) return
    const hlen = new DataView(buf).getUint32(4, true)
    if (8 + hlen > buf.byteLength) return
    let head
    try { head = JSON.parse(decoder.decode(new Uint8Array(buf, 8, hlen))) } catch { return }
    const payload = buf.slice(8 + hlen)                // búfer propio: se transfiere al worker
    if (head.type === 'SLAM_CHUNK') { for (const cb of this._slamCbs) cb(head, payload); return }
    if (head.type !== 'LIDAR_VOXELS') return
    this._emitCloud({
      kind: 'voxel-bits',
      buffer: payload,
      compressed: true,
      srcSize: head.src_size,
      origin: head.origin,
      resolution: head.resolution,
    })
  }
}
