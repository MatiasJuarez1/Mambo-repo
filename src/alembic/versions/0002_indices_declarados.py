"""Indices declarados en los modelos y ausentes en el esquema inicial

Deuda encontrada por `alembic check`, no una funcionalidad nueva: la migracion
inicial crea las 17 tablas pero **ningun indice**, mientras que ocho modelos
declaran `index=True` (y `sessions.token_hash`, ademas, `unique=True`). Como la
base de produccion se construye desde las migraciones, esos indices no existen
en ningun lado y cualquier `alembic revision --autogenerate` posterior arrastra
las veinte operaciones como ruido.

Va en su propia revision, separada de la que agrega `propiedades_medios.variantes`,
por dos razones: la de la columna queda revisable de un vistazo, y esta se puede
revertir sola si algun indice diera problemas al aplicarla.

**Cuidado al correrla contra una base con datos:** `ix_sessions_token_hash` es
UNIQUE. Si hubiera dos sesiones con el mismo `token_hash` —no deberia: el valor
sale de un uuid4— el CREATE INDEX falla y hay que limpiar los duplicados antes.

Revision ID: 0002_indices_declarados
Revises: 0001_esquema_inicial
Create Date: 2026-08-14

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002_indices_declarados"
down_revision: str | None = "0001_esquema_inicial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# (nombre, tabla, columnas, unico)
INDICES = (
    ("ix_activities_activity_type", "activities", ["activity_type"], False),
    ("ix_activities_assigned_to_user_id", "activities", ["assigned_to_user_id"], False),
    ("ix_activities_person_id", "activities", ["person_id"], False),
    ("ix_activities_status", "activities", ["status"], False),
    ("ix_deal_parties_deal_id", "deal_parties", ["deal_id"], False),
    ("ix_deal_parties_person_id", "deal_parties", ["person_id"], False),
    ("ix_deals_assigned_to_user_id", "deals", ["assigned_to_user_id"], False),
    ("ix_deals_pipeline_id", "deals", ["pipeline_id"], False),
    ("ix_deals_property_id", "deals", ["property_id"], False),
    ("ix_deals_stage_id", "deals", ["stage_id"], False),
    ("ix_people_document_number", "people", ["document_number"], False),
    ("ix_people_contacts_person_id", "people_contacts", ["person_id"], False),
    ("ix_pipeline_stages_pipeline_id", "pipeline_stages", ["pipeline_id"], False),
    ("ix_reservations_person_id", "reservations", ["person_id"], False),
    ("ix_reservations_property_id", "reservations", ["property_id"], False),
    ("ix_reservations_status", "reservations", ["status"], False),
    ("ix_sessions_token_hash", "sessions", ["token_hash"], True),
    ("ix_sessions_user_id", "sessions", ["user_id"], False),
    ("ix_users_email", "users", ["email"], True),
)


def upgrade() -> None:
    for nombre, tabla, columnas, unico in INDICES:
        op.create_index(op.f(nombre), tabla, columnas, unique=unico)


def downgrade() -> None:
    for nombre, tabla, _columnas, _unico in reversed(INDICES):
        op.drop_index(op.f(nombre), table_name=tabla)
