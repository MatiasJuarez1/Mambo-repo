"""Router auth: POST /auth/login, POST /auth/logout, GET /auth/me."""
from __future__ import annotations

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session as DBSession

from app.config import get_settings
from app.database import get_db
from app.platform.auth.dependencies import COOKIE_NAME, get_current_user
from app.platform.auth.models import User
from app.platform.auth.schemas import LoginRequest, LoginResponse, LogoutResponse, UserMe
from app.platform.auth.service import (
    authenticate_user,
    crear_access_token,
    create_session,
    decodificar_access_token,
    revoke_session,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(
    body: LoginRequest,
    response: Response,
    db: DBSession = Depends(get_db),
) -> LoginResponse:
    """Verifica las credenciales y deja la sesión abierta en una cookie httponly.

    El token **no** se devuelve en el cuerpo a propósito: si el frontend pudiera
    leerlo, terminaría guardándolo en `localStorage` y cualquier XSS del panel se
    llevaría la sesión entera. Con la cookie httponly el JS ni siquiera la ve.
    """
    settings = get_settings()
    user = authenticate_user(db, body.email, body.password)
    if not user:
        # Mismo mensaje para email inexistente, contraseña incorrecta y usuario dado
        # de baja: distinguirlos le confirmaría a un atacante qué emails existen.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas",
        )
    # La fila de `sessions` nace primero porque su `token_hash` es el `jti` que se
    # firma dentro del JWT; es lo que después permite revocar *este* token en particular.
    session = create_session(db, user, ttl_horas=settings.jwt_ttl_horas)
    response.set_cookie(
        key=COOKIE_NAME,
        value=crear_access_token(user, session.token_hash),
        httponly=True,
        samesite=settings.cookie_samesite,
        max_age=settings.jwt_ttl_horas * 3600,
        secure=settings.cookie_secure,
    )
    return LoginResponse(user=UserMe.model_validate(user))


@router.post("/logout", response_model=LogoutResponse)
def logout(
    response: Response,
    session_token: str | None = Cookie(default=None, alias=COOKIE_NAME),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
) -> LogoutResponse:
    """Cierra la sesión **de este request**, no cualquiera del usuario.

    Se revoca el `jti` que viene en el JWT recibido. La versión anterior buscaba la
    primera sesión sin revocar del usuario, que es la más vieja: con el panel abierto
    en la computadora y en el celular, salir en uno cerraba el otro.

    `current_user` no se usa en el cuerpo, pero es la dependencia que garantiza el 401
    cuando no hay sesión (y de paso valida la cookie antes de tocar la base).
    """
    settings = get_settings()
    claims = decodificar_access_token(session_token) if session_token else None
    if claims and claims.get("jti"):
        revoke_session(db, claims["jti"])
    # Los atributos tienen que coincidir con los del `set_cookie` del login o el
    # navegador no reconoce la cookie como la misma y no la borra.
    response.delete_cookie(
        key=COOKIE_NAME,
        httponly=True,
        samesite=settings.cookie_samesite,
        secure=settings.cookie_secure,
    )
    return LogoutResponse()


@router.get("/me", response_model=UserMe)
def me(current_user: User = Depends(get_current_user)) -> UserMe:
    """Identidad de la sesión actual.

    Es la única vía que tiene el frontend para saber si hay sesión viva: la cookie es
    httponly, así que el JS no puede inspeccionarla y tiene que preguntar acá.
    """
    return UserMe.model_validate(current_user)
