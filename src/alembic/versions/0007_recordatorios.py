"""Bloque 2c: ventana de aviso de los recordatorios

Una columna en `inmobiliaria`. Los recordatorios en sí no se persisten.

Revision ID: 0007_recordatorios
Revises: 0006_alquileres_cobros
Create Date: 2026-09-18

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0007_recordatorios"
down_revision: str | None = "0006_alquileres_cobros"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "inmobiliaria",
        sa.Column("dias_aviso_recordatorios", sa.Integer(), nullable=False, server_default="30"),
    )


def downgrade() -> None:
    op.drop_column("inmobiliaria", "dias_aviso_recordatorios")
