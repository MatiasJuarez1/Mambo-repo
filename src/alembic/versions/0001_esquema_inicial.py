"""Esquema inicial

Primera migracion del proyecto. Crea las 17 tablas desde cero.

Hasta ahora el esquema se creaba a mano por fuera del repositorio (primero en
MySQL, despues en PostgreSQL) y `alembic/versions/` estaba vacio: no habia forma
de levantar una base nueva sin que alguien repitiera los CREATE TABLE de memoria.
Esta migracion cierra eso, que es lo que permite crear la base de produccion en
Supabase con un solo comando.

Revision ID: 0001_esquema_inicial
Revises:
Create Date: 2026-08-14

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0001_esquema_inicial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Tipos ENUM de PostgreSQL. Los crea `op.create_table` sola —el dialecto emite el
# CREATE TYPE antes del CREATE TABLE— pero el DROP TABLE del downgrade NO los
# borra: en PostgreSQL el tipo sobrevive a la tabla que lo usaba. Sin el DROP TYPE
# explicito de abajo, un downgrade seguido de un upgrade muere con
# `type "tipo_propiedad" already exists`.
TIPOS_ENUM = (
    "tipo_propiedad",
    "tipo_operacion",
    "estado_comercial",
    "tipo_medio",
    "estado_publicacion",
)


def upgrade() -> None:
    op.create_table(
        "people",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("first_name", sa.String(length=100), nullable=False),
        sa.Column("last_name", sa.String(length=100), nullable=False),
        sa.Column("document_type", sa.String(length=20), nullable=True),
        sa.Column("document_number", sa.String(length=50), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "pipelines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "propiedades",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("propietario_persona_id", sa.BigInteger(), nullable=True),
        sa.Column("titulo", sa.String(length=255), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column(
            "tipo_propiedad",
            sa.Enum("casa", "depto", "local", "terreno", "oficina", "otro", name="tipo_propiedad"),
            nullable=False,
        ),
        sa.Column(
            "tipo_operacion",
            sa.Enum("venta", "alquiler", "temporal", name="tipo_operacion"),
            nullable=False,
        ),
        sa.Column(
            "estado_comercial",
            sa.Enum("disponible", "reservada", "cerrada", "baja", name="estado_comercial"),
            nullable=False,
        ),
        sa.Column("moneda", sa.String(length=3), nullable=False),
        sa.Column("precio", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("dormitorios", sa.Integer(), nullable=True),
        sa.Column("banos", sa.Integer(), nullable=True),
        sa.Column("m2_cubiertos", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("m2_totales", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("creado_por_usuario_id", sa.BigInteger(), nullable=True),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.Column("actualizado_en", sa.DateTime(), nullable=False),
        sa.Column("eliminado_en", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "people_contacts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("person_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=30), nullable=False),
        sa.Column("value", sa.String(length=255), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["person_id"], ["people.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("person_id", "type", "value", name="uq_person_contact"),
    )
    op.create_table(
        "pipeline_stages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("pipeline_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("is_won", sa.Boolean(), nullable=False),
        sa.Column("is_lost", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["pipeline_id"], ["pipelines.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("pipeline_id", "name", name="uq_stage_name"),
        sa.UniqueConstraint("pipeline_id", "position", name="uq_stage_position"),
    )
    op.create_table(
        "propiedades_caracteristicas",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("propiedad_id", sa.BigInteger(), nullable=False),
        sa.Column("clave", sa.String(length=80), nullable=False),
        sa.Column("valor", sa.String(length=255), nullable=False),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["propiedad_id"], ["propiedades.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "propiedades_medios",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("propiedad_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "tipo_medio",
            sa.Enum("imagen", "video", "documento", "otro", name="tipo_medio"),
            nullable=False,
        ),
        sa.Column("url", sa.String(length=1024), nullable=False),
        sa.Column("storage_key", sa.String(length=512), nullable=True),
        sa.Column("descripcion", sa.String(length=255), nullable=True),
        sa.Column("orden", sa.Integer(), nullable=False),
        sa.Column("es_principal", sa.Boolean(), nullable=False),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["propiedad_id"], ["propiedades.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "propiedades_ubicaciones",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("propiedad_id", sa.BigInteger(), nullable=False),
        sa.Column("direccion", sa.String(length=255), nullable=True),
        sa.Column("ciudad", sa.String(length=120), nullable=True),
        sa.Column("provincia", sa.String(length=120), nullable=True),
        sa.Column("pais", sa.String(length=120), nullable=True),
        sa.Column("codigo_postal", sa.String(length=20), nullable=True),
        sa.Column("lat", sa.Numeric(precision=10, scale=7), nullable=True),
        sa.Column("lng", sa.Numeric(precision=10, scale=7), nullable=True),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["propiedad_id"], ["propiedades.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("propiedad_id"),
    )
    op.create_table(
        "publicaciones",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("propiedad_id", sa.BigInteger(), nullable=False),
        sa.Column("titulo", sa.String(length=255), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column(
            "estado",
            sa.Enum("activa", "pausada", "eliminada", name="estado_publicacion"),
            nullable=False,
        ),
        sa.Column("precio_publicado", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("moneda_publicada", sa.String(length=3), nullable=False),
        sa.Column("slug", sa.String(length=300), nullable=True),
        sa.Column("publicada_en", sa.DateTime(), nullable=True),
        sa.Column("creado_por_usuario_id", sa.BigInteger(), nullable=True),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.Column("actualizado_en", sa.DateTime(), nullable=False),
        sa.Column("eliminado_en", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["propiedad_id"], ["propiedades.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("person_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["person_id"], ["people.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "activities",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("activity_type", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("assigned_to_user_id", sa.Integer(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("person_id", sa.Integer(), nullable=True),
        sa.Column("property_id", sa.Integer(), nullable=True),
        sa.Column("listing_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["assigned_to_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["person_id"], ["people.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "deals",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("pipeline_id", sa.Integer(), nullable=False),
        sa.Column("stage_id", sa.Integer(), nullable=False),
        sa.Column("assigned_to_user_id", sa.Integer(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("property_id", sa.Integer(), nullable=True),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_won", sa.Boolean(), nullable=False),
        sa.Column("is_lost", sa.Boolean(), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["assigned_to_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["pipeline_id"], ["pipelines.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["stage_id"], ["pipeline_stages.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "reservations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("person_id", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("property_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["person_id"], ["people.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "user_roles",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "role_id"),
    )
    op.create_table(
        "deal_parties",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("deal_id", sa.Integer(), nullable=False),
        sa.Column("person_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["person_id"], ["people.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("deal_id", "person_id", "role", name="uq_deal_party"),
    )


def downgrade() -> None:
    op.drop_table("deal_parties")
    op.drop_table("user_roles")
    op.drop_table("sessions")
    op.drop_table("reservations")
    op.drop_table("deals")
    op.drop_table("activities")
    op.drop_table("users")
    op.drop_table("publicaciones")
    op.drop_table("propiedades_ubicaciones")
    op.drop_table("propiedades_medios")
    op.drop_table("propiedades_caracteristicas")
    op.drop_table("pipeline_stages")
    op.drop_table("people_contacts")
    op.drop_table("roles")
    op.drop_table("propiedades")
    op.drop_table("pipelines")
    op.drop_table("people")

    # Ver el comentario de TIPOS_ENUM: las tablas se van, los tipos no.
    for nombre in TIPOS_ENUM:
        op.execute(sa.text(f"DROP TYPE IF EXISTS {nombre}"))
