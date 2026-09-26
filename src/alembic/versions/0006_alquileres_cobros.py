"""Bloque 2b: cobros, pagos, gastos y liquidaciones de alquileres administrados

Cuatro tablas y cuatro enums nuevos; columnas nuevas en `inmobiliaria`
(punitorio, gracia, contadores) y `alquileres_contratos` (punitorio override).

Revision ID: 0006_alquileres_cobros
Revises: 0005_alquileres_contratos
Create Date: 2026-09-17

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006_alquileres_cobros"
down_revision: str | None = "0005_alquileres_contratos"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

estado_cobro = sa.Enum("pendiente", "parcial", "pagado", "anulado", name="estado_cobro")
medio_pago = sa.Enum("efectivo", "transferencia", "otro", name="medio_pago")
tipo_gasto = sa.Enum("expensas", "reparacion", "impuesto", "otro", name="tipo_gasto")
estado_liquidacion = sa.Enum("emitida", "pagada", name="estado_liquidacion")


def upgrade() -> None:
    op.add_column(
        "inmobiliaria", sa.Column("punitorio_diario_pct", sa.Numeric(5, 3), nullable=True)
    )
    op.add_column(
        "inmobiliaria", sa.Column("dias_gracia", sa.Integer(), nullable=False, server_default="0")
    )
    op.add_column(
        "inmobiliaria", sa.Column("ultimo_recibo", sa.Integer(), nullable=False, server_default="0")
    )
    op.add_column(
        "inmobiliaria",
        sa.Column("ultima_liquidacion", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "alquileres_contratos", sa.Column("punitorio_diario_pct", sa.Numeric(5, 3), nullable=True)
    )

    op.create_table(
        "alquileres_cobros",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "contrato_id",
            sa.Integer(),
            sa.ForeignKey("alquileres_contratos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("periodo", sa.Date(), nullable=False),
        sa.Column("fecha_vencimiento", sa.Date(), nullable=False),
        sa.Column("monto", sa.Numeric(14, 2), nullable=False),
        sa.Column("estado", estado_cobro, nullable=False, server_default="pendiente"),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("contrato_id", "periodo", name="uq_alquileres_cobro_periodo"),
    )
    op.create_index(
        "ix_alquileres_cobros_fecha_vencimiento", "alquileres_cobros", ["fecha_vencimiento"]
    )
    op.create_index(
        "ix_alquileres_cobros_estado_vencimiento",
        "alquileres_cobros",
        ["estado", "fecha_vencimiento"],
    )

    op.create_table(
        "alquileres_liquidaciones",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "contrato_id",
            sa.Integer(),
            sa.ForeignKey("alquileres_contratos.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("periodo", sa.Date(), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False, unique=True),
        sa.Column("total_cobrado", sa.Numeric(14, 2), nullable=False),
        sa.Column("total_punitorios", sa.Numeric(14, 2), nullable=False),
        sa.Column("honorarios_pct", sa.Numeric(5, 2), nullable=False),
        sa.Column("honorarios_monto", sa.Numeric(14, 2), nullable=False),
        sa.Column("total_gastos", sa.Numeric(14, 2), nullable=False),
        sa.Column("total_a_transferir", sa.Numeric(14, 2), nullable=False),
        sa.Column("estado", estado_liquidacion, nullable=False, server_default="emitida"),
        sa.Column("fecha_pago", sa.Date(), nullable=True),
        sa.Column("comprobante_pdf_url", sa.String(1024), nullable=True),
        sa.Column("comprobante_pdf_key", sa.String(512), nullable=True),
        sa.Column("enviado_email_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("contrato_id", "periodo", name="uq_alquileres_liquidacion_periodo"),
    )

    op.create_table(
        "alquileres_pagos",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "cobro_id",
            sa.Integer(),
            sa.ForeignKey("alquileres_cobros.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("fecha_pago", sa.Date(), nullable=False),
        sa.Column("monto", sa.Numeric(14, 2), nullable=False),
        sa.Column("punitorio", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("medio", medio_pago, nullable=False),
        sa.Column("referencia", sa.String(100), nullable=True),
        sa.Column("recibo_numero", sa.Integer(), nullable=False, unique=True),
        sa.Column("recibo_pdf_url", sa.String(1024), nullable=True),
        sa.Column("recibo_pdf_key", sa.String(512), nullable=True),
        sa.Column("enviado_email_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("anulado_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("motivo_anulacion", sa.Text(), nullable=True),
        sa.Column(
            "liquidacion_id",
            sa.Integer(),
            sa.ForeignKey("alquileres_liquidaciones.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column(
            "registrado_por_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_alquileres_pagos_cobro_id", "alquileres_pagos", ["cobro_id"])
    op.create_index("ix_alquileres_pagos_fecha_pago", "alquileres_pagos", ["fecha_pago"])
    op.create_index("ix_alquileres_pagos_liquidacion_id", "alquileres_pagos", ["liquidacion_id"])

    op.create_table(
        "alquileres_gastos",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "contrato_id",
            sa.Integer(),
            sa.ForeignKey("alquileres_contratos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("tipo", tipo_gasto, nullable=False),
        sa.Column("concepto", sa.String(150), nullable=False),
        sa.Column("monto", sa.Numeric(14, 2), nullable=False),
        sa.Column("comprobante_url", sa.String(1024), nullable=True),
        sa.Column("comprobante_key", sa.String(512), nullable=True),
        sa.Column(
            "liquidacion_id",
            sa.Integer(),
            sa.ForeignKey("alquileres_liquidaciones.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_alquileres_gastos_contrato_fecha", "alquileres_gastos", ["contrato_id", "fecha"]
    )
    op.create_index("ix_alquileres_gastos_liquidacion_id", "alquileres_gastos", ["liquidacion_id"])


def downgrade() -> None:
    op.drop_table("alquileres_gastos")
    op.drop_table("alquileres_pagos")
    op.drop_table("alquileres_liquidaciones")
    op.drop_table("alquileres_cobros")
    op.drop_column("alquileres_contratos", "punitorio_diario_pct")
    for col in ("ultima_liquidacion", "ultimo_recibo", "dias_gracia", "punitorio_diario_pct"):
        op.drop_column("inmobiliaria", col)
    bind = op.get_bind()
    for tipo in (estado_liquidacion, tipo_gasto, medio_pago, estado_cobro):
        tipo.drop(bind, checkfirst=True)
