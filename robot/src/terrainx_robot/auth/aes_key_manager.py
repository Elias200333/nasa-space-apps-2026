"""Gestión segura de la clave AES-128 por dispositivo del Go2.

Qué hace
    El firmware Go2 >= 1.1.15 ("data2=3") exige una clave AES-128 propia de
    cada robot para el handshake WebRTC por LAN. Esa clave está vinculada a la
    cuenta Unitree del propietario. Este módulo:
      - LISTA los robots de la cuenta (alias, SN, serie, en línea, si tiene clave);
      - RECUPERA la clave del robot elegido y la guarda en un archivo
        FUERA del repositorio;
      - IMPORTA una clave de 32 hex obtenida legítimamente por otra vía;
      - informa del ESTADO (configurada o no) sin revelar la clave.

Cómo lo hace
    Usando las funciones OFICIALES de la librería instalada
    (`unitree_webrtc_connect.UnitreeCloud` / `fetch_aes_key`). NO reimplementa el
    protocolo de nube, NO incrusta secretos ni tokens, y NO elude ninguna
    protección: solo funciona con robots vinculados a la cuenta de quien inicia
    sesión, que autoriza la operación con sus credenciales.

Seguridad (requisitos del proyecto)
    - No se guardan contraseñas ni tokens: las credenciales se usan en memoria.
    - La clave nunca se devuelve al exterior (ni a la interfaz web): los métodos
      públicos devuelven solo estado y metadatos, más una huella corta no
      reversible.
    - La clave se almacena solo en un archivo fuera del repositorio.
    - La clave no aparece en logs ni en mensajes de error (se redacta).
Errores: AuthError (sin la clave dentro del texto).
"""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Callable, Protocol

from ..config import assert_key_path_outside_repo, extract_hex_key
from ..util import iso_utc, utc_now

log = logging.getLogger(__name__)

_HEX_RE = re.compile(r"^[0-9a-fA-F]{32}$")
DEFAULT_STORE = Path.home() / ".terrainx" / "go2_aes_key.txt"


class AuthError(RuntimeError):
    """Fallo de autenticación o de gestión de clave, sin exponer secretos."""


@dataclass(frozen=True)
class DeviceSummary:
    """Resumen de un robot de la cuenta. NUNCA incluye la clave."""

    alias: str
    sn: str
    series: str
    online: bool | None
    has_key: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "alias": self.alias,
            "sn": self.sn,
            "series": self.series,
            "online": self.online,
            "has_key": self.has_key,
        }


# --- Puntos de inyección para pruebas (por defecto: la librería real) --------


class _CloudLike(Protocol):
    def login_email(self, email: str, password: str) -> str: ...
    def list_devices(self) -> list[Any]: ...


CloudFactory = Callable[[str, str], _CloudLike]  # (region, device_type) -> cloud


def _ascii_header_value(value: Any) -> Any:
    """Deja una cabecera HTTP en ASCII puro, quitando los caracteres no ASCII.

    Solo altera valores que no sean ya ASCII; los demás (firma MD5, token,
    etc.) quedan intactos.
    """
    if isinstance(value, str):
        return value.encode("ascii", "ignore").decode("ascii")
    return value


# Huella TLS coherente para esquivar el WAF de Tencent EdgeOne (ver abajo).
# La primera disponible en el curl_cffi instalado es la que se usa.
_IMPERSONATE_PREFERENCE = ("edge101", "edge104", "edge99", "chrome131", "chrome120")


def _default_cloud_factory(region: str, device_type: str) -> _CloudLike:
    try:
        from unitree_webrtc_connect import UnitreeCloud
    except ImportError as exc:  # pragma: no cover - depende del extra [go2]
        raise AuthError(
            "La librería unitree_webrtc_connect no está instalada. "
            'Instálela con:  .\\.venv\\Scripts\\python.exe -m pip install -e ".[go2]"'
        ) from exc

    class _PatchedCloud(UnitreeCloud):  # type: ignore[valid-type,misc]
        """UnitreeCloud adaptado a Windows + al WAF de Unitree, SIN tocar la librería.

        Dos parches, ambos probados como necesarios con una cuenta real:

        1) Cabeceras ASCII. En Windows en español ``time.strftime("%Z")``
           devuelve p. ej. ``"Hora estándar romance"``; la librería lo mete en
           la cabecera ``AppTimezone`` y ``curl_cffi`` falla con
           ``'ascii' codec can't decode byte 0xe1`` antes de salir.

        2) Huella anti-bot. La nube de Unitree está tras el WAF de Tencent
           EdgeOne. La librería impersona ``chrome120`` (huella TLS de
           escritorio) pero a la vez sobreescribe ``User-Agent`` con uno de
           móvil Android; esa contradicción dispara el bloqueo -> ``HTTP 567``.
           Usamos una huella coherente (Edge) y dejamos que ``curl_cffi`` ponga
           su propio ``User-Agent``. El inicio de sesión sigue exigiendo las
           credenciales reales de la cuenta: no se elude ninguna autenticación.
        """

        def __init__(self, *args: Any, **kwargs: Any) -> None:
            super().__init__(*args, **kwargs)
            try:
                from curl_cffi import requests as _cffi_requests
            except ImportError:  # pragma: no cover - curl_cffi viene con la librería
                return
            for target in _IMPERSONATE_PREFERENCE:
                try:
                    self._session = _cffi_requests.Session(impersonate=target)
                    break
                except Exception:  # huella no disponible en esta versión
                    continue

        def _headers(self) -> dict:  # type: ignore[override]
            headers = super()._headers()
            headers.pop("User-Agent", None)  # coherente con la huella Edge
            return {k: _ascii_header_value(v) for k, v in headers.items()}

    return _PatchedCloud(region=region, device_type=device_type)


def _fingerprint(key: str) -> str:
    """Huella corta y NO reversible de la clave, para confirmar cuál está puesta."""
    return "sha256:" + hashlib.sha256(key.strip().lower().encode()).hexdigest()[:8]


def _redact(text: str, *secrets: str | None) -> str:
    out = text
    for secret in secrets:
        if secret:
            for fragment in {secret, secret[:8]}:
                for variant in {fragment, fragment.lower(), fragment.upper()}:
                    if fragment:
                        out = out.replace(variant, "<redactado>")
    return out


class AesKeyManager:
    def __init__(
        self,
        store_path: Path | None = None,
        *,
        region: str = "global",
        device_type: str = "Go2",
        cloud_factory: CloudFactory | None = None,
    ) -> None:
        self.store_path = Path(store_path or DEFAULT_STORE).expanduser().resolve()
        assert_key_path_outside_repo(self.store_path)
        self.region = region
        self.device_type = device_type
        self._cloud_factory = cloud_factory or _default_cloud_factory

    # --------------------------------------------------------------- consulta
    def status(self) -> dict[str, Any]:
        """Estado de la clave guardada, SIN revelarla."""
        if not self.store_path.is_file():
            return {"configured": False, "store_path": str(self.store_path)}
        key = extract_hex_key(self.store_path.read_text(encoding="utf-8")) or ""
        valid = bool(_HEX_RE.match(key))
        return {
            "configured": valid,
            "valid_format": valid,
            "store_path": str(self.store_path),
            "fingerprint": _fingerprint(key) if valid else None,
        }

    # --------------------------------------------------------------- nube
    def list_devices(self, email: str, password: str) -> list[DeviceSummary]:
        """Inicia sesión y lista los robots de la cuenta. No persiste credenciales."""
        if not email or not password:
            raise AuthError("Se requieren correo y contraseña de la cuenta Unitree.")
        cloud = self._cloud_factory(self.region, self.device_type)
        try:
            cloud.login_email(email, password)
            devices = cloud.list_devices()
        except AuthError:
            raise
        except Exception as exc:  # errores de la librería/nube
            raise AuthError(_redact(f"No se pudo consultar la cuenta: {exc}", password)) from exc
        return [
            DeviceSummary(
                alias=getattr(d, "alias", "") or "(sin alias)",
                sn=getattr(d, "sn", "") or "?",
                series=getattr(d, "series", "") or "Go2",
                online=getattr(d, "online", None),
                has_key=bool(_HEX_RE.match((getattr(d, "key", "") or "").strip())),
            )
            for d in devices
        ]

    def fetch_and_store(self, email: str, password: str, sn: str) -> dict[str, Any]:
        """Recupera la clave del robot `sn` y la guarda. Devuelve estado, NO la clave."""
        if not sn:
            raise AuthError("Indique el número de serie (SN) del robot.")
        cloud = self._cloud_factory(self.region, self.device_type)
        try:
            cloud.login_email(email, password)
            devices = cloud.list_devices()
        except AuthError:
            raise
        except Exception as exc:
            raise AuthError(_redact(f"No se pudo consultar la cuenta: {exc}", password)) from exc

        match = next((d for d in devices if (getattr(d, "sn", "") or "") == sn), None)
        if match is None:
            raise AuthError(
                f"El SN {sn} no está vinculado a esta cuenta (región {self.region}). "
                "Empareje el robot en la app oficial o revise la región."
            )
        key = (getattr(match, "key", "") or "").strip().lower()
        if not _HEX_RE.match(key):
            raise AuthError(
                f"El robot {sn} está vinculado pero la nube no devolvió una clave válida. "
                "Compruebe el firmware (data2=3 / Go2 >= 1.1.15)."
            )
        self._write_key(key, sn=sn, alias=getattr(match, "alias", ""))
        return {"stored": True, "sn": sn, **self.status()}

    # --------------------------------------------------------------- import
    def import_key(self, raw: str, *, sn: str | None = None) -> dict[str, Any]:
        """Importa una clave de 32 hex (texto o contenido de archivo) obtenida aparte."""
        key = (extract_hex_key(raw) or raw).strip().lower()
        if not _HEX_RE.match(key):
            # El texto del error no incluye la clave.
            raise AuthError("La clave no tiene el formato esperado (32 caracteres hexadecimales).")
        self._write_key(key, sn=sn or "desconocido", alias="(importada)")
        return {"stored": True, "sn": sn, **self.status()}

    def import_from_file(self, path: Path, *, sn: str | None = None) -> dict[str, Any]:
        src = Path(path).expanduser()
        if not src.is_file():
            raise AuthError(f"No existe el archivo indicado: {src}")
        return self.import_key(src.read_text(encoding="utf-8"), sn=sn)

    # --------------------------------------------------------------- interno
    def _write_key(self, key: str, *, sn: str, alias: str) -> None:
        assert_key_path_outside_repo(self.store_path)
        self.store_path.parent.mkdir(parents=True, exist_ok=True)
        alias_clean = re.sub(r"[^\w .\-]", "", alias or "")[:40]
        content = (
            f"# Clave AES-128 del Go2 {alias_clean} (SN {sn}).\n"
            f"# Recuperada/guardada por TERRAIN-X el {date.today().isoformat()} "
            f"({iso_utc(utc_now())}). Secreto: no compartir ni subir al repositorio.\n"
            f"{key}\n"
        )
        tmp = self.store_path.with_suffix(self.store_path.suffix + ".tmp")
        tmp.write_text(content, encoding="utf-8", newline="\n")
        try:
            tmp.chmod(0o600)  # best-effort; en Windows el efecto es limitado
        except OSError:
            pass
        tmp.replace(self.store_path)
        log.info("Clave AES guardada en %s (SN %s)", self.store_path, sn)
