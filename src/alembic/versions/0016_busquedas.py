"""Búsquedas guardadas: qué busca cada persona y a qué propiedades ya se avisó

Revision ID: 0016_busquedas
Revises: 0015_audit_log
Create Date: 2026-09-29

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0016_busquedas"
down_revision: str | None = "0015_audit_log"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "busquedas",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "person_id",
            sa.Integer(),
            sa.ForeignKey("people.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("tipo_operacion", sa.String(20), nullable=True),
        sa.Column("tipo_propiedad", sa.String(20), nullable=True),
        sa.Column("ciudad", sa.String(120), nullable=True),
        sa.Column("moneda", sa.String(3), nullable=True),
        sa.Column("precio_min", sa.Numeric(14, 2), nullable=True),
        sa.Column("precio_max", sa.Numeric(14, 2), nullable=True),
        sa.Column("dormitorios_min", sa.Integer(), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("activa", sa.Boolean(), nullable=False),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_busquedas_person_id", "busquedas", ["person_id"])

    op.create_table(
        "busquedas_avisos",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "busqueda_id",
            sa.Integer(),
            sa.ForeignKey("busquedas.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "propiedad_id",
            sa.Integer(),
            sa.ForeignKey("propiedades.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("busqueda_id", "propiedad_id", name="uq_busqueda_aviso"),
    )
    op.create_index("ix_busquedas_avisos_busqueda_id", "busquedas_avisos", ["busqueda_id"])
    op.create_index("ix_busquedas_avisos_propiedad_id", "busquedas_avisos", ["propiedad_id"])


def downgrade() -> None:
    op.drop_index("ix_busquedas_avisos_propiedad_id", table_name="busquedas_avisos")
    op.drop_index("ix_busquedas_avisos_busqueda_id", table_name="busquedas_avisos")
    op.drop_table("busquedas_avisos")
    op.drop_index("ix_busquedas_person_id", table_name="busquedas")
    op.drop_table("busquedas")
