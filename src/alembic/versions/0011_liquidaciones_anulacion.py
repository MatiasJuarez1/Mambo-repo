"""Anulación de liquidaciones: anulada_at, motivo y período liberado

Una liquidación emitida por error dejaba sus pagos y gastos marcados para
siempre (`anular_pago` rechaza un pago ya liquidado) y el período bloqueado por
la unique de (contrato_id, periodo). La anulación conserva la fila —el número ya
se quemó y el PDF puede haberse enviado— pero devuelve pagos y gastos al pozo de
pendientes; por eso la unique pasa a ser un índice parcial `WHERE anulada_at IS
NULL`, que deja volver a emitir ese mismo período.

Revision ID: 0011_liquidaciones_anulacion
Revises: 0010_activities_deal_id
Create Date: 2026-09-23

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0011_liquidaciones_anulacion"
down_revision: str | None = "0010_activities_deal_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "alquileres_liquidaciones",
        sa.Column("anulada_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "alquileres_liquidaciones",
        sa.Column("motivo_anulacion", sa.Text(), nullable=True),
    )
    op.drop_constraint(
        "uq_alquileres_liquidacion_periodo", "alquileres_liquidaciones", type_="unique"
    )
    op.create_index(
        "uq_alquileres_liquidacion_periodo",
        "alquileres_liquidaciones",
        ["contrato_id", "periodo"],
        unique=True,
        postgresql_where=sa.text("anulada_at IS NULL"),
        sqlite_where=sa.text("anulada_at IS NULL"),
    )


def downgrade() -> None:
    """Vuelve a la unique total. Falla si hay una anulada y una vigente del mismo
    período, que es exactamente el estado que esta migración habilita: hay que
    borrar las anuladas a mano antes de bajar."""
    op.drop_index("uq_alquileres_liquidacion_periodo", table_name="alquileres_liquidaciones")
    op.create_unique_constraint(
        "uq_alquileres_liquidacion_periodo",
        "alquileres_liquidaciones",
        ["contrato_id", "periodo"],
    )
    op.drop_column("alquileres_liquidaciones", "motivo_anulacion")
    op.drop_column("alquileres_liquidaciones", "anulada_at")
