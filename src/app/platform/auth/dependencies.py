"""Dependencias FastAPI reutilizables: get_current_user, require_role."""
from __future__ import annotations

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.platform.auth.models import User
from app.platform.auth.service import decodificar_access_token, get_valid_session

COOKIE_NAME = "session_token"


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
