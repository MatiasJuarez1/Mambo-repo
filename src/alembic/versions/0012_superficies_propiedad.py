"""Superficies de terreno, construida y propia en propiedades

Se suman a `m2_cubiertos` y `m2_totales`. Nullable y sin backfill: ninguna
propiedad cargada tiene estos datos y ninguno es obligatorio.

Revision ID: 0012_superficies_propiedad
Revises: 0011_liquidaciones_anulacion
Create Date: 2026-09-28

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0012_superficies_propiedad"
down_revision: str | None = "0011_liquidaciones_anulacion"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMNAS = ("m2_terreno", "m2_construidos", "m2_propios")


def upgrade() -> None:
    for columna in COLUMNAS:
        op.add_column("propiedades", sa.Column(columna, sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    for columna in reversed(COLUMNAS):
        op.drop_column("propiedades", columna)
