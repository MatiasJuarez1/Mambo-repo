"""Indices en las FK `propiedad_id` de medios, caracteristicas y publicaciones

PostgreSQL no indexa las foreign keys solo. Los listados de propiedades y
publicaciones ahora precargan los medios con `selectinload`, que es un
`WHERE propiedad_id IN (...)` sobre `propiedades_medios`: sin indice, cada pagina
del sitio publico recorre la tabla entera, y es la que mas crece (varias fotos
por propiedad).

Revision ID: 0013_indices_propiedad_id
Revises: 0012_superficies_propiedad
Create Date: 2026-09-29

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0013_indices_propiedad_id"
down_revision: str | None = "0012_superficies_propiedad"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (nombre, tabla, columnas)
INDICES = (
    ("ix_propiedades_medios_propiedad_id", "propiedades_medios", ["propiedad_id"]),
    (
        "ix_propiedades_caracteristicas_propiedad_id",
        "propiedades_caracteristicas",
        ["propiedad_id"],
    ),
    ("ix_publicaciones_propiedad_id", "publicaciones", ["propiedad_id"]),
)


def upgrade() -> None:
    for nombre, tabla, columnas in INDICES:
        op.create_index(op.f(nombre), tabla, columnas, unique=False)


def downgrade() -> None:
    for nombre, tabla, _ in reversed(INDICES):
        op.drop_index(op.f(nombre), table_name=tabla)
