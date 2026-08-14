"""Columna `variantes` en propiedades_medios

Guarda las URLs de las copias reducidas de cada foto (400/800/1600 px) que ahora
genera la subida, en la forma `{"400": "https://…", "800": "…"}`, para que el
frontend las ofrezca por `srcset` y un telefono no se baje la de 1920.

Nullable a proposito, y sin backfill acá: las filas existentes quedan en NULL y
el frontend cae al `url` de siempre. Asi el deploy se desacopla del reproceso de
las fotos ya subidas (que es un script aparte) y en ningun momento hay una foto
rota en la web.

Tipo `sa.JSON` generico y no el `JSONB` de PostgreSQL: se compila al tipo nativo
de cada motor —incluido el SQLite de la suite de tests— y acá no se consulta por
adentro del documento, que es lo unico que justificaria atarse a JSONB.

Revision ID: 0003_variantes_medios
Revises: 0002_indices_declarados
Create Date: 2026-08-14

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003_variantes_medios"
down_revision: str | None = "0002_indices_declarados"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("propiedades_medios", sa.Column("variantes", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("propiedades_medios", "variantes")
