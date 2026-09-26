"""Bloque 2a: contratos de alquiler, partes y calendario de ajustes

Tres tablas nuevas y cuatro enums. No toca tablas existentes.

Revision ID: 0005_alquileres_contratos
Revises: 0004_crm_en_el_panel
Create Date: 2026-09-16

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005_alquileres_contratos"
down_revision: str | None = "0004_crm_en_el_panel"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

indice_ajuste = sa.Enum(
    "icl", "ipc", "uva", "casa_propia", "porcentaje_fijo", "sin_ajuste", name="indice_ajuste"
)
estado_contrato = sa.Enum("vigente", "finalizado", "rescindido", name="estado_contrato")
rol_parte_contrato = sa.Enum("inquilino", "propietario", "garante", name="rol_parte_contrato")
estado_ajuste = sa.Enum("pendiente", "aplicado", "omitido", name="estado_ajuste")


def upgrade() -> None:
    op.create_table(
        "alquileres_contratos",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "property_id",
            sa.Integer(),
            sa.ForeignKey("propiedades.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "deal_id",
            sa.Integer(),
            sa.ForeignKey("deals.id", ondelete="SET NULL"),
            nullable=True,
            unique=True,
        ),
        sa.Column(
            "contrato_anterior_id",
            sa.Integer(),
            sa.ForeignKey("alquileres_contratos.id", ondelete="SET NULL"),
            nullable=True,
            unique=True,
        ),
        sa.Column("fecha_inicio", sa.Date(), nullable=False),
        sa.Column("fecha_fin", sa.Date(), nullable=False),
        sa.Column("dia_vencimiento", sa.Integer(), nullable=False),
        sa.Column("monto_inicial", sa.Numeric(14, 2), nullable=False),
        sa.Column("moneda", sa.String(3), nullable=False, server_default="ARS"),
        sa.Column("indice", indice_ajuste, nullable=False),
        sa.Column("frecuencia_meses", sa.Integer(), nullable=True),
        sa.Column("porcentaje_fijo", sa.Numeric(6, 2), nullable=True),
        sa.Column("administrado", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("honorarios_pct", sa.Numeric(5, 2), nullable=True),
        sa.Column("estado", estado_contrato, nullable=False, server_default="vigente"),
        sa.Column("fecha_rescision", sa.Date(), nullable=True),
        sa.Column("motivo_rescision", sa.Text(), nullable=True),
        sa.Column("pdf_url", sa.String(1024), nullable=True),
        sa.Column("pdf_storage_key", sa.String(512), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_alquileres_contratos_property_estado",
        "alquileres_contratos",
        ["property_id", "estado"],
    )
    op.create_index("ix_alquileres_contratos_fecha_fin", "alquileres_contratos", ["fecha_fin"])

    op.create_table(
        "alquileres_contrato_partes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "contrato_id",
            sa.Integer(),
            sa.ForeignKey("alquileres_contratos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "person_id",
            sa.Integer(),
            sa.ForeignKey("people.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("rol", rol_parte_contrato, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("contrato_id", "person_id", "rol", name="uq_alquileres_contrato_parte"),
    )
    op.create_index(
        "ix_alquileres_contrato_partes_person_id", "alquileres_contrato_partes", ["person_id"]
    )

    op.create_table(
        "alquileres_ajustes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "contrato_id",
            sa.Integer(),
            sa.ForeignKey("alquileres_contratos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("fecha_prevista", sa.Date(), nullable=False),
        sa.Column("estado", estado_ajuste, nullable=False, server_default="pendiente"),
        sa.Column("coeficiente", sa.Numeric(10, 6), nullable=True),
        sa.Column("monto_anterior", sa.Numeric(14, 2), nullable=True),
        sa.Column("monto_nuevo", sa.Numeric(14, 2), nullable=True),
        sa.Column("aplicado_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "aplicado_por_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("notas", sa.Text(), nullable=True),
    )
    op.create_index(
        "ix_alquileres_ajustes_contrato_fecha",
        "alquileres_ajustes",
        ["contrato_id", "fecha_prevista"],
    )
    op.create_index(
        "ix_alquileres_ajustes_estado_fecha", "alquileres_ajustes", ["estado", "fecha_prevista"]
    )


def downgrade() -> None:
    op.drop_table("alquileres_ajustes")
    op.drop_table("alquileres_contrato_partes")
    op.drop_table("alquileres_contratos")
    bind = op.get_bind()
    for tipo in (estado_ajuste, rol_parte_contrato, estado_contrato, indice_ajuste):
        tipo.drop(bind, checkfirst=True)
