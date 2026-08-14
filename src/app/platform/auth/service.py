"""Lógica de negocio de autenticación: hash, login, logout, sesiones."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from sqlalchemy.orm import Session as DBSession

from app.config import get_settings
from app.platform.auth.models import Session, User

SESSION_TTL_HOURS = 24 * 7  # 7 días


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ---------------------------------------------------------------------------
# User lookup
# ---------------------------------------------------------------------------

def get_user_by_email(db: DBSession, email: str) -> User | None:
    """Busca por email, descartando los usuarios dados de baja.

    El filtro por `deleted_at` es parte de la autenticación, no una comodidad: sin él
    un usuario borrado seguiría pudiendo iniciar sesión, porque el borrado en esta
    base es lógico y la fila nunca desaparece.
    """
    return (
        db.query(User)
        .filter(User.email == email, User.deleted_at.is_(None))
        .first()
    )


# ---------------------------------------------------------------------------
# Session management
# ---------------------------------------------------------------------------

def create_session(db: DBSession, user: User, ttl_horas: int | None = None) -> Session:
    """Crea la fila de `sessions` que respalda un token.

    `ttl_horas` existe para que el login la alinee con la vida del JWT: si la fila
    caducara antes, la sesión moriría con el token todavía vigente; si caducara
    después, un token ya vencido seguiría figurando como activo en la base.
    """
    horas = SESSION_TTL_HOURS if ttl_horas is None else ttl_horas
    expires_at = datetime.now(UTC) + timedelta(hours=horas)
    session = Session(user_id=user.id, expires_at=expires_at)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_valid_session(db: DBSession, token: str) -> Session | None:
    session = db.query(Session).filter(Session.token_hash == token).first()
    if session and session.is_valid:
        return session
    return None


def revoke_session(db: DBSession, token: str) -> None:
    session = db.query(Session).filter(Session.token_hash == token).first()
    if session and session.revoked_at is None:
        session.revoked_at = datetime.now(UTC)
        db.commit()


# ---------------------------------------------------------------------------
# Tokens JWT
# ---------------------------------------------------------------------------

def crear_access_token(user: User, jti: str) -> str:
    """Firma el JWT que viaja en la cookie de sesión.

    El `jti` es el identificador de la fila de `sessions` que respalda al token, y
    es lo único que permite darlo de baja antes de que venza: un JWT firmado, por
    sí solo, vale hasta su `exp` y no hay manera de retirarlo de circulación.
    """
    settings = get_settings()
    ahora = datetime.now(UTC)
    payload = {
        "sub": str(user.id),  # el estándar JWT exige `sub` como cadena, no como entero
        "jti": jti,
        "iat": ahora,
        "exp": ahora + timedelta(hours=settings.jwt_ttl_horas),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decodificar_access_token(token: str) -> dict | None:
    """Devuelve los claims del JWT, o `None` si el token no es de fiar.

    Todo lo que salga mal —firma inválida, token vencido, cadena malformada— se
    traduce a `None` en vez de propagar la excepción de PyJWT: el token llega en
    una cookie que cualquiera puede editar, y dejar salir la excepción convertiría
    cada token roto en un 500 del servidor en lugar del 401 que corresponde.
    """
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None


# ---------------------------------------------------------------------------
# Login flow
# ---------------------------------------------------------------------------

def authenticate_user(db: DBSession, email: str, password: str) -> User | None:
    user = get_user_by_email(db, email)
    if not user or not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    # La base tiene la columna para esto y es el único rastro de quién entró y cuándo.
    user.last_login_at = datetime.now(UTC)
    db.commit()
    return user
