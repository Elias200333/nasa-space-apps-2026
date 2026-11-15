# TERRAIN-X · Módulo de robótica

Software del especialista de robótica de TERRAIN-X (NASA Space Apps Challenge 2026).

**Base (solo lectura):** comunicación con el Unitree Go2 físico — adquisición LiDAR y telemetría, exportación PLY + metadatos JSON con SHA-256.

**Dashboard web local:** autenticación AES-128, conexión compartida al Go2, **cámara en directo**, visor LiDAR 3D con el mapa SLAM acumulado (se guarda como PLY + GLB + coordenadas JSON), estado del robot (batería, LiDAR, flujos de datos) y **teleoperación WASD** con hombre muerto (activa con el robot conectado). Ver [sección 11](#11-dashboard-web-del-go2-air).

> Por defecto el módulo es de **solo lectura**: un guardián bloquea en el propio PC cualquier orden que no esté en una lista blanca. La conducción WASD se activa en cuanto el robot está conectado; usa un guardián acotado (solo Move/Stop/levantar/sentar/amortiguar) y se detiene al soltar la tecla, perder el foco o cortarse la conexión. Nada de esto sustituye a la parada de emergencia física del robot, que siempre debe manejar un operador presente.

---

## 1. Estado de la Fase 1

| Componente | Estado | Pendiente con el robot físico |
|---|---|---|
| `Go2WebRTCAdapter` (LocalAP / LocalSTA) | ✅ Conectado a Pluffy (Go2 AIR) por cable en LocalSTA el 14-11-2026: vídeo ~14 fps, LiDAR ~7,7 Hz, lowstate y sportmodestate a 20 Hz | LocalAP (Wi-Fi del propio perro) sin comprobar |
| Guardián de solo lectura y modo control acotado | ✅ Solo pasan las órdenes de la lista blanca; con Pluffy se condujo con WASD | — |
| Decodificación LiDAR (`voxel_codec`) | ✅ Idéntica bit a bit al decodificador `native` de la librería (`check-library`) | **Unidades, ejes y origen del frame** (ver [docs/VERIFICACION_FISICA.md](docs/VERIFICACION_FISICA.md)) |
| Mapa SLAM acumulado → PLY + GLB + coordenadas, con SHA-256 | ✅ Guardado con datos de Pluffy | — |
| Telemetría (batería, IMU, posición) | ✅ Llega de Pluffy (campos de los ejemplos oficiales) | Unidades de los campos `*_raw` |
| `CapabilityProbe` | ✅ | Ejecutarlo con Pluffy y guardar el informe |
| Modelo y firmware | Solo si el operador los declara (`AIR` declarado) | Leer el firmware en la app oficial y anotarlo en `.env` |

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

# Opción B: rangos de pyproject.toml (núcleo + Go2 + dashboard)
.\.venv\Scripts\python.exe -m pip install -e ".[go2,dashboard]"
```

El núcleo (decodificación LiDAR y PLY) solo necesita `numpy`, `lz4`, `pydantic` y `python-dotenv`. El extra `[go2]` instala `unitree_webrtc_connect==2.2.0`, la versión cuyo código fuente se ha revisado.

## 4. Comprobar la instalación (sin robot)

```powershell
.\.venv\Scripts\python.exe -m terrainx_robot check-library
.\.venv\Scripts\python.exe -m terrainx_robot info
```

`check-library` comprueba la API de la librería instalada y que nuestro decodificador LiDAR da exactamente los mismos puntos que el suyo. `info` muestra la configuración efectiva; la clave solo aparece como «configurada». Los datos reales solo salen del robot conectado.

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
.\.venv\Scripts\python.exe -m terrainx_robot probe --window 15
.\.venv\Scripts\python.exe -m terrainx_robot capture --duration 5
```

Siga el protocolo de [docs/VERIFICACION_FISICA.md](docs/VERIFICACION_FISICA.md) en la primera sesión con el robot.

## 6. Comandos

| Comando | Qué hace |
|---|---|
| `info` | Configuración efectiva (la clave solo como "configurada" o "no configurada") y versiones |
| `check-library` | Verifica la API real de la librería instalada: versión, topics, gancho del decodificador y equivalencia con `native` |
| `probe [--window s]` | Sondeo de capacidades del robot. Guarda el JSON en `runtime/probes/` |
| `capture --duration s [--mode accumulate\|last] [--ascii]` | Genera PLY + metadatos + SHA256SUMS |
| `list-scans [--json]` | Lista los escaneos |
| `verify-scan <id>` | Recalcula los SHA-256 |
| `export-scan <id> --dest <carpeta>` | Copia un escaneo tras verificar su integridad |
| `inspect <id \| archivo.ply>` | Estadística descriptiva para la verificación física |
| `export-schemas [--out carpeta]` | JSON Schema de la propuesta de contrato |

`--source go2` se sigue aceptando (es el valor por defecto y la única fuente).

Códigos de salida: `0` correcto · `1` error · `2` resultado degradado.

## 7. Estructura

```
robot/
├── pyproject.toml            # paquete, dependencias y extras [go2] y [dashboard]
├── requirements/             # lock exacto verificado en Windows + Python 3.13
├── .env.example              # plantilla de configuración (sin secretos)
├── contracts/                # PROPUESTA de contrato 1.1-draft para Ciencia y Plataforma
│   ├── README.md             #   qué deben aprobar
│   └── schemas/              #   JSON Schema generados desde el código
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
│   │   ├── readonly_guard.py # lista blanca de mensajes salientes
│   │   ├── go2_topics.py     # topics verificados en la librería 2.2.0
│   │   └── library_check.py  # verificación de la API instalada
│   ├── auth/                 # clave AES del perro (guardada fuera del repositorio)
│   ├── dashboard/            # dashboard web (cámara, LiDAR 3D, WASD, estado) + puente con la interfaz
│   ├── lidar/                # decodificación, mapa SLAM, malla PLY, GLB, coordenadas y marco de misión
│   ├── storage/              # PLY y almacén de escaneos
│   └── probe/                # CapabilityProbe y comprobación de red
└── runtime/                  # datos generados (en .gitignore)
    ├── scans/<id>/           #   <id>.ply · <id>.metadata.json · SHA256SUMS
    ├── probes/               #   informes de capacidades
    └── logs/
```

## 8. Qué significa cada dato

- **`evidence_class`**: el **origen** del dato.
  - `robot_measured`: medido físicamente por un robot.
  - `synthetic_test`: generado por software (no es una medición).
  - Reservados para otros módulos: `orbital_nasa` y `derived`.
- **`delivery_mode`**: la **vía** por la que llegó el dato. Hoy el módulo solo produce `live`; el contrato compartido reserva `replay` y `emulated_link`.
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

**Solo hace falta una vez.** Para conectar, el programa usa la IP del `.env` y esa clave: nunca el correo ni la contraseña. Con la clave guardada, el panel lo dice con su huella y deja el formulario plegado tras «Cambiar o renovar la clave…». Solo hay que volver a pedirla si el perro la rechaza (error `aes_key_rejected`); después, reinicia el dashboard, porque la clave se lee al arrancar. No se guarda la contraseña ni ningún token de la cuenta.

### Lanzar el dashboard

```powershell
.\.venv\Scripts\python.exe -m terrainx_robot dashboard
```

Abre **http://127.0.0.1:8777** en el navegador. Paneles: cámara en directo (MJPEG), conducción WASD, LiDAR 3D (con guardar y descargar el mapa), estado del robot, autenticación Unitree y diagnóstico.

### Conectar al perro y comprobar que funciona

1. Enciende el Go2, ponlo en la misma red que el PC y **cierra la app oficial de Unitree** (el robot admite un solo cliente).
2. Rellena en `robot\.env`: `TERRAINX_GO2_IP`, `TERRAINX_GO2_MODEL=AIR`, la ruta de la clave y, si sabes, `TERRAINX_GO2_FIRMWARE`.
3. En el dashboard pulsa **Conectar**. Si todo va bien verás:
   - el indicador en verde y el estado `ready_readonly`;
   - la **cámara en directo** en unos segundos (FPS en la esquina);
   - el panel **Estado del robot** (batería, LiDAR, flujos de datos) a medida que el robot lo publica;
   - la nube **LiDAR 3D** actualizándose (vóxeles ocupados, en metros asumidos).
4. **Escanea el entorno** con los botones de arriba a la derecha del visor LiDAR 3D:
   - **papelera** (en «Acumulado»): empieza un mapa SLAM nuevo;
   - lleva el perro por todo el entorno;
   - **pausa**: el mapa acumulado deja de sumar mapas, así lo que ves es lo que se guarda (si cierras la pestaña, se reanuda solo);
   - **descarga**: abre un menú con **«Modelo 3D (.glb)»** y **«Coordenadas (.json)»**. Cualquiera de las dos guarda el **mapa SLAM acumulado** en `runtime/scans/<id>/` y el navegador baja el archivo elegido. Se guardan estos archivos:
     - **`.glb`**: se ve como el visor. Tiene los mismos cubos y colores, las aristas grises y no lleva luz. Lo abren Blender (en «Vista previa del material»; para los colores exactos, Gestión de color → «Estándar»), Babylon y los visores glTF del navegador.
     - **`.coords.json`**: el array `[[x, y, z], …]` en metros con el **centro de cada cubo** (cada cubo va de punto − 0,025 a punto + 0,025 m), uno por vóxel, también los interiores que la malla no dibuja. Usa los ejes del robot, como el `.ply`. Delante lleva el `scan_id`, la clase de evidencia, el marco y el tamaño del cubo.
     - **`.ply`**: malla de cubos con las coordenadas del robot, para CloudCompare y MeshLab. Cada programa le pone su propia luz, así que no se ve igual que el visor.
     - **metadatos y SHA-256**: `point_type = voxel_mesh`, clase `derived`.

   Si el mapa no ha cambiado desde el último guardado (por ejemplo, en pausa), la segunda descarga sale del **mismo escaneo**: no se duplica. Si la conexión se corta, lo acumulado se puede guardar igual.

> Para una nube de puntos **medida** (`robot_measured`, sin el filtro del SLAM) sigue existiendo el comando `capture` del CLI (con el dashboard desconectado del robot: el Go2 admite un solo cliente).

### Conducir con WASD (teleoperación supervisada)

> **Solo con espacio libre y un operador junto al paro de emergencia físico.** El control está **activo por defecto**: en cuanto el robot está conectado, WASD lo mueve (no hay botón «Habilitar»).

1. Conduce manteniendo pulsado:
   - **W / S** — avanzar / retroceder
   - **A / D** — girar izquierda / derecha
   - **Q / E** — desplazamiento lateral
   - **Espacio** — parar
   - Botones de postura: **Levantar / Sentar / Equilibrio / Amortiguar / Recuperarse**
2. El robot **solo se mueve mientras mantienes la tecla**; mientras no pulses nada, no se le envía ninguna orden. Al soltarla, pasar a escribir en un campo de texto, cambiar de ventana, cerrar la pestaña o perder la conexión, se detiene solo (hombre muerto, 0,4 s). Las teclas no cuentan mientras escribes en un campo de texto. El botón **PARAR** está siempre disponible.
3. Límites de velocidad (recortados en el servidor): avance 1,0 m/s · lateral 0,5 m/s · giro 1,5 rad/s; el selector Lento / Normal / Rápido elige dentro de esos topes. Saltos y volteretas están **bloqueados**.

### Mapear zona subterránea desde la interfaz (PC y gafas XR)

El backend del robot hace de puente con la interfaz de TERRAIN-X (`interface/`). En el panel «Entorno 3D» de un mapa cargado aparece **«Mapear zona subterránea»**:

1. **Conexión.** Sale «Conectando a unidad terrestre…»: conecta el Go2 (si no lo estaba) y empieza una misión, que es un mapa acumulado nuevo con la pose del robot apuntada como punto de partida.
2. **Recorrido.** Se ve la cámara, el LiDAR acumulado en directo (lo que va detectando) y el mando: teclado W A S D · Q E · Espacio, o botones de mantener pulsado para las gafas. Tiene las mismas seguridades que el dashboard: hombre muerto, topes de velocidad y PARAR.
3. **«Terminar recorrido».** Se guarda como siempre (`.ply`, `.glb`, `.coords.json`, metadatos y SHA-256) y, además, `<id>.mission.json`: la nube en el marco de la misión. En ese marco el origen es el robot al empezar, x apunta hacia donde miraba, y a su izquierda y z arriba. Es solo un giro más una traslación, así que las distancias no cambian.
4. **Vista previa** de la nube en 3D.
5. **«Añadir al mapa».** Muestra el terreno del modelo 3D y, debajo, la nube, a **escala 1:1 en metros en los tres ejes** (sin la exageración vertical del Plotly). El operador declara el anclaje (desplazamiento este/norte desde el centro, rumbo y profundidad), porque el Go2 no tiene GPS ni brújula. Se descarga el **mapa combinado** (JSON con procedencia) y, si el navegador lo admite, se ve en VR a tamaño real.

Para que funcione:

```powershell
# 1) backend del robot (como siempre). Imprime el CÓDIGO DE EMPAREJAMIENTO
.\.venv\Scripts\python.exe -m terrainx_robot dashboard
# 2) interfaz (otra consola, en interface/): reenvía /robot/* a 127.0.0.1:8777
npm run dev
```

- **En este PC** se abre `http://localhost:3000` y no hace falta código.
- **En las gafas u otro equipo** de la misma red se abre `http://<IP-del-PC>:3000` y se escribe el código de 6 cifras. Aparece en la consola y en el panel «Diagnóstico» del dashboard. Tras 10 códigos erróneos, el robot bloquea el acceso 60 s. El backend sigue escuchando solo en 127.0.0.1: desde la red únicamente se entra por el proxy de la interfaz.
- **«Ver en VR»** necesita un contexto seguro (HTTPS o `localhost`). Con las Quest por cable: `adb reverse tcp:3000 tcp:3000` y abrir `http://localhost:3000` en las gafas (entonces tampoco pide código).
- **Escala.** El terreno del modelo tiene un punto cada ~20–30 m y se dibuja interpolado; la nube del robot va en cubos de 5 cm. Que las medidas coincidan depende de que el LiDAR esté en metros: es lo que se supone, pero falta la prueba con cinta métrica ([docs/VERIFICACION_FISICA.md](docs/VERIFICACION_FISICA.md), apartado 3).
- **El mapa combinado es una DEMOSTRACIÓN.** La posición de la zona subterránea la declara el operador, no está georreferenciada, y así queda escrito en el archivo.

### Qué está probado y qué no

- **Comprobado con Pluffy (Go2 AIR, 14-11-2026):** conexión por cable, cámara (~14 fps), LiDAR (~7,7 Hz), estado del robot y conducción con WASD. El mapa SLAM se guardó como malla PLY (22:18, 40 275 vóxeles, 0,38 s fuera del bucle de la conexión) y como PLY + GLB + coordenadas (23:12, `scan-20261114T221229Z-570c91`, 47 809 cubos): las coordenadas cuadran cubo a cubo con el `.ply` y el `.glb`, y el `.glb` se ve como el visor en three.js y en Blender 4.5.
- **Pendiente con Pluffy:** la pausa del acumulado, el WASD activo por defecto (sin botón «Habilitar») y las unidades y ejes (ver [docs/VERIFICACION_FISICA.md](docs/VERIFICACION_FISICA.md)).
- Three.js se incluye vendorizado en `dashboard/static/vendor/` (MIT) para que el visor 3D funcione **sin internet** en la red del robot.
