"""Tabla audit_log: quién cambió qué en propiedades, contratos, cobros y comisiones

La llena `app.platform.audit.service`, enganchado a los flush de SQLAlchemy.

Revision ID: 0015_audit_log
Revises: 0014_actividades_sin_creador
Create Date: 2026-09-29

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0015_audit_log"
down_revision: str | None = "0014_actividades_sin_creador"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("entidad", sa.String(40), nullable=False),
        sa.Column("entidad_id", sa.Integer(), nullable=False),
        sa.Column("accion", sa.String(20), nullable=False),
        sa.Column("cambios", sa.JSON(), nullable=False),
        sa.Column("creado_en", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_audit_log_entidad", "audit_log", ["entidad", "entidad_id"])
    op.create_index("ix_audit_log_user_id", "audit_log", ["user_id"])
    op.create_index("ix_audit_log_creado_en", "audit_log", ["creado_en"])


def downgrade() -> None:
    op.drop_index("ix_audit_log_creado_en", table_name="audit_log")
    op.drop_index("ix_audit_log_user_id", table_name="audit_log")
    op.drop_index("ix_audit_log_entidad", table_name="audit_log")
    op.drop_table("audit_log")
