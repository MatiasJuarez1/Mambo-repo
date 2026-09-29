"""Dependencias FastAPI reutilizables: get_current_user, require_role y el token del cron."""

from __future__ import annotations

import hmac

from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.config import get_settings
from app.database import get_db
from app.platform.auth.models import User
from app.platform.auth.service import decodificar_access_token, get_valid_session

COOKIE_NAME = "session_token"
# Dónde queda el usuario del request dentro de `session.info`; la lee `audit.service`.
CLAVE_USUARIO_AUDITORIA = "usuario_id"


def get_current_user(
    session_token: str | None = Cookie(default=None, alias=COOKIE_NAME),
    db: DBSession = Depends(get_db),
) -> User:
    """Resuelve el usuario autenticado desde el JWT que viaja en la cookie.

    Son dos comprobaciones, no una: primero la firma y el vencimiento del token, y
    después que su `jti` siga vivo en `sessions`. La segunda cuesta una consulta por
    request y le quita al JWT su ventaja de ser stateless, pero es la única forma de
    cerrar una sesión al instante; sin ella, un token robado seguiría abriendo el
    panel hasta su `exp` y no habría manera de retirarlo.

    Devuelve 401 si falta la cookie, el token no es válido, la sesión fue revocada o
    expiró, o el usuario quedó inactivo.
    """
    if not session_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No autenticado",
        )
    claims = decodificar_access_token(session_token)
    jti = claims.get("jti") if claims else None
    # El usuario sale de la fila de `sessions` y no del claim `sub`: así la identidad
    # la decide la base y no el contenido del token.
    session = get_valid_session(db, jti) if jti else None
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión inválida o expirada",
        )
    user = session.user
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario inactivo",
        )
    # Para el registro de auditoría: FastAPI entrega esta misma sesión al endpoint,
    # así que todo lo que se guarde en el request queda a nombre de este usuario.
    db.info[CLAVE_USUARIO_AUDITORIA] = user.id
    return user


def require_role(*role_names: str):
    """Fábrica de dependencias: verifica que el usuario tenga al menos uno de los roles dados.

    Uso:
        @router.post("/...", dependencies=[Depends(require_role("staff", "admin"))])
        o como parámetro:
        current_user: User = Depends(require_role("admin"))
    """

    def _check(current_user: User = Depends(get_current_user)) -> User:
        user_roles = {ur.role.name for ur in current_user.user_roles}
        if not user_roles.intersection(role_names):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permisos insuficientes",
            )
        return current_user

    return _check


def require_token_recordatorios(
    token: str | None = Header(default=None, alias="X-Recordatorios-Token"),
) -> None:
    """Autentica al cron que dispara el email diario de recordatorios.

    No usa la cookie de sesión porque quien llama no es una persona. Sin
    `RECORDATORIOS_TOKEN` en el servidor el endpoint responde 404, no 401: así
    no se anuncia que existe algo que abrir.
    """
    esperado = get_settings().recordatorios_token
    if not esperado:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
    if not token or not hmac.compare_digest(token.encode(), esperado.encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
