// Origen: visor LiDAR «Bridge» aportado al equipo (2026-11-14). Copiado sin cambios.
// Interfaz común de las fuentes de nube de puntos: el visor no sabe de qué robot
// vienen los datos. Cada robot es un adaptador que hereda de aquí.
//
// onPointCloud(cb) recibe frames (su `buffer` pasa a ser del visor: se transfiere
// al Web Worker sin copiar, así que la fuente no lo reutiliza):
//   { kind: 'voxel-bits', buffer, compressed, srcSize, origin: [x,y,z], resolution }
//       rejilla de ocupación por bits (Unitree: rt/utlidar/voxel_map_compressed),
//       ya en coordenadas del mundo (odometría)
//   { kind: 'xyz', buffer /* Float32 x,y,z */, count, frame: 'world' | 'sensor' }
//       puntos sueltos; si son del sensor, el visor les aplica la última pose
//
// onPose(cb) recibe { x, y, z, yaw } (metros, radianes) en el mismo marco.

export class LidarSource {
  constructor() {
    this._cloudCbs = new Set()
    this._poseCbs = new Set()
  }

  /** Empieza a recibir (y pedir) datos */
  connect() {}

  /** Deja de recibirlos y de pedirlos al robot */
  disconnect() {}

  /** @returns {() => void} para darse de baja */
  onPointCloud(cb) { this._cloudCbs.add(cb); return () => this._cloudCbs.delete(cb) }

  /** @returns {() => void} para darse de baja */
  onPose(cb) { this._poseCbs.add(cb); return () => this._poseCbs.delete(cb) }

  _emitCloud(frame) { for (const cb of this._cloudCbs) cb(frame) }
  _emitPose(pose) { for (const cb of this._poseCbs) cb(pose) }
}
