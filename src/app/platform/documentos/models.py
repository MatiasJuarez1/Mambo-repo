"""Modelos ORM: documentos adjuntos.

Un documento cuelga de exactamente una entidad: propiedad, persona, operación
(deal) o contrato de alquiler. Se modela con cuatro FKs nullable en vez de una
FK polimórfica (`entity_type` + `entity_id`) para conservar la integridad
referencial: con `ondelete=CASCADE` la base borra la fila sola cuando se borra
la entidad dueña. La regla "exactamente una FK cargada" se valida en el
service, no con un CheckConstraint (criterio del resto del repo).
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Documento(Base):
    __tablename__ = "documentos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Catálogo: boleto | reserva_firmada | dni | informe_dominio | anexo_fotografico | otro.
    # Se valida en schemas.TipoDocumento; la base no lleva enum nativo.
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)

    propiedad_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("propiedades.id", ondelete="CASCADE"), nullable=True, index=True
    )
    persona_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("people.id", ondelete="CASCADE"), nullable=True, index=True
    )
    deal_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("deals.id", ondelete="CASCADE"), nullable=True, index=True
    )
    contrato_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("alquileres_contratos.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    archivo_url: Mapped[str] = mapped_column(Text, nullable=False)
    # Lo que recibe `storage.borrar_imagen`; la URL es para el navegador.
    archivo_key: Mapped[str] = mapped_column(String(255), nullable=False)
    nombre_original: Mapped[str] = mapped_column(String(255), nullable=False)
    tamano_bytes: Mapped[int] = mapped_column(Integer, nullable=False)

    subido_por_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    usuario: Mapped[object] = relationship("User", foreign_keys=[subido_por_user_id], lazy="joined")

    @property
    def subido_por(self) -> str:
        return self.usuario.name
