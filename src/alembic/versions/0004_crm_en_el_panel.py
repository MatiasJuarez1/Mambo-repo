"""Bloque CRM: FKs que faltaban, stage_changed_at, people_tags, inmobiliaria, pipelines base

Las columnas `propietario_persona_id`, `reservations.property_id`, `deals.property_id`
y `activities.property_id` nacieron sin FK por una limitación de MySQL (no admite FK
entre signed/unsigned) que en PostgreSQL no existe. Se formalizan.

**Antes de correrla contra una base con datos**, verificar que no haya referencias
huérfanas o el CREATE de cada FK falla:

    SELECT id FROM propiedades WHERE propietario_persona_id IS NOT NULL
      AND propietario_persona_id NOT IN (SELECT id FROM people);
    SELECT id FROM reservations WHERE property_id NOT IN (SELECT id FROM propiedades);
    SELECT id FROM deals WHERE property_id IS NOT NULL
      AND property_id NOT IN (SELECT id FROM propiedades);
    SELECT id FROM activities WHERE property_id IS NOT NULL
      AND property_id NOT IN (SELECT id FROM propiedades);

Revision ID: 0004_crm_en_el_panel
Revises: 0003_variantes_medios
Create Date: 2026-09-11

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.platform.deals.pipelines_base import PIPELINES_BASE

revision: str = "0004_crm_en_el_panel"
down_revision: str | None = "0003_variantes_medios"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- FKs que faltaban -------------------------------------------------
    op.create_index(
        "ix_propiedades_propietario_persona_id", "propiedades", ["propietario_persona_id"]
    )
    op.create_foreign_key(
        "fk_propiedades_propietario_persona",
        "propiedades",
        "people",
        ["propietario_persona_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_reservations_property",
        "reservations",
        "propiedades",
        ["property_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_deals_property",
        "deals",
        "propiedades",
        ["property_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_activities_property_id", "activities", ["property_id"])
    op.create_foreign_key(
        "fk_activities_property",
        "activities",
        "propiedades",
        ["property_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # --- deals.stage_changed_at: las filas existentes arrancan en updated_at ---
    op.add_column("deals", sa.Column("stage_changed_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE deals SET stage_changed_at = updated_at")
    op.alter_column("deals", "stage_changed_at", nullable=False)

    # --- people_tags -------------------------------------------------------
    op.create_table(
        "people_tags",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "person_id",
            sa.Integer(),
            sa.ForeignKey("people.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("nombre", sa.String(60), nullable=False),
        sa.UniqueConstraint("person_id", "nombre", name="uq_person_tag"),
    )
    op.create_index("ix_people_tags_person_id", "people_tags", ["person_id"])

    # --- inmobiliaria: una fila, id=1 ---------------------------------------
    inmobiliaria = op.create_table(
        "inmobiliaria",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nombre", sa.String(150), nullable=False),
        sa.Column("logo_url", sa.String(1024), nullable=True),
        sa.Column("logo_storage_key", sa.String(512), nullable=True),
        sa.Column("telefono", sa.String(50), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("cuit", sa.String(20), nullable=True),
        sa.Column("direccion", sa.String(255), nullable=True),
        sa.Column("honorarios_venta_pct", sa.Numeric(5, 2), nullable=True),
        sa.Column("honorarios_alquiler_pct", sa.Numeric(5, 2), nullable=True),
        sa.Column("actualizado_en", sa.DateTime(timezone=True), nullable=False),
    )
    # `insert().values()` y no `bulk_insert`: este último manda los valores como
    # parámetros literales y psycopg2 no sabe adaptar `func.now()`; así se
    # renderiza como `now()` dentro del SQL.
    op.execute(
        inmobiliaria.insert().values(id=1, nombre="Mambo Groups", actualizado_en=sa.func.now())
    )

    # --- pipelines base, solo si la tabla está vacía -------------------------
    conn = op.get_bind()
    if conn.execute(sa.text("SELECT COUNT(*) FROM pipelines")).scalar() == 0:
        for nombre, etapas in PIPELINES_BASE:
            pipeline_id = conn.execute(
                sa.text(
                    "INSERT INTO pipelines (name, is_active, created_at) "
                    "VALUES (:name, TRUE, NOW()) RETURNING id"
                ),
                {"name": nombre},
            ).scalar()
            for etapa, posicion, is_won, is_lost in etapas:
                conn.execute(
                    sa.text(
                        "INSERT INTO pipeline_stages "
                        "(pipeline_id, name, position, is_won, is_lost) "
                        "VALUES (:p, :n, :pos, :w, :l)"
                    ),
                    {"p": pipeline_id, "n": etapa, "pos": posicion, "w": is_won, "l": is_lost},
                )


def downgrade() -> None:
    op.drop_table("inmobiliaria")
    op.drop_index("ix_people_tags_person_id", table_name="people_tags")
    op.drop_table("people_tags")
    op.drop_column("deals", "stage_changed_at")
    op.drop_constraint("fk_activities_property", "activities", type_="foreignkey")
    op.drop_index("ix_activities_property_id", table_name="activities")
    op.drop_constraint("fk_deals_property", "deals", type_="foreignkey")
    op.drop_constraint("fk_reservations_property", "reservations", type_="foreignkey")
    op.drop_constraint("fk_propiedades_propietario_persona", "propiedades", type_="foreignkey")
    op.drop_index("ix_propiedades_propietario_persona_id", table_name="propiedades")
    # Los pipelines sembrados no se borran: pueden tener deals colgados.
