"""Lógica de negocio de autenticación: hash, login, logout, sesiones."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
from sqlalchemy.orm import Session as DBSession

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
    return db.query(User).filter(User.email == email).first()


# ---------------------------------------------------------------------------
# Session management
# ---------------------------------------------------------------------------

def create_session(db: DBSession, user: User) -> Session:
    expires_at = datetime.now(timezone.utc) + timedelta(hours=SESSION_TTL_HOURS)
    session = Session(user_id=user.id, expires_at=expires_at)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_valid_session(db: DBSession, token: str) -> Session | None:
    session = db.query(Session).filter(Session.token == token).first()
    if session and session.is_valid:
        return session
    return None


def revoke_session(db: DBSession, token: str) -> None:
    session = db.query(Session).filter(Session.token == token).first()
    if session and session.revoked_at is None:
        session.revoked_at = datetime.now(timezone.utc)
        db.commit()


# ---------------------------------------------------------------------------
# Login flow
# ---------------------------------------------------------------------------

def authenticate_user(db: DBSession, email: str, password: str) -> User | None:
    user = get_user_by_email(db, email)
    if not user or not user.is_active:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user
