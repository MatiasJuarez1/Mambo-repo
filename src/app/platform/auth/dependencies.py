"""Dependencias FastAPI reutilizables: get_current_user, require_role."""
from __future__ import annotations

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.platform.auth.models import User
from app.platform.auth.service import get_valid_session

COOKIE_NAME = "session_token"


def get_current_user(
    session_token: str | None = Cookie(default=None, alias=COOKIE_NAME),
    db: DBSession = Depends(get_db),
) -> User:
    """Resuelve el usuario autenticado desde la cookie de sesión.

    Devuelve 401 si la cookie falta, el token no existe o la sesión expiró/fue revocada.
    """
    if not session_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No autenticado",
        )
    session = get_valid_session(db, session_token)
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
