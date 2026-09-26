"""Modelos ORM: alquileres_contratos, alquileres_contrato_partes, alquileres_ajustes.

El monto vigente **no se guarda**: es el `monto_nuevo` del último ajuste aplicado
o, si no hay ninguno, `monto_inicial`. Así nunca queda desincronizado del
historial de ajustes.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class IndiceAjuste(StrEnum):
    icl = "icl"
    ipc = "ipc"
    uva = "uva"
    casa_propia = "casa_propia"
    porcentaje_fijo = "porcentaje_fijo"
    sin_ajuste = "sin_ajuste"


class EstadoContrato(StrEnum):
    vigente = "vigente"
    finalizado = "finalizado"
    rescindido = "rescindido"


class RolParteContrato(StrEnum):
    inquilino = "inquilino"
    propietario = "propietario"
    garante = "garante"


class EstadoAjuste(StrEnum):
    pendiente = "pendiente"
    aplicado = "aplicado"
    omitido = "omitido"


class EstadoCobro(StrEnum):
    """Solo refleja pagos. "Vencido" se deriva de la fecha en la consulta, nunca se guarda."""

    pendiente = "pendiente"
    parcial = "parcial"
    pagado = "pagado"
    anulado = "anulado"


class MedioPago(StrEnum):
    efectivo = "efectivo"
    transferencia = "transferencia"
    otro = "otro"


class TipoGasto(StrEnum):
    expensas = "expensas"
    reparacion = "reparacion"
    impuesto = "impuesto"
    otro = "otro"


class EstadoLiquidacion(StrEnum):
    emitida = "emitida"
    pagada = "pagada"


def _ahora() -> datetime:
    return datetime.now(UTC)


class Contrato(Base):
    __tablename__ = "alquileres_contratos"
    __table_args__ = (Index("ix_alquileres_contratos_property_estado", "property_id", "estado"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    property_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("propiedades.id", ondelete="RESTRICT"), nullable=False
    )
    # Solo si nació del pipeline. Unique: un deal tiene a lo sumo un contrato.
    deal_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("deals.id", ondelete="SET NULL"), nullable=True, unique=True
    )
    # Lo llena la renovación. Unique: un contrato se renueva una sola vez.
    contrato_anterior_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("alquileres_contratos.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
    )
    fecha_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_fin: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # Día del mes en que vence el alquiler (1-28). Lo usa el bloque 2b (cobros).
    dia_vencimiento: Mapped[int] = mapped_column(Integer, nullable=False)
    monto_inicial: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    moneda: Mapped[str] = mapped_column(String(3), nullable=False, default="ARS")
    indice: Mapped[IndiceAjuste] = mapped_column(
        SAEnum(IndiceAjuste, name="indice_ajuste"), nullable=False
    )
    frecuencia_meses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    porcentaje_fijo: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    # Sin comportamiento en 2a: son el enganche del 2b (cobros y liquidaciones).
    administrado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    honorarios_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    # Override del punitorio diario de la inmobiliaria; null = usa el de ella.
    punitorio_diario_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 3), nullable=True)
    estado: Mapped[EstadoContrato] = mapped_column(
        SAEnum(EstadoContrato, name="estado_contrato"),
        nullable=False,
        default=EstadoContrato.vigente,
    )
    fecha_rescision: Mapped[date | None] = mapped_column(Date, nullable=True)
    motivo_rescision: Mapped[str | None] = mapped_column(Text, nullable=True)
    pdf_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    # Clave del archivo en el almacenamiento, para poder borrar el PDF anterior.
    pdf_storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_ahora, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_ahora, onupdate=_ahora, nullable=False
    )

    propiedad: Mapped[object] = relationship("Propiedad", back_populates="contratos")
    deal: Mapped[object | None] = relationship("Deal", back_populates="contrato")
    created_by: Mapped[object] = relationship("User", foreign_keys=[created_by_user_id])
    partes: Mapped[list[ContratoParte]] = relationship(
        back_populates="contrato", cascade="all, delete-orphan", order_by="ContratoParte.id"
    )
    ajustes: Mapped[list[Ajuste]] = relationship(
        back_populates="contrato", cascade="all, delete-orphan", order_by="Ajuste.fecha_prevista"
    )
    contrato_anterior: Mapped[Contrato | None] = relationship(
        "Contrato",
        remote_side="Contrato.id",
        foreign_keys="Contrato.contrato_anterior_id",
        back_populates="renovacion",
    )
    renovacion: Mapped[Contrato | None] = relationship(
        "Contrato",
        foreign_keys="Contrato.contrato_anterior_id",
        back_populates="contrato_anterior",
        uselist=False,
    )
    cobros: Mapped[list[Cobro]] = relationship(
        back_populates="contrato", cascade="all, delete-orphan", order_by="Cobro.periodo"
    )
    gastos: Mapped[list[Gasto]] = relationship(
        back_populates="contrato", cascade="all, delete-orphan", order_by="Gasto.fecha"
    )
    liquidaciones: Mapped[list[Liquidacion]] = relationship(
        back_populates="contrato", order_by="Liquidacion.periodo.desc()"
    )

    @property
    def monto_vigente(self) -> Decimal:
        aplicados = [a for a in self.ajustes if a.estado == EstadoAjuste.aplicado]
        if not aplicados:
            return self.monto_inicial
        return max(aplicados, key=lambda a: a.fecha_prevista).monto_nuevo

    @property
    def proximo_ajuste(self) -> date | None:
        pendientes = [a.fecha_prevista for a in self.ajustes if a.estado == EstadoAjuste.pendiente]
        return min(pendientes) if pendientes else None

    def monto_vigente_a(self, fecha: date) -> Decimal:
        """Monto que regía en `fecha`: el último ajuste aplicado con `fecha_prevista <= fecha`."""
        aplicados = [
            a for a in self.ajustes
            if a.estado == EstadoAjuste.aplicado and a.fecha_prevista <= fecha
        ]  # fmt: skip
        if not aplicados:
            return self.monto_inicial
        return max(aplicados, key=lambda a: a.fecha_prevista).monto_nuevo

    @property
    def vencidos(self) -> int:
        return sum(1 for c in self.cobros if c.vencido)

    @property
    def resumen_cobros(self) -> dict | None:
        """Para la ficha: cuántos períodos están vencidos, cuánto suman y cuándo vence
        el próximo con saldo. None si el contrato no es administrado."""
        if not self.administrado:
            return None
        hoy = date.today()
        vencidos = [c for c in self.cobros if c.vencido]
        proximos = [
            c.fecha_vencimiento
            for c in self.cobros
            if c.estado != EstadoCobro.anulado and c.saldo > 0 and c.fecha_vencimiento >= hoy
        ]
        return {
            "vencidos": len(vencidos),
            "saldo_vencido": sum((c.saldo for c in vencidos), Decimal("0")),
            "proximo_vencimiento": min(proximos, default=None),
        }


class ContratoParte(Base):
    __tablename__ = "alquileres_contrato_partes"
    __table_args__ = (
        UniqueConstraint("contrato_id", "person_id", "rol", name="uq_alquileres_contrato_parte"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    contrato_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("alquileres_contratos.id", ondelete="CASCADE"), nullable=False
    )
    person_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("people.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    rol: Mapped[RolParteContrato] = mapped_column(
        SAEnum(RolParteContrato, name="rol_parte_contrato"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_ahora, nullable=False
    )

    contrato: Mapped[Contrato] = relationship(back_populates="partes")
    person: Mapped[object] = relationship("Person", foreign_keys=[person_id])

    @property
    def full_name(self) -> str:
        return self.person.full_name


class Ajuste(Base):
    """Una fecha del calendario de ajustes. Nace `pendiente`; el staff la aplica u omite."""

    __tablename__ = "alquileres_ajustes"
    __table_args__ = (
        Index("ix_alquileres_ajustes_contrato_fecha", "contrato_id", "fecha_prevista"),
        Index("ix_alquileres_ajustes_estado_fecha", "estado", "fecha_prevista"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    contrato_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("alquileres_contratos.id", ondelete="CASCADE"), nullable=False
    )
    fecha_prevista: Mapped[date] = mapped_column(Date, nullable=False)
    estado: Mapped[EstadoAjuste] = mapped_column(
        SAEnum(EstadoAjuste, name="estado_ajuste"), nullable=False, default=EstadoAjuste.pendiente
    )
    coeficiente: Mapped[Decimal | None] = mapped_column(Numeric(10, 6), nullable=True)
    monto_anterior: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    monto_nuevo: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    aplicado_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    aplicado_por_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)

    contrato: Mapped[Contrato] = relationship(back_populates="ajustes")


class Cobro(Base):
    """Un período esperado (un mes) de un contrato administrado."""

    __tablename__ = "alquileres_cobros"
    __table_args__ = (
        UniqueConstraint("contrato_id", "periodo", name="uq_alquileres_cobro_periodo"),
        Index("ix_alquileres_cobros_estado_vencimiento", "estado", "fecha_vencimiento"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    contrato_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("alquileres_contratos.id", ondelete="CASCADE"), nullable=False
    )
    # Primer día del mes que se cobra.
    periodo: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_vencimiento: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    monto: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    estado: Mapped[EstadoCobro] = mapped_column(
        SAEnum(EstadoCobro, name="estado_cobro"), nullable=False, default=EstadoCobro.pendiente
    )
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_ahora, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_ahora, onupdate=_ahora, nullable=False
    )

    contrato: Mapped[Contrato] = relationship(back_populates="cobros")
    pagos: Mapped[list[Pago]] = relationship(
        back_populates="cobro", cascade="all, delete-orphan", order_by="(Pago.fecha_pago, Pago.id)"
    )

    @property
    def pagos_validos(self) -> list[Pago]:
        return [p for p in self.pagos if p.anulado_at is None]

    @property
    def tiene_pagos(self) -> bool:
        return bool(self.pagos_validos)

    @property
    def pagado(self) -> Decimal:
        return sum((p.monto for p in self.pagos_validos), Decimal("0"))

    @property
    def saldo(self) -> Decimal:
        return self.monto - self.pagado

    @property
    def vencido(self) -> bool:
        return (
            self.estado != EstadoCobro.anulado
            and self.saldo > 0
            and self.fecha_vencimiento < date.today()
        )

    @property
    def dias_atraso(self) -> int:
        if not self.vencido:
            return 0
        return (date.today() - self.fecha_vencimiento).days

    @property
    def propiedad(self):
        return self.contrato.propiedad

    @property
    def inquilinos(self) -> list[ContratoParte]:
        return [p for p in self.contrato.partes if p.rol == RolParteContrato.inquilino]

    @property
    def moneda(self) -> str:
        return self.contrato.moneda


class Pago(Base):
    """Un pago contra un cobro. Un pago = un recibo numerado."""

    __tablename__ = "alquileres_pagos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cobro_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("alquileres_cobros.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fecha_pago: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # Solo alquiler; el punitorio va aparte para que la liquidación los distinga.
    monto: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    punitorio: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    medio: Mapped[MedioPago] = mapped_column(SAEnum(MedioPago, name="medio_pago"), nullable=False)
    referencia: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Correlativo global; no se reusa aunque el pago se anule.
    recibo_numero: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)
    recibo_pdf_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    recibo_pdf_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    enviado_email_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    anulado_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    motivo_anulacion: Mapped[str | None] = mapped_column(Text, nullable=True)
    liquidacion_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("alquileres_liquidaciones.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    registrado_por_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_ahora, nullable=False
    )

    cobro: Mapped[Cobro] = relationship(back_populates="pagos")
    liquidacion: Mapped[Liquidacion | None] = relationship(back_populates="pagos")
    registrado_por: Mapped[object | None] = relationship(
        "User", foreign_keys=[registrado_por_user_id]
    )

    @property
    def anulado(self) -> bool:
        return self.anulado_at is not None

    @property
    def total(self) -> Decimal:
        return self.monto + self.punitorio

    @property
    def recibo_numero_formateado(self) -> str:
        # Se importa acá para que models no dependa de recibos (que importa models).
        from app.platform.alquileres.recibos import numero_formateado

        return numero_formateado(self.recibo_numero)

    @property
    def whatsapp_url(self) -> str | None:
        from app.platform.alquileres.recibos import whatsapp_url_recibo

        return whatsapp_url_recibo(self)


class Gasto(Base):
    """Gasto que se le descuenta al propietario en la liquidación."""

    __tablename__ = "alquileres_gastos"
    __table_args__ = (Index("ix_alquileres_gastos_contrato_fecha", "contrato_id", "fecha"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    contrato_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("alquileres_contratos.id", ondelete="CASCADE"), nullable=False
    )
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    tipo: Mapped[TipoGasto] = mapped_column(SAEnum(TipoGasto, name="tipo_gasto"), nullable=False)
    concepto: Mapped[str] = mapped_column(String(150), nullable=False)
    monto: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    comprobante_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    comprobante_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    liquidacion_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("alquileres_liquidaciones.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_ahora, nullable=False
    )

    contrato: Mapped[Contrato] = relationship(back_populates="gastos")
    liquidacion: Mapped[Liquidacion | None] = relationship(back_populates="gastos")


class Liquidacion(Base):
    """Rendición mensual al propietario. Los totales son snapshot: no se recalculan."""

    __tablename__ = "alquileres_liquidaciones"
    # Índice parcial y no UniqueConstraint: una liquidación anulada libera el
    # período para volver a emitirlo, que es justamente para lo que se anula.
    __table_args__ = (
        Index(
            "uq_alquileres_liquidacion_periodo",
            "contrato_id",
            "periodo",
            unique=True,
            postgresql_where=text("anulada_at IS NULL"),
            sqlite_where=text("anulada_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    contrato_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("alquileres_contratos.id", ondelete="RESTRICT"), nullable=False
    )
    periodo: Mapped[date] = mapped_column(Date, nullable=False)
    numero: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)
    total_cobrado: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    total_punitorios: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    honorarios_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    honorarios_monto: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    total_gastos: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    total_a_transferir: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    estado: Mapped[EstadoLiquidacion] = mapped_column(
        SAEnum(EstadoLiquidacion, name="estado_liquidacion"),
        nullable=False,
        default=EstadoLiquidacion.emitida,
    )
    fecha_pago: Mapped[date | None] = mapped_column(Date, nullable=True)
    comprobante_pdf_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    comprobante_pdf_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    enviado_email_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Anulación: la fila se conserva (el PDF puede haberse enviado ya) pero sus
    # pagos y gastos vuelven al pozo de lo pendiente de liquidar.
    anulada_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    motivo_anulacion: Mapped[str | None] = mapped_column(Text, nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_ahora, nullable=False
    )

    contrato: Mapped[Contrato] = relationship(back_populates="liquidaciones")
    pagos: Mapped[list[Pago]] = relationship(
        back_populates="liquidacion", order_by="Pago.fecha_pago"
    )
    gastos: Mapped[list[Gasto]] = relationship(back_populates="liquidacion", order_by="Gasto.fecha")

    @property
    def numero_formateado(self) -> str:
        from app.platform.alquileres.recibos import numero_formateado

        return numero_formateado(self.numero)

    @property
    def whatsapp_url(self) -> str | None:
        from app.platform.alquileres.recibos import whatsapp_url_liquidacion

        return whatsapp_url_liquidacion(self)

    @property
    def propiedad(self):
        return self.contrato.propiedad

    @property
    def moneda(self) -> str:
        return self.contrato.moneda

    @property
    def anulada(self) -> bool:
        return self.anulada_at is not None
