"""Tests de la configuración que habilita el despliegue.

Tres cosas que, mal puestas, se descubren recién en producción y con el sitio caído:
el secreto de firma faltante, la lista de dominios de CORS y la cookie `secure`.
"""

import pytest
from pydantic import ValidationError

from app.config import Settings


def _settings_sin_env() -> Settings:
    """`Settings` aislado del `.env` de la máquina, para probar los defaults reales.

    Los valores se inyectan por variable de entorno y no por argumento porque los
    campos declaran `validation_alias`: el nombre del campo no sirve como kwarg, y
    además así se prueba exactamente el camino que se usa al desplegar.
    """
    return Settings(_env_file=None)


def test_sin_jwt_secret_la_app_no_arranca(monkeypatch):
    """Es la razón de que `jwt_secret` no tenga default.

    Un default de conveniencia se colaría a producción y todos los tokens quedarían
    firmados con un secreto que está publicado en el repositorio. Preferimos que el
    proceso no levante y que el error se vea al desplegar.
    """
    monkeypatch.delenv("JWT_SECRET", raising=False)

    with pytest.raises(ValidationError):
        _settings_sin_env()


def test_cookie_secure_arranca_en_false_para_no_romper_dev(monkeypatch):
    """En dev el frontend habla por http://localhost: con `secure=True` no habría login."""
    monkeypatch.setenv("JWT_SECRET", "cualquiera")

    assert _settings_sin_env().cookie_secure is False


def test_cors_origins_se_parsea_separando_por_comas(monkeypatch):
    """Se escribe como cadena y no como JSON porque termina tipeada en el panel del hosting."""
    monkeypatch.setenv("JWT_SECRET", "cualquiera")
    monkeypatch.setenv("CORS_ORIGINS", "https://mambo.com.ar, https://www.mambo.com.ar")

    assert _settings_sin_env().cors_origins_lista == [
        "https://mambo.com.ar",
        "https://www.mambo.com.ar",
    ]


def test_cors_origins_vacio_no_agrega_ningun_dominio(monkeypatch):
    """Sin la variable puesta la lista queda vacía, no con una cadena vacía adentro.

    Un `""` colado en la lista de orígenes es el tipo de dato que rompe el
    middleware de CORS de manera difícil de diagnosticar.
    """
    monkeypatch.setenv("JWT_SECRET", "cualquiera")
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    assert _settings_sin_env().cors_origins_lista == []

    monkeypatch.setenv("CORS_ORIGINS", " , ")
    assert _settings_sin_env().cors_origins_lista == []


def test_el_ttl_del_token_dura_una_jornada_de_trabajo(monkeypatch):
    """Ocho horas por defecto: se entra a la mañana y no se pide login de nuevo.

    Se mide sobre el default y no sobre `get_settings()` para que el test no dependa
    de lo que cada máquina tenga puesto en su `.env`.
    """
    monkeypatch.setenv("JWT_SECRET", "cualquiera")
    monkeypatch.delenv("JWT_TTL_HORAS", raising=False)

    assert _settings_sin_env().jwt_ttl_horas == 8


def test_cors_sigue_aceptando_localhost_con_credenciales(client):
    """Sin `allow_credentials`, el navegador descarta la cookie y no hay login posible.

    El regex de localhost también tiene que sobrevivir a que se sumen los dominios de
    producción, o el desarrollo local deja de funcionar.
    """
    respuesta = client.get("/health", headers={"Origin": "http://localhost:5174"})

    assert respuesta.headers["access-control-allow-origin"] == "http://localhost:5174"
    assert respuesta.headers["access-control-allow-credentials"] == "true"
