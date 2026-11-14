"""Gestor de clave AES-128 con una nube FALSA: sin credenciales ni red reales.

Comprueba que la clave nunca se devuelve ni se filtra, que se guarda fuera del
repositorio y que los errores no exponen secretos.
"""

import json
import re

import pytest

from terrainx_robot.auth.aes_key_manager import AesKeyManager, AuthError, DeviceSummary
from terrainx_robot.config import ConfigError

KEY = "0123456789abcdef0123456789abcdef"
KEY2 = "fedcba9876543210fedcba9876543210"


class FakeDevice:
    def __init__(self, sn, alias="Perro", series="Go2", online=True, key=""):
        self.sn, self.alias, self.series, self.online, self.key = sn, alias, series, online, key


class FakeCloud:
    """Imita UnitreeCloud: login + list_devices. Registra las llamadas."""

    instances = []

    def __init__(self, region, device_type, devices=None, login_error=None):
        self.region, self.device_type = region, device_type
        self.devices = devices if devices is not None else [FakeDevice("SN-GO2-001", key=KEY)]
        self.login_error = login_error
        self.logged_in_with = None
        FakeCloud.instances.append(self)

    def login_email(self, email, password):
        if self.login_error:
            raise self.login_error
        self.logged_in_with = (email, password)
        return "fake-access-token-should-never-be-stored"

    def list_devices(self):
        return self.devices


@pytest.fixture(autouse=True)
def _reset():
    FakeCloud.instances.clear()


def _manager(tmp_path, devices=None, login_error=None, region="global"):
    def factory(reg, dev_type):
        return FakeCloud(reg, dev_type, devices=devices, login_error=login_error)

    return AesKeyManager(tmp_path / "secrets" / "go2.aes", region=region, cloud_factory=factory)


# --------------------------------------------------------------------- listar
def test_listar_no_expone_la_clave(tmp_path):
    mgr = _manager(tmp_path, devices=[
        FakeDevice("SN-A", alias="Alfa", key=KEY),
        FakeDevice("SN-B", alias="Beta", key=""),
    ])
    devices = mgr.list_devices("correo@x.com", "secreta")
    assert [d.sn for d in devices] == ["SN-A", "SN-B"]
    assert devices[0].has_key is True and devices[1].has_key is False
    blob = json.dumps([d.as_dict() for d in devices])
    assert KEY not in blob and "key" not in [k for d in devices for k in d.as_dict()]
    assert "secreta" not in blob


def test_listar_sin_credenciales(tmp_path):
    with pytest.raises(AuthError):
        _manager(tmp_path).list_devices("", "")


def test_error_de_login_no_filtra_la_password(tmp_path):
    mgr = _manager(tmp_path, login_error=RuntimeError("password error for user@x with pass=MI_PASSWORD"))
    with pytest.raises(AuthError) as exc:
        mgr.list_devices("user@x", "MI_PASSWORD")
    assert "MI_PASSWORD" not in str(exc.value)


# --------------------------------------------------------------------- fetch
def test_fetch_guarda_pero_no_devuelve_la_clave(tmp_path):
    mgr = _manager(tmp_path, devices=[FakeDevice("SN-GO2-001", key=KEY)])
    result = mgr.fetch_and_store("correo@x.com", "secreta", "SN-GO2-001")
    assert result["stored"] is True and result["configured"] is True
    assert KEY not in json.dumps(result)                 # no se devuelve la clave
    assert result["fingerprint"].startswith("sha256:")
    assert mgr.store_path.is_file()
    assert KEY in mgr.store_path.read_text(encoding="utf-8")  # sí se guarda en disco
    # Las credenciales no se persisten en ningún sitio del gestor
    assert "secreta" not in mgr.store_path.read_text(encoding="utf-8")


def test_fetch_sn_inexistente(tmp_path):
    mgr = _manager(tmp_path, devices=[FakeDevice("OTRO", key=KEY)])
    with pytest.raises(AuthError, match="no está vinculado"):
        mgr.fetch_and_store("c@x.com", "p", "SN-GO2-001")


def test_fetch_robot_sin_clave(tmp_path):
    mgr = _manager(tmp_path, devices=[FakeDevice("SN-GO2-001", key="")])
    with pytest.raises(AuthError, match="no devolvió una clave"):
        mgr.fetch_and_store("c@x.com", "p", "SN-GO2-001")


def test_region_se_propaga_a_la_nube(tmp_path):
    _manager(tmp_path, region="cn").fetch_and_store("c@x.com", "p", "SN-GO2-001")
    assert FakeCloud.instances[0].region == "cn"
    assert FakeCloud.instances[0].device_type == "Go2"


# --------------------------------------------------------------------- import
def test_importar_clave_valida(tmp_path):
    mgr = _manager(tmp_path)
    res = mgr.import_key(KEY2, sn="SN-X")
    assert res["configured"] and mgr.status()["fingerprint"] == res["fingerprint"]
    assert KEY2 in mgr.store_path.read_text(encoding="utf-8")


def test_importar_desde_texto_con_cabecera(tmp_path):
    mgr = _manager(tmp_path)
    texto = f"# comentario\n# otra linea\n{KEY}\n"
    assert mgr.import_key(texto)["configured"]


def test_importar_clave_invalida_no_muestra_el_valor(tmp_path):
    mgr = _manager(tmp_path)
    secreto = "zz_no_es_hex_pero_es_un_secreto_largo"
    with pytest.raises(AuthError) as exc:
        mgr.import_key(secreto)
    assert secreto not in str(exc.value)
    assert not mgr.store_path.exists()


# --------------------------------------------------------------------- estado
def test_estado_sin_clave(tmp_path):
    assert _manager(tmp_path).status() == {
        "configured": False,
        "store_path": str((tmp_path / "secrets" / "go2.aes").resolve()),
    }


def test_estado_con_clave_no_revela_el_secreto(tmp_path):
    mgr = _manager(tmp_path)
    mgr.import_key(KEY)
    status = mgr.status()
    assert status["configured"] and KEY not in json.dumps(status)
    assert re.fullmatch(r"sha256:[0-9a-f]{8}", status["fingerprint"])


# ------------------------------------------------------------- fuera del repo
def test_rechaza_ruta_dentro_del_repositorio(monkeypatch, tmp_path):
    import terrainx_robot.config as config

    monkeypatch.setattr(config, "find_repo_root", lambda start: tmp_path)
    with pytest.raises(ConfigError, match="dentro del repositorio"):
        AesKeyManager(tmp_path / "robot" / "clave.aes")


# ------------------------------------ regresión: Windows español + WAF 567
def test_cabeceras_de_la_nube_se_sanean_a_ascii(monkeypatch):
    """En Windows en español, time.strftime('%Z') -> 'Hora estándar romance'.

    La librería lo mete en la cabecera HTTP AppTimezone y curl_cffi falla con
    'ascii' codec can't decode byte 0xe1. El cliente que fabricamos debe dejar
    todas las cabeceras en ASCII sin tocar la librería.
    """
    import time as _time

    from terrainx_robot.auth import aes_key_manager as akm

    monkeypatch.setattr(_time, "strftime", lambda fmt: "Hora estándar romance")
    cloud = akm._default_cloud_factory("global", "Go2")
    headers = cloud._headers()
    assert headers["AppTimezone"] == "Hora estndar romance"  # á eliminada
    for k, v in headers.items():
        if isinstance(v, str):
            v.encode("ascii")  # no debe lanzar para ninguna cabecera
    assert len(headers["AppSign"]) == 32  # la firma MD5 queda intacta


def test_cliente_evita_el_bloqueo_waf(monkeypatch):
    """El WAF de Tencent devuelve HTTP 567 si la huella TLS (escritorio) y el
    User-Agent (móvil) no concuerdan. El cliente debe quitar el User-Agent de
    la librería y usar una huella Edge coherente."""
    from terrainx_robot.auth import aes_key_manager as akm

    cloud = akm._default_cloud_factory("global", "Go2")
    # La librería sí define un User-Agent de móvil; nuestras cabeceras no.
    assert "User-Agent" not in cloud._headers()
    # Se reconfiguró la sesión con una de las huellas preferidas (Edge).
    assert getattr(cloud._session, "impersonate", None) in akm._IMPERSONATE_PREFERENCE
