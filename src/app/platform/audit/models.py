"""Modelos ORM: audit_log."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AuditLog(Base):
    """Un cambio sobre una entidad sensible: quién, cuándo, qué y de qué valor a cuál.

    Las filas las escribe solo `service` (enganchado a los flush de SQLAlchemy),
    nunca un endpoint: así ningún camino de código puede olvidarse de registrar.
    """

    __tablename__ = "audit_log"
    __table_args__ = (Index("ix_audit_log_entidad", "entidad", "entidad_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # NULL: el cambio no lo hizo nadie logueado (scripts, cron, el sitio público).
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    entidad: Mapped[str] = mapped_column(String(40), nullable=False)
    entidad_id: Mapped[int] = mapped_column(Integer, nullable=False)
    # crear | editar | baja | borrar
    accion: Mapped[str] = mapped_column(String(20), nullable=False)
    # {"campo": [antes, después]}; en `crear` y `borrar`, los valores al momento.
    cambios: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False, index=True
    )

    usuario: Mapped[object | None] = relationship("User", foreign_keys=[user_id])


__all__ = ["AuditLog"]
