"""Bloque 4: comisiones, reparto entre agentes e historial de etapas

Tres tablas nuevas. El historial se rellena con la etapa actual de cada deal
(`entered_at = stage_changed_at`) para que el embudo arranque con lo que se sabe.

Revision ID: 0008_comisiones
Revises: 0007_recordatorios
Create Date: 2026-09-20

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0008_comisiones"
down_revision: str | None = "0007_recordatorios"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "comisiones",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "deal_id",
            sa.Integer(),
            sa.ForeignKey("deals.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("monto_operacion", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("moneda", sa.String(3), nullable=False, server_default="ARS"),
        sa.Column("pct", sa.Numeric(5, 2), nullable=True),
        sa.Column("monto", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("cobrada", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("fecha_cobro", sa.Date(), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "comisiones_reparto",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "comision_id",
            sa.Integer(),
            sa.ForeignKey("comisiones.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("pct", sa.Numeric(5, 2), nullable=False),
        sa.UniqueConstraint("comision_id", "user_id", name="uq_comision_reparto"),
    )
    op.create_index("ix_comisiones_reparto_comision_id", "comisiones_reparto", ["comision_id"])
    op.create_index("ix_comisiones_reparto_user_id", "comisiones_reparto", ["user_id"])

    op.create_table(
        "deal_stage_history",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "deal_id", sa.Integer(), sa.ForeignKey("deals.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "stage_id",
            sa.Integer(),
            sa.ForeignKey("pipeline_stages.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("entered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("left_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_deal_stage_history_deal_id", "deal_stage_history", ["deal_id"])
    op.create_index("ix_deal_stage_history_stage_id", "deal_stage_history", ["stage_id"])

    # Backfill: cada deal vivo arranca con una estadía abierta en su etapa actual.
    op.execute(
        "INSERT INTO deal_stage_history (deal_id, stage_id, entered_at) "
        "SELECT id, stage_id, stage_changed_at FROM deals WHERE deleted_at IS NULL"
    )


def downgrade() -> None:
    op.drop_table("deal_stage_history")
    op.drop_table("comisiones_reparto")
    op.drop_table("comisiones")
