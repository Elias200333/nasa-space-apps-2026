# TERRAIN-X · Módulo de robótica

Software del especialista de robótica de TERRAIN-X (NASA Space Apps Challenge 2026).

**Base (solo lectura):** comunicación con el Unitree Go2 físico — adquisición LiDAR y telemetría, exportación PLY + metadatos JSON con SHA-256 y un modo replay para trabajar sin robot.

**Dashboard web local:** autenticación AES-128, conexión compartida al Go2, **cámara en directo**, visor LiDAR 3D, telemetría, capturas y, de forma separada y opcional, **teleoperación WASD** con hombre muerto. Ver [sección 11](#11-dashboard-web-del-go2-air).

> Por defecto el módulo es de **solo lectura**: un guardián bloquea en el propio PC cualquier orden que no esté en una lista blanca. La conducción WASD es un **modo aparte** que hay que habilitar explícitamente; usa un guardián acotado (solo Move/Stop/levantar/sentar/amortiguar) y se detiene al soltar la tecla, perder el foco o cortarse la conexión. Nada de esto sustituye a la parada de emergencia física del robot, que siempre debe manejar un operador presente.

---

## 1. Estado de la Fase 1

| Componente | Implementado | Probado offline | Pendiente con el robot físico |
|---|---|---|---|
| `RobotAdapter` (interfaz común) | ✅ | ✅ | — |
| `Go2WebRTCAdapter` (LocalAP / LocalSTA) | ✅ | ✅ con librería simulada y con el parser binario real de la librería | Conexión real, comportamiento en Windows con el robot |
| Guardián de solo lectura | ✅ | ✅ (todas las órdenes `SPORT_CMD` de la librería se bloquean) | — |
| `CapabilityProbe` | ✅ | ✅ en replay | Qué topics publica realmente vuestro Go2 y a qué frecuencia |
| Decodificación LiDAR (`voxel_codec`) | ✅ | ✅ idéntica bit a bit al decodificador `native` de la librería | **Unidades, ejes y origen del frame** (ver [docs/VERIFICACION_FISICA.md](docs/VERIFICACION_FISICA.md)) |
| Exportación PLY + JSON + SHA-256 | ✅ | ✅ | — |
| Sesiones crudas + replay | ✅ | ✅ | Grabar la primera sesión real |
| Telemetría (batería, IMU, posición) | ✅ campos de los ejemplos oficiales | ✅ con datos sintéticos | Que los campos existan en vuestro firmware y sus unidades |
| Modelo y firmware | Solo si el operador los declara | ✅ | Leerlos en la app oficial y anotarlos en `.env` |

**Lo que no existe todavía, por diseño:** movimiento, Meta Quest 3, misiones, comunicación planetaria, métricas geométricas (pendiente, suelo, obstáculos) y registro a ENU. Corresponden a las fases 2 a 5.

**Verificado sin robot (14-11-2026):** con una IP no enrutable, la librería real ejecuta en Windows la negociación WebRTC hasta la señalización. El error `LocalSignalingPortError` se traduce a un mensaje comprensible.

---

## 2. Requisitos

- Windows 10/11 con PowerShell.
- Python **3.11 o superior**. Verificado con 3.13.7.
- Para el robot: un PC en la **misma red local** que el Go2 y la app oficial de Unitree **cerrada**. El robot admite un solo cliente WebRTC a la vez.

## 3. Instalación (PowerShell)

Ejecute todo desde la carpeta `robot`. Se llama al Python del entorno virtual directamente, así que no hace falta `Activate.ps1` ni cambiar la política de ejecución.

```powershell
cd C:\Users\Usuario\Desktop\github\nasa-space-apps-2026\robot
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip

# Opción A (reproducible): versiones exactas verificadas
.\.venv\Scripts\python.exe -m pip install -r requirements\lock-windows-py313.txt
.\.venv\Scripts\python.exe -m pip install --no-deps -e .

# Opción B: rangos de pyproject.toml (núcleo + Go2 + tests)
.\.venv\Scripts\python.exe -m pip install -e ".[go2,dev]"
```

El núcleo (replay, PLY, tests offline) solo necesita `numpy`, `lz4`, `pydantic` y `python-dotenv`. El extra `[go2]` instala `unitree_webrtc_connect==2.2.0`, la versión cuyo código fuente se ha revisado.

## 4. Prueba rápida SIN robot

```powershell
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m terrainx_robot demo-session
.\.venv\Scripts\python.exe -m terrainx_robot capture --source replay --input latest
.\.venv\Scripts\python.exe -m terrainx_robot probe --source replay --input latest
.\.venv\Scripts\python.exe -m terrainx_robot list-scans
```

`demo-session` genera una escena **sintética** (suelo, caja de 0,50 m y pared) con el mismo formato binario que publica el robot. Todo lo que sale de ella queda marcado como `evidence_class=synthetic_test` y `demo=true`.

## 5. Uso CON el robot

1. Copie `.env.example` a `.env` y rellene **solo lo que sepa**:
   - `TERRAINX_GO2_IP`.
   - `TERRAINX_GO2_MODEL` y `TERRAINX_GO2_FIRMWARE`, si los ha leído en la app oficial.
2. Si el firmware es **1.1.15 o posterior**, la librería exige la clave AES-128 propia del robot:
   - Guárdela en un archivo **fuera del repositorio**, por ejemplo `C:\Users\<usted>\terrainx-secrets\go2.aes`.
   - Indique esa ruta en `TERRAINX_GO2_AES_KEY_FILE`.
   - El programa rechaza rutas dentro del repositorio y claves escritas en `.env`.
3. Cierre la app oficial de Unitree y ejecute:

```powershell
.\.venv\Scripts\python.exe -m terrainx_robot check-library
.\.venv\Scripts\python.exe -m terrainx_robot probe --source go2 --window 15 --record-session
.\.venv\Scripts\python.exe -m terrainx_robot capture --source go2 --duration 5 --record-session
```

Siga el protocolo de [docs/VERIFICACION_FISICA.md](docs/VERIFICACION_FISICA.md) en la primera sesión con el robot.

## 6. Comandos

| Comando | Qué hace |
|---|---|
| `info` | Configuración efectiva (la clave solo como "configurada" o "no configurada") y versiones |
| `check-library` | Verifica la API real de la librería instalada: versión, topics, gancho del decodificador y equivalencia con `native` |
| `demo-session [--frames N] [--seed S]` | Genera una sesión sintética |
| `probe --source go2\|replay [--window s] [--record-session]` | Sondeo de capacidades. Guarda el JSON en `runtime/probes/` |
| `record --source go2 --duration s [--notes ...]` | Graba datos crudos del robot para reproducirlos después |
| `capture --source go2\|replay [--duration s] [--mode accumulate\|last] [--record-session] [--ascii]` | Genera PLY + metadatos + SHA256SUMS |
| `list-scans [--json]` | Lista los escaneos |
| `verify-scan <id>` | Recalcula los SHA-256 |
| `export-scan <id> --dest <carpeta>` | Copia un escaneo tras verificar su integridad |
| `inspect <id \| archivo.ply>` | Estadística descriptiva para la verificación física |
| `export-schemas [--out carpeta]` | JSON Schema de la propuesta de contrato |

En replay, `--input` acepta una carpeta de sesión, un `.ply` o `latest`. Un PLY sin metadatos exige declarar `--evidence-class`: su origen no se adivina.

Códigos de salida: `0` correcto · `1` error · `2` resultado degradado.

## 7. Estructura

```
robot/
├── pyproject.toml            # paquete, dependencias y extras [go2] y [dev]
├── requirements/             # lock exacto verificado en Windows + Python 3.13
├── .env.example              # plantilla de configuración (sin secretos)
├── contracts/                # PROPUESTA de contrato 1.1-draft para Ciencia y Plataforma
│   ├── README.md             #   qué deben aprobar
│   ├── schemas/              #   JSON Schema generados desde el código
│   └── examples/             #   escaneo e informe SINTÉTICOS de ejemplo
├── docs/
│   ├── VERIFICACION_FISICA.md   # protocolo de la primera sesión con el robot
│   └── NOTAS_LIBRERIA_GO2.md    # qué se comprobó en el código de la librería 2.2.0
├── src/terrainx_robot/
│   ├── cli.py                # línea de comandos
│   ├── config.py             # .env y entorno, con reglas de seguridad
│   ├── models.py             # modelos Pydantic (contrato)
│   ├── adapters/
│   │   ├── base.py           # RobotAdapter + monitor de topics + telemetría
│   │   ├── go2_webrtc.py     # Go2WebRTCAdapter (solo lectura)
│   │   ├── replay.py         # ReplayAdapter (sesiones y PLY)
│   │   ├── readonly_guard.py # lista blanca de mensajes salientes
│   │   ├── go2_topics.py     # topics verificados en la librería 2.2.0
│   │   └── library_check.py  # verificación de la API instalada
│   ├── lidar/                # voxel_codec, frames, validación, acumulación, describe
│   ├── storage/              # PLY, almacén de escaneos, sesiones
│   ├── probe/                # CapabilityProbe y comprobación de red
│   └── fixtures/synthetic.py # generador de escenas sintéticas
├── tests/                    # pytest: ninguno necesita robot ni Internet
└── runtime/                  # datos generados (en .gitignore)
    ├── scans/<id>/           #   <id>.ply · <id>.metadata.json · SHA256SUMS
    ├── sessions/<id>/        #   session.json · messages.jsonl (payload LiDAR original)
    ├── probes/               #   informes de capacidades
    └── logs/
```

## 8. Qué significa cada dato

- **`evidence_class`**: el **origen** del dato.
  - `robot_measured`: medido físicamente por un robot.
  - `synthetic_test`: generado por software para pruebas.
  - Reservados para otros módulos: `orbital_nasa` y `derived`.
- **`delivery_mode`**: la **vía** por la que llegó el dato: `live` o `replay`. Un PLY real reproducido sigue siendo `robot_measured`.
- **`point_type = voxel_occupancy`**: por WebRTC el Go2 no entrega retornos crudos del LiDAR. Entrega un **mapa de vóxeles ocupados**, una rejilla 128 × 128 × N con la resolución que indica el propio mensaje (0,05 en los ejemplos). Cada punto es `origin + índice × resolution`.
- **`units_verification` / `axes_verification = unverified`**: ni el robot ni la librería declaran unidades ni ejes. Se asumen metros hasta completar la verificación física.
- **`registration.status = local_only`**: la nube está en el frame del robot. No se georreferencia sin puntos de control (Fase 2).

## 9. Seguridad

- Solo se usan LocalAP y LocalSTA. El método Remote (nube de Unitree) se rechaza en la configuración.
- La lista blanca de mensajes salientes es:
  - suscripciones;
  - mensajes de protocolo (heartbeat, validation);
  - mantenimiento del enlace;
  - `rt/utlidar/switch` con `on`/`off`.

  Además, en solo lectura se permite el conmutador de **cámara** (`vid` on/off).
  Todo lo demás se bloquea antes de salir del PC y queda contado en `readonly_guard`.
- **Modo control (WASD):** no se activa solo. Al habilitarlo explícitamente, el guardián permite además un subconjunto **acotado** de locomoción (Move, StopMove, StandUp, StandDown, BalanceStand, RecoveryStand, Damp); siguen bloqueados saltos, volteretas, `rt/lowcmd` y `rt/wirelesscontroller`. Al deshabilitar, desconectar o cerrar el canal de control se envía StopMove y se vuelve a solo lectura. El dashboard solo se sirve en `127.0.0.1`.
- Al desconectar **no** se envía `off` al LiDAR: no alteramos más estado del robot del necesario.
- Las claves y credenciales nunca se escriben en el repositorio, en `.env` ni en los logs. Los mensajes de error de la librería se redactan.
- `runtime/` puede contener datos reales e identificadores del robot. Está en `.gitignore`: revíselo antes de compartirlo.

## 10. Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `robot_busy` | Otro cliente WebRTC conectado | Cierre la app oficial de Unitree en el móvil |
| `aes_key_required` | Firmware 1.1.15 o posterior | Configure `TERRAINX_GO2_AES_KEY_FILE` con una ruta externa |
| `signaling_unreachable` | IP incorrecta, otra red o robot apagado | Compruebe la IP. `probe` informa además de los puertos 9991/8081 |
| `datachannel_timeout` | Cortafuegos de Windows bloqueando UDP o Wi-Fi débil | Permita Python en el cortafuegos para redes privadas y acerque el PC |
| `missing_address` | LocalSTA sin IP ni número de serie | Rellene `TERRAINX_GO2_IP` en `.env` |
| Caracteres raros en la consola | Codificación de la consola | La CLI fuerza UTF-8; en consolas antiguas, ejecute `chcp 65001` |
| La cámara no aparece | El robot aún no envía vídeo, o `[dashboard]`/`[go2]` sin instalar | Espere unos segundos tras conectar; verifique con `check-library` |

---

## 11. Dashboard web del Go2 AIR

Interfaz local de diagnóstico. Se sirve **solo en `127.0.0.1`** (no accesible desde la red).

### Instalación del extra

```powershell
.\.venv\Scripts\python.exe -m pip install -e ".[go2,dashboard]"
```

### Recuperar la clave AES-128 (firmware ≥ 1.1.15)

La clave es propia de cada robot y está en tu cuenta de Unitree. Se recupera con la **función oficial de la librería**, se guarda **fuera del repositorio** y **nunca se muestra** (solo una huella):

```powershell
# Opción 1 — desde la terminal
.\.venv\Scripts\python.exe -m terrainx_robot unitree-devices                 # lista tus robots
.\.venv\Scripts\python.exe -m terrainx_robot unitree-fetch-key --serial <SN> # guarda la clave
.\.venv\Scripts\python.exe -m terrainx_robot aes-status                      # confirma (huella)

# Opción 2 — si ya la obtuviste aparte
.\.venv\Scripts\python.exe -m terrainx_robot import-aes-key --from-file C:\ruta\externa\go2.aes
```

Después apunta `TERRAINX_GO2_AES_KEY_FILE` en `robot\.env` a esa ruta (por defecto `%USERPROFILE%\.terrainx\go2_aes_key.txt`). También puedes hacer todo esto desde el panel **«Unitree — Conexión y autenticación»** del propio dashboard.

### Lanzar el dashboard

```powershell
.\.venv\Scripts\python.exe -m terrainx_robot dashboard
```

Abre **http://127.0.0.1:8777** en el navegador. Paneles: cámara en directo (MJPEG), telemetría, LiDAR 3D, conducción WASD, capturas y diagnóstico.

### Conectar al perro y comprobar que funciona

1. Enciende el Go2, ponlo en la misma red que el PC y **cierra la app oficial de Unitree** (el robot admite un solo cliente).
2. Rellena en `robot\.env`: `TERRAINX_GO2_IP`, `TERRAINX_GO2_MODEL=AIR`, la ruta de la clave y, si sabes, `TERRAINX_GO2_FIRMWARE`.
3. En el dashboard pulsa **Conectar**. Si todo va bien verás:
   - el indicador en verde y el estado `ready_readonly`;
   - la **cámara en directo** en unos segundos (FPS en la esquina);
   - telemetría (batería, IMU…) a medida que el robot la publica;
   - la nube **LiDAR 3D** actualizándose (vóxeles ocupados, en metros asumidos).
4. Prueba una **captura**: «Iniciar captura» → mueve el robot con su mando unos segundos → «Detener y guardar». Aparece en la lista y puedes descargar el PLY.

### Conducir con WASD (teleoperación supervisada)

> **Solo con espacio libre y un operador junto al paro de emergencia físico.**

1. En el panel **Conducción (WASD)** pulsa **«Habilitar control»** y confirma. El guardián pasa a modo control (acotado).
2. Conduce manteniendo pulsado:
   - **W / S** — avanzar / retroceder
   - **A / D** — girar izquierda / derecha
   - **Q / E** — desplazamiento lateral
   - **Espacio** — parar
   - Botones de postura: **Levantar / Sentar / Equilibrio / Amortiguar**
3. El robot **solo se mueve mientras mantienes la tecla**. Al soltarla, cambiar de ventana, cerrar la pestaña o perder la conexión, se detiene solo (hombre muerto, 0,4 s). Botones **PARAR** y **Deshabilitar** siempre disponibles.
4. Límites de velocidad (recortados en el servidor): avance 0,6 m/s · lateral 0,4 m/s · giro 0,8 rad/s; el mando WASD usa valores aún más suaves. Saltos y volteretas están **bloqueados**.

### Qué está probado y qué no

- **Probado sin robot** (159 tests, incluidos los del dashboard con un robot simulado): los endpoints, el modo control acotado, el hombre muerto, el recorte de velocidad y que la clave/credenciales no se filtran.
- **Pendiente de comprobar con el Go2 físico:** que lleguen vídeo y LiDAR reales y a qué frecuencia, y el comportamiento real de la locomoción. Nada de esto está verificado hasta probarlo con el robot.
- Three.js se incluye vendorizado en `dashboard/static/vendor/` (MIT) para que el visor 3D funcione **sin internet** en la red del robot.
