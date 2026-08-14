"""Modelos ORM: pipelines, pipeline_stages, deals, deal_parties."""
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

    # property_id referencia tabla del módulo catálogo; sin FK dura
    property_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

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
    parties: Mapped[list[DealParty]] = relationship(
        "DealParty", back_populates="deal", cascade="all, delete-orphan"
    )

    @property
    def is_closed(self) -> bool:
        return self.is_won or self.is_lost

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None


class DealParty(Base):
    """Persona vinculada a un deal con un rol específico."""

    __tablename__ = "deal_parties"
    __table_args__ = (
        UniqueConstraint("deal_id", "person_id", "role", name="uq_deal_party"),
    )

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


__all__ = ["Pipeline", "PipelineStage", "Deal", "DealParty"]
