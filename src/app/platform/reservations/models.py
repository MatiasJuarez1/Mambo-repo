"""Modelos ORM: reservations."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Reservation(Base):
    __tablename__ = "reservations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Estado: activa | cancelada | vencida | convertida
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="activa", index=True)

    # Relaciones con dominio propio
    person_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("people.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    created_by_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    # property_id referencia tabla del módulo catálogo (colega); sin FK dura por ahora
    property_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    # Seña / monto acordado (opcional)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="ARS")

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Vencimiento opcional de la reserva
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    person: Mapped[object] = relationship("Person", foreign_keys=[person_id])
    created_by: Mapped[object] = relationship("User", foreign_keys=[created_by_user_id])

    @property
    def is_active(self) -> bool:
        return self.status == "activa"
