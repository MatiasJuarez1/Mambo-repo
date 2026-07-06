"""Modelos ORM: activities."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Tipo: llamada, visita, tarea, whatsapp, email, otro
    activity_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)

    # Estado: pendiente | hecha | cancelada
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pendiente", index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Usuario staff asignado a la actividad
    assigned_to_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Usuario que creó la actividad
    created_by_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    # FKs opcionales a otras entidades del dominio
    person_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("people.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # property_id y listing_id referencian tablas del módulo catálogo (colega)
    # Se validan a nivel de aplicación, no con FK hasta que ambos módulos compartan la misma DB
    property_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    listing_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    assigned_to: Mapped[object | None] = relationship(
        "User", foreign_keys=[assigned_to_user_id]
    )
    created_by: Mapped[object] = relationship(
        "User", foreign_keys=[created_by_user_id]
    )
    person: Mapped[object | None] = relationship("Person", foreign_keys=[person_id])
