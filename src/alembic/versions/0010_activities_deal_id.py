"""Bloque 5a: activities.deal_id, para colgar una actividad de una operación

Columna nullable con ondelete=SET NULL: una actividad sigue existiendo si se
borra la operación a la que estaba ligada. `activities` está vacía en Supabase
al momento de esta migración (verificado el 21/09/2026), sin backfill.

Revision ID: 0010_activities_deal_id
Revises: 0009_documentos
Create Date: 2026-09-21

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0010_activities_deal_id"
down_revision: str | None = "0009_documentos"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "activities",
        sa.Column(
            "deal_id",
            sa.Integer(),
            sa.ForeignKey("deals.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_activities_deal_id", "activities", ["deal_id"])


def downgrade() -> None:
    op.drop_index("ix_activities_deal_id", table_name="activities")
    op.drop_column("activities", "deal_id")
