"""Router auth: POST /auth/login, POST /auth/logout, GET /auth/me."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.platform.auth.dependencies import COOKIE_NAME, get_current_user
from app.platform.auth.models import User
from app.platform.auth.schemas import LoginRequest, LoginResponse, LogoutResponse, UserMe
from app.platform.auth.service import authenticate_user, create_session, revoke_session

SESSION_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 días

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(
    body: LoginRequest,
    response: Response,
    db: DBSession = Depends(get_db),
) -> LoginResponse:
    user = authenticate_user(db, body.email, body.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas",
        )
    session = create_session(db, user)
    response.set_cookie(
        key=COOKIE_NAME,
        value=session.token,
        httponly=True,
        samesite="lax",
        max_age=SESSION_TTL_SECONDS,
        secure=False,  # cambiar a True en producción (HTTPS)
    )
    return LoginResponse(user=UserMe.model_validate(user))


@router.post("/logout", response_model=LogoutResponse)
def logout(
    response: Response,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
    session_token: str | None = None,
) -> LogoutResponse:
    from fastapi import Cookie

    # La cookie ya fue validada por get_current_user; la revocamos por token
    # Re-leemos directamente del request en el service para no duplicar lógica.
    # get_current_user ya garantizó que el token es válido; usamos la sesión activa del usuario.
    from app.platform.auth.models import Session as SessionModel
    active = (
        db.query(SessionModel)
        .filter(SessionModel.user_id == current_user.id, SessionModel.revoked_at.is_(None))
        .first()
    )
    if active:
        revoke_session(db, active.token)
    response.delete_cookie(key=COOKIE_NAME)
    return LogoutResponse()


@router.get("/me", response_model=UserMe)
def me(current_user: User = Depends(get_current_user)) -> UserMe:
    return UserMe.model_validate(current_user)
