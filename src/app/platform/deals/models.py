"""Modelos ORM: pipelines, pipeline_stages, deals, deal_parties, comisiones, historial."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
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
from app.formato import redondear


class Pipeline(Base):
    __tablename__ = "pipelines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    stages: Mapped[list[PipelineStage]] = relationship(
        "PipelineStage",
        back_populates="pipeline",
        cascade="all, delete-orphan",
        order_by="PipelineStage.position",
    )
    deals: Mapped[list[Deal]] = relationship("Deal", back_populates="pipeline")


class PipelineStage(Base):
    __tablename__ = "pipeline_stages"
    __table_args__ = (
        UniqueConstraint("pipeline_id", "position", name="uq_stage_position"),
        UniqueConstraint("pipeline_id", "name", name="uq_stage_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pipeline_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pipelines.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    # Etapa terminal: deal ganado o perdido
    is_won: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_lost: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    pipeline: Mapped[Pipeline] = relationship("Pipeline", back_populates="stages")
    deals: Mapped[list[Deal]] = relationship("Deal", back_populates="stage")


class Deal(Base):
    __tablename__ = "deals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)

    pipeline_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pipelines.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    stage_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pipeline_stages.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    assigned_to_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_by_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    property_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("propiedades.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    # Cuándo entró a la etapa actual. Alimenta `dias_en_etapa` en el tablero; se
    # setea al crear y en cada `move_stage`.
    stage_changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="ARS")

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Etapa terminal: copiada del stage al mover para consultas rápidas
    is_won: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_lost: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    pipeline: Mapped[Pipeline] = relationship("Pipeline", back_populates="deals")
    stage: Mapped[PipelineStage] = relationship("PipelineStage", back_populates="deals")
    assigned_to: Mapped[object | None] = relationship("User", foreign_keys=[assigned_to_user_id])
    created_by: Mapped[object] = relationship("User", foreign_keys=[created_by_user_id])
    propiedad: Mapped[object | None] = relationship("Propiedad", back_populates="deals")
    parties: Mapped[list[DealParty]] = relationship(
        "DealParty", back_populates="deal", cascade="all, delete-orphan"
    )
    # Un deal de Alquiler ganado puede tener un contrato (bloque 2a).
    contrato: Mapped[object | None] = relationship("Contrato", back_populates="deal", uselist=False)
    # Bloque 4: honorarios de la operación ganada e historial de estadías por etapa.
    comision: Mapped[Comision | None] = relationship(
        "Comision", back_populates="deal", uselist=False, cascade="all, delete-orphan"
    )
    stage_history: Mapped[list[DealStageHistory]] = relationship(
        "DealStageHistory",
        back_populates="deal",
        cascade="all, delete-orphan",
        order_by="DealStageHistory.entered_at",
    )

    @property
    def is_closed(self) -> bool:
        return self.is_won or self.is_lost

    @property
    def dias_en_etapa(self) -> int:
        # SQLite devuelve la fecha sin zona; se asume UTC, que es como se guardó.
        desde = self.stage_changed_at
        if desde.tzinfo is None:
            desde = desde.replace(tzinfo=UTC)
        return (datetime.now(UTC) - desde).days

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None


class DealParty(Base):
    """Persona vinculada a un deal con un rol específico."""

    __tablename__ = "deal_parties"
    __table_args__ = (UniqueConstraint("deal_id", "person_id", "role", name="uq_deal_party"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    deal_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("deals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    person_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("people.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Rol: comprador | vendedor | interesado | propietario | otro
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    deal: Mapped[Deal] = relationship("Deal", back_populates="parties")
    person: Mapped[object] = relationship("Person", foreign_keys=[person_id])


class Comision(Base):
    """Honorarios de una operación ganada. 1:1 con el deal; el reparto va aparte."""

    __tablename__ = "comisiones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    deal_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("deals.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    monto_operacion: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    moneda: Mapped[str] = mapped_column(String(3), nullable=False, default="ARS")
    # Porcentaje de referencia; manda `monto` (puede cargarse una cifra pactada sin %).
    pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    monto: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    cobrada: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    fecha_cobro: Mapped[date | None] = mapped_column(Date, nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    deal: Mapped[Deal] = relationship("Deal", back_populates="comision")
    reparto: Mapped[list[ComisionReparto]] = relationship(
        "ComisionReparto",
        back_populates="comision",
        cascade="all, delete-orphan",
        order_by="ComisionReparto.pct.desc()",
    )

    @property
    def sin_monto(self) -> bool:
        return self.monto_operacion == 0


class ComisionReparto(Base):
    """Parte de la comisión que le toca a un agente, como % de la comisión."""

    __tablename__ = "comisiones_reparto"
    __table_args__ = (UniqueConstraint("comision_id", "user_id", name="uq_comision_reparto"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    comision_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("comisiones.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)

    comision: Mapped[Comision] = relationship("Comision", back_populates="reparto")
    user: Mapped[object] = relationship("User")

    @property
    def monto(self) -> Decimal:
        return redondear(self.comision.monto * self.pct / Decimal(100))

    @property
    def nombre(self) -> str:
        return self.user.name


class DealStageHistory(Base):
    """Una estadía de un deal en una etapa. `left_at` null = etapa actual."""

    __tablename__ = "deal_stage_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    deal_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("deals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pipeline_stages.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    deal: Mapped[Deal] = relationship("Deal", back_populates="stage_history")
    stage: Mapped[PipelineStage] = relationship("PipelineStage")


__all__ = [
    "Pipeline",
    "PipelineStage",
    "Deal",
    "DealParty",
    "Comision",
    "ComisionReparto",
    "DealStageHistory",
]
