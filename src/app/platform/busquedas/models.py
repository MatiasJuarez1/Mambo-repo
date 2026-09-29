"""Modelos ORM: busquedas (lo que busca una persona) y busquedas_avisos."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Busqueda(Base):
    """Lo que una persona está buscando: "depto en alquiler en Yerba Buena, hasta $500.000".

    Cada criterio en NULL significa "cualquiera". Cuando entra una propiedad
    disponible que cumple todos, el agente recibe una tarea para ofrecérsela.
    """

    __tablename__ = "busquedas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    person_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("people.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Mismos valores que los enums de `propiedades` (venta/alquiler/temporal, casa/depto/…).
    tipo_operacion: Mapped[str | None] = mapped_column(String(20), nullable=True)
    tipo_propiedad: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ciudad: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # El rango de precio solo se compara con propiedades en la misma moneda.
    moneda: Mapped[str | None] = mapped_column(String(3), nullable=True)
    precio_min: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    precio_max: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    dormitorios_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    activa: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # El agente que la cargó: a él le llegan las tareas de "ofrecer".
    created_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
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

    person: Mapped[object] = relationship("Person", foreign_keys=[person_id])


class BusquedaAviso(Base):
    """Constancia de que ya se avisó esta propiedad para esta búsqueda.

    Sin esto, cada edición de la propiedad (una foto, un typo) volvería a crear
    la misma tarea de "ofrecer" y el agente las recibiría repetidas.
    """

    __tablename__ = "busquedas_avisos"
    __table_args__ = (UniqueConstraint("busqueda_id", "propiedad_id", name="uq_busqueda_aviso"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    busqueda_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("busquedas.id", ondelete="CASCADE"), nullable=False, index=True
    )
    propiedad_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("propiedades.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


__all__ = ["Busqueda", "BusquedaAviso"]
