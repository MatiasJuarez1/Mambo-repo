"""Configuración de la inmobiliaria: una sola fila (id=1).

Es la única tabla del backend que sabe cómo se llama la inmobiliaria. Está en
tabla y no en código para que convertir el producto en multi-inmobiliaria sea
agregar un `inmobiliaria_id` a las demás, no rehacer módulos.
"""
from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import DateTime, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Inmobiliaria(Base):
    __tablename__ = "inmobiliaria"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    # Clave del archivo en el almacenamiento, para poder borrar el logo anterior.
    logo_storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cuit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    direccion: Mapped[str | None] = mapped_column(String(255), nullable=True)
    honorarios_venta_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    honorarios_alquiler_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )
