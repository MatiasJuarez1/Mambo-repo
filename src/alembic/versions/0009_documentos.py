"""Bloque 3: documentos adjuntos a propiedad, persona, deal o contrato

Una tabla con cuatro FKs nullable (exactamente una cargada, validado en la app)
y `ondelete=CASCADE` en las cuatro. Sin backfill: no hay documentos previos.

Revision ID: 0009_documentos
Revises: 0008_comisiones
Create Date: 2026-09-21

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009_documentos"
down_revision: str | None = "0008_comisiones"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "documentos",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tipo", sa.String(30), nullable=False),
        sa.Column(
            "propiedad_id",
            sa.Integer(),
            sa.ForeignKey("propiedades.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "persona_id",
            sa.Integer(),
            sa.ForeignKey("people.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "deal_id", sa.Integer(), sa.ForeignKey("deals.id", ondelete="CASCADE"), nullable=True
        ),
        sa.Column(
            "contrato_id",
            sa.Integer(),
            sa.ForeignKey("alquileres_contratos.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("archivo_url", sa.Text(), nullable=False),
        sa.Column("archivo_key", sa.String(255), nullable=False),
        sa.Column("nombre_original", sa.String(255), nullable=False),
        sa.Column("tamano_bytes", sa.Integer(), nullable=False),
        sa.Column(
            "subido_por_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_documentos_propiedad_id", "documentos", ["propiedad_id"])
    op.create_index("ix_documentos_persona_id", "documentos", ["persona_id"])
    op.create_index("ix_documentos_deal_id", "documentos", ["deal_id"])
    op.create_index("ix_documentos_contrato_id", "documentos", ["contrato_id"])
    op.create_index("ix_documentos_subido_por_user_id", "documentos", ["subido_por_user_id"])


def downgrade() -> None:
    op.drop_table("documentos")
