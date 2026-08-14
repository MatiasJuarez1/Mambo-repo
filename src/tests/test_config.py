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


def test_se_recortan_los_saltos_de_linea_al_pegar_variables(monkeypatch):
    """Pegar en el panel de un hosting arrastra un `\\n` final que no se ve.

    Ya pasó al desplegar: `DATABASE_URL` quedó con un salto de línea y, como el
    nombre de la base es lo último de la URL, Postgres respondía
    `database "postgres\\n" does not exist`. El mismo `\\n` en el secreto de R2
    daría un `SignatureDoesNotMatch`, que parece un problema de permisos.
    """
    monkeypatch.setenv("JWT_SECRET", "cualquiera")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg2://u:p@host:5432/postgres\n")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "  un-secreto  ")

    settings = _settings_sin_env()

    assert settings.database_url == "postgresql+psycopg2://u:p@host:5432/postgres"
    assert settings.r2_secret_access_key == "un-secreto"


def _entorno_r2_completo(monkeypatch) -> None:
    """Deja el entorno con una configuración de R2 válida, para romperla de a una."""
    monkeypatch.setenv("JWT_SECRET", "cualquiera")
    monkeypatch.setenv("STORAGE_BACKEND", "r2")
    monkeypatch.setenv("R2_ENDPOINT_URL", "https://cuenta.r2.cloudflarestorage.com")
    monkeypatch.setenv("R2_BUCKET", "un-bucket")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "una-key")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "un-secreto")
    monkeypatch.setenv("R2_PUBLIC_BASE_URL", "https://pub-abc.r2.dev")


def test_storage_local_no_exige_credenciales_de_r2(monkeypatch):
    """El modo de desarrollo tiene que arrancar sin ninguna cuenta en la nube."""
    monkeypatch.setenv("JWT_SECRET", "cualquiera")
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    for variable in ("R2_ENDPOINT_URL", "R2_BUCKET", "R2_ACCESS_KEY_ID",
                     "R2_SECRET_ACCESS_KEY", "R2_PUBLIC_BASE_URL"):
        monkeypatch.delenv(variable, raising=False)

    assert _settings_sin_env().storage_backend == "local"


@pytest.mark.parametrize(
    "faltante",
    ["R2_ENDPOINT_URL", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY",
     "R2_PUBLIC_BASE_URL"],
)
def test_r2_incompleto_no_deja_arrancar(monkeypatch, faltante):
    """Sin la configuración completa, la app aceptaría fotos y las perdería.

    Que falle al arrancar es preferible a un panel que parece funcionar mientras
    tira los archivos de la inmobiliaria a la nada.
    """
    _entorno_r2_completo(monkeypatch)
    monkeypatch.delenv(faltante, raising=False)

    with pytest.raises(ValidationError, match=faltante):
        _settings_sin_env()


def test_el_endpoint_s3_como_url_publica_se_rechaza(monkeypatch):
    """R2 tiene dos dominios y confundirlos es el error clásico.

    El endpoint S3 exige request firmada, así que si se guarda como URL pública
    las fotos suben bien y se ven todas rotas con un 401. El síntoma aparece
    lejos de la causa, así que se ataja acá.
    """
    _entorno_r2_completo(monkeypatch)
    monkeypatch.setenv("R2_PUBLIC_BASE_URL", "https://cuenta.r2.cloudflarestorage.com")

    with pytest.raises(ValidationError, match="endpoint S3"):
        _settings_sin_env()


def test_samesite_none_sin_secure_no_deja_arrancar(monkeypatch):
    """El navegador descarta esa cookie de plano y nadie podría iniciar sesión.

    Sin este chequeo el síntoma sería un login que responde 200 y vuelve a la
    pantalla de login, que no señala en absoluto a la configuración.
    """
    monkeypatch.setenv("JWT_SECRET", "cualquiera")
    monkeypatch.setenv("COOKIE_SAMESITE", "none")
    monkeypatch.setenv("COOKIE_SECURE", "False")

    with pytest.raises(ValidationError, match="COOKIE_SECURE"):
        _settings_sin_env()


def test_cors_sigue_aceptando_localhost_con_credenciales(client):
    """Sin `allow_credentials`, el navegador descarta la cookie y no hay login posible.

    El regex de localhost también tiene que sobrevivir a que se sumen los dominios de
    producción, o el desarrollo local deja de funcionar.
    """
    respuesta = client.get("/health", headers={"Origin": "http://localhost:5174"})

    assert respuesta.headers["access-control-allow-origin"] == "http://localhost:5174"
    assert respuesta.headers["access-control-allow-credentials"] == "true"
