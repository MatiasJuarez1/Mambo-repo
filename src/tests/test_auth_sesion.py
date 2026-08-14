"""Tests del ciclo de vida de la sesión: login, lectura de identidad y logout.

Dos decisiones del diseño se apoyan en estos tests:

1. **El token solo viaja en la cookie httponly**, nunca en el cuerpo de la respuesta.
   Si el JSON lo devolviera, el frontend podría guardarlo en `localStorage` y un XSS
   se llevaría la sesión entera; con la cookie httponly el JS ni siquiera la ve.
2. **El `jti` se valida contra `sessions` en cada request.** Eso le quita al JWT su
   ventaja de ser stateless, pero es lo que permite cerrar una sesión al instante en
   lugar de esperar a que el token venza.
"""

from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy.orm import Session as DBSession

from app.config import get_settings
from app.platform.auth.dependencies import COOKIE_NAME
from app.platform.auth.models import Session as SesionModel
from app.platform.auth.service import decodificar_access_token


def _cookie_de(respuesta) -> str:
    """La cabecera `Set-Cookie` cruda, para poder mirarle los atributos."""
    return respuesta.headers.get("set-cookie", "")


# ── Login ────────────────────────────────────────────────────────────────────


def test_login_correcto_devuelve_el_usuario_y_una_cookie_httponly(client, crear_usuario):
    """El camino feliz: 200, datos del usuario y la cookie protegida contra JS."""
    crear_usuario(email="admin@mambo.com.ar", password="secreta123", roles=("admin",))

    respuesta = client.post(
        "/auth/login", json={"email": "admin@mambo.com.ar", "password": "secreta123"}
    )

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["user"]["email"] == "admin@mambo.com.ar"
    assert cuerpo["user"]["roles"] == ["admin"]
    assert cuerpo["user"]["is_active"] is True

    cookie = _cookie_de(respuesta)
    assert "httponly" in cookie.lower()
    assert "samesite=lax" in cookie.lower()


def test_el_token_no_viaja_en_el_cuerpo_de_la_respuesta(client, crear_usuario):
    """El JWT solo sale por la cookie: si estuviera en el JSON, un XSS lo leería."""
    crear_usuario()

    respuesta = client.post(
        "/auth/login", json={"email": "admin@mambo.com.ar", "password": "secreta123"}
    )

    assert respuesta.status_code == 200
    assert set(respuesta.json()) == {"message", "user"}
    assert "token" not in respuesta.text


def test_la_cookie_lleva_un_jwt_con_el_jti_de_la_sesion(client, crear_usuario, db: DBSession):
    """La cookie es un JWT firmado y su `jti` apunta a la fila recién creada en `sessions`."""
    usuario = crear_usuario()

    respuesta = client.post(
        "/auth/login", json={"email": "admin@mambo.com.ar", "password": "secreta123"}
    )

    claims = decodificar_access_token(respuesta.cookies[COOKIE_NAME])
    assert claims is not None
    assert claims["sub"] == str(usuario.id)

    sesion = db.query(SesionModel).filter(SesionModel.token_hash == claims["jti"]).one()
    assert sesion.user_id == usuario.id
    assert sesion.is_valid


def test_contrasena_incorrecta_da_401_y_no_deja_cookie(client, crear_usuario):
    """Fallar el login no puede dejar ninguna sesión abierta."""
    crear_usuario()

    respuesta = client.post(
        "/auth/login", json={"email": "admin@mambo.com.ar", "password": "equivocada"}
    )

    assert respuesta.status_code == 401
    assert "detail" in respuesta.json()
    assert COOKIE_NAME not in respuesta.cookies


def test_usuario_inexistente_da_401(client, crear_usuario):
    """Mismo mensaje que con contraseña incorrecta: no se revela si el email existe."""
    crear_usuario()

    respuesta = client.post(
        "/auth/login", json={"email": "nadie@mambo.com.ar", "password": "secreta123"}
    )

    assert respuesta.status_code == 401


def test_usuario_inactivo_da_401(client, crear_usuario):
    """Dar de baja a alguien tiene que impedirle entrar, aunque sepa su contraseña."""
    crear_usuario(email="baja@mambo.com.ar", password="secreta123", is_active=False)

    respuesta = client.post(
        "/auth/login", json={"email": "baja@mambo.com.ar", "password": "secreta123"}
    )

    assert respuesta.status_code == 401
    assert COOKIE_NAME not in respuesta.cookies


# ── Lectura de la identidad (GET /auth/me) ───────────────────────────────────


def test_me_sin_cookie_da_401(client):
    """Sin sesión no hay identidad que devolver."""
    assert client.get("/auth/me").status_code == 401


def test_me_con_sesion_valida_devuelve_el_usuario(client, crear_usuario, iniciar_sesion):
    """Es la única vía que tiene el frontend para saber si hay sesión: la cookie es
    httponly y el JS no puede leerla."""
    usuario = crear_usuario(roles=("staff",))
    iniciar_sesion()

    respuesta = client.get("/auth/me")

    assert respuesta.status_code == 200
    assert respuesta.json() == {
        "id": usuario.id,
        "email": "admin@mambo.com.ar",
        "is_active": True,
        "roles": ["staff"],
        "person_id": None,
    }


def test_sesion_revocada_da_401_aunque_el_jwt_siga_vigente(
    client, crear_usuario, iniciar_sesion, db: DBSession
):
    """El motivo de consultar `sessions` en cada request: revocar de verdad.

    El JWT sigue firmado y sin vencer; lo que lo invalida es la fila revocada.
    """
    crear_usuario()
    token = iniciar_sesion()

    jti = decodificar_access_token(token)["jti"]
    db.query(SesionModel).filter(SesionModel.token_hash == jti).one().revoked_at = datetime.now(
        UTC
    )
    db.commit()

    assert client.get("/auth/me").status_code == 401


def test_usuario_desactivado_despues_del_login_da_401(
    client, crear_usuario, iniciar_sesion, db: DBSession
):
    """Desactivar la cuenta corta el acceso sin necesidad de revocar cada sesión."""
    usuario = crear_usuario()
    iniciar_sesion()

    usuario.is_active = False
    db.commit()

    assert client.get("/auth/me").status_code == 401


def test_cookie_firmada_con_otro_secreto_da_401(client, crear_usuario, iniciar_sesion):
    """Un token con un `jti` real pero firmado por otro no sirve de nada."""
    crear_usuario()
    token = iniciar_sesion()
    jti = decodificar_access_token(token)["jti"]

    falsificado = jwt.encode(
        {"sub": "1", "jti": jti, "exp": datetime.now(UTC) + timedelta(hours=1)},
        "secreto-del-atacante-de-largo-suficiente-para-hs256",
        algorithm=get_settings().jwt_algorithm,
    )
    client.cookies.set(COOKIE_NAME, falsificado)

    assert client.get("/auth/me").status_code == 401


def test_cookie_con_basura_da_401_y_no_500(client):
    """Una cookie manipulada es un 401, nunca un error del servidor."""
    client.cookies.set(COOKIE_NAME, "esto-no-es-un-jwt")

    assert client.get("/auth/me").status_code == 401


# ── Logout ───────────────────────────────────────────────────────────────────


def test_logout_invalida_el_token_usado(client, crear_usuario, iniciar_sesion):
    """Después de salir, la misma cookie ya no abre nada."""
    crear_usuario()
    iniciar_sesion()

    assert client.post("/auth/logout").status_code == 200
    assert client.get("/auth/me").status_code == 401


def test_logout_sin_sesion_da_401(client):
    """No se puede cerrar una sesión que no existe."""
    assert client.post("/auth/logout").status_code == 401


def test_logout_no_toca_las_otras_sesiones_del_usuario(client, crear_usuario, iniciar_sesion):
    """Salir en un dispositivo no puede cerrar la sesión del otro.

    El logout anterior revocaba *la primera* sesión sin revocar del usuario, que es
    justamente la más vieja: quien cerraba sesión en el celular se quedaba adentro
    ahí y afuera de la computadora.
    """
    crear_usuario()
    token_computadora = iniciar_sesion()
    token_celular = iniciar_sesion()
    assert token_computadora != token_celular

    # Sale desde el celular (la sesión más nueva).
    client.cookies.set(COOKIE_NAME, token_celular)
    assert client.post("/auth/logout").status_code == 200

    client.cookies.set(COOKIE_NAME, token_celular)
    assert client.get("/auth/me").status_code == 401, "la sesión propia debía cerrarse"

    client.cookies.set(COOKIE_NAME, token_computadora)
    assert client.get("/auth/me").status_code == 200, "la otra sesión no debía tocarse"


def test_logout_borra_la_cookie_del_navegador(client, crear_usuario, iniciar_sesion):
    """Además de revocar en la base, se pide al navegador que descarte la cookie."""
    crear_usuario()
    iniciar_sesion()

    respuesta = client.post("/auth/logout")

    cookie = _cookie_de(respuesta).lower()
    assert COOKIE_NAME in cookie
    assert 'session_token=""' in cookie or "session_token=;" in cookie or "max-age=0" in cookie
