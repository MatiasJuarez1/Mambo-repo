"""Tests de la emisión y validación del JWT que transporta la sesión.

Lo que se prueba acá es el contrato de `decodificar_access_token`: **nunca** propaga
una excepción de PyJWT. Un token roto llega desde afuera, por una cookie que
cualquiera puede editar; si la excepción saliera, un atacante convertiría cada
token inválido en un 500 del servidor en vez de un 401.
"""

from datetime import UTC, datetime, timedelta

import jwt

from app.config import get_settings
from app.platform.auth.models import User
from app.platform.auth.service import crear_access_token, decodificar_access_token

JTI_DE_PRUEBA = "a" * 64  # mismo largo que `secrets.token_hex(32)`, que es lo que usa `sessions`


def _usuario(id_: int = 7) -> User:
    """Usuario suelto, sin base: firmar un token solo necesita el id."""
    return User(id=id_, name="Admin", email="admin@mambo.com.ar", password_hash="no-se-usa")


def test_token_valido_hace_round_trip():
    """Lo que se firma es lo que se lee de vuelta."""
    token = crear_access_token(_usuario(7), JTI_DE_PRUEBA)

    claims = decodificar_access_token(token)

    assert claims is not None
    assert claims["sub"] == "7"  # el estándar JWT exige `sub` como cadena
    assert claims["jti"] == JTI_DE_PRUEBA
    assert claims["exp"] > claims["iat"]


def test_firma_alterada_devuelve_none():
    """Manipular el payload rompe la firma: es el punto de tener un JWT firmado."""
    token = crear_access_token(_usuario(7), JTI_DE_PRUEBA)
    cabecera, payload, firma = token.split(".")
    alterado = f"{cabecera}.{payload}.{firma[:-4]}xxxx"

    assert decodificar_access_token(alterado) is None


def test_token_vencido_devuelve_none():
    """Un token expirado no vale, aunque la firma sea nuestra."""
    settings = get_settings()
    vencido = jwt.encode(
        {
            "sub": "7",
            "jti": JTI_DE_PRUEBA,
            "iat": datetime.now(UTC) - timedelta(hours=2),
            "exp": datetime.now(UTC) - timedelta(hours=1),
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )

    assert decodificar_access_token(vencido) is None


def test_token_firmado_con_otro_secreto_devuelve_none():
    """Un token bien formado pero de otra clave es exactamente el ataque a evitar."""
    settings = get_settings()
    ajeno = jwt.encode(
        {
            "sub": "7",
            "jti": JTI_DE_PRUEBA,
            "exp": datetime.now(UTC) + timedelta(hours=1),
        },
        "otro-secreto-cualquiera-de-largo-suficiente-para-hs256",
        algorithm=settings.jwt_algorithm,
    )

    assert decodificar_access_token(ajeno) is None


def test_basura_devuelve_none():
    """Cualquier cadena que ni siquiera parezca un JWT tiene que caer sin explotar."""
    for basura in ["", "no-es-un-jwt", "a.b.c", "....", "eyJhbGciOiJIUzI1NiJ9.x"]:
        assert decodificar_access_token(basura) is None


def test_el_jti_entra_en_la_columna_de_sessions():
    """El `jti` se guarda en `sessions.token_hash`, que es `String(255)`.

    Si algún día se cambia cómo se genera el `jti` y pasara de 64 caracteres, en
    PostgreSQL el insert falla en producción y no en los tests (SQLite no corta las
    cadenas). Este test deja la restricción escrita.
    """
    from app.platform.auth.models import Session as SesionModel

    largo_columna = SesionModel.__table__.c.token_hash.type.length
    claims = decodificar_access_token(crear_access_token(_usuario(), JTI_DE_PRUEBA))

    assert claims is not None
    assert len(claims["jti"]) <= largo_columna
