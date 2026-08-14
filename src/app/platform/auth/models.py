"""Modelos ORM: users, roles, user_roles, sessions.

**Estos modelos reflejan un esquema que ya existe en la base**; no lo definen. Las
tablas fueron creadas aparte (no hay Alembic en el repo) y mandan ellas, así que los
nombres de columna acá tienen que calzar exactamente con MySQL. Si algo no coincide,
los tests igual pasan —corren sobre SQLite creando las tablas *desde* estos modelos—
pero la aplicación falla contra la base real con `Unknown column`. Antes de tocar un
nombre de columna, verificalo contra `INFORMATION_SCHEMA`.
"""
from __future__ import annotations

import secrets
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    user_roles: Mapped[list[UserRole]] = relationship("UserRole", back_populates="role")


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    user: Mapped[User] = relationship("User", back_populates="user_roles")
    role: Mapped[Role] = relationship("Role", back_populates="user_roles")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # `name` es NOT NULL y sin default en la base: un alta que no lo complete falla.
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Borrado lógico. `get_user_by_email` lo filtra: sin eso, un usuario dado de baja
    # seguiría pudiendo iniciar sesión.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    person_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("people.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    user_roles: Mapped[list[UserRole]] = relationship(
        "UserRole", back_populates="user", cascade="all, delete-orphan"
    )
    person: Mapped[object | None] = relationship(
        "Person", back_populates="users", foreign_keys="User.person_id"
    )
    sessions: Mapped[list[Session]] = relationship(
        "Session", back_populates="user", cascade="all, delete-orphan"
    )

    @property
    def roles(self) -> list[str]:
        return [ur.role.name for ur in self.user_roles]


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # En la base la columna se llama `token_hash` y es VARCHAR(255). Guarda el `jti`
    # del JWT, que es lo que identifica a esta sesión y permite revocarla.
    token_hash: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True,
        default=lambda: secrets.token_hex(32),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship("User", back_populates="sessions")

    @property
    def is_valid(self) -> bool:
        """Una sesión vale mientras no haya sido revocada y no haya vencido.

        `expires_at` se normaliza a UTC porque no todos los motores devuelven la marca
        con zona horaria: PostgreSQL sí, pero SQLite y MySQL guardan un DATETIME pelado
        y SQLAlchemy lo entrega *naive*. Sin normalizar, la comparación contra un
        `datetime` con zona levanta TypeError y cada request autenticado sería un 500.
        """
        now = datetime.now(UTC)
        expira = self.expires_at
        if expira.tzinfo is None:
            expira = expira.replace(tzinfo=UTC)
        return self.revoked_at is None and expira > now
