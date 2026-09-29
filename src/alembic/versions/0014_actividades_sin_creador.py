"""activities.created_by_user_id pasa a admitir NULL

Las consultas que llegan desde el sitio público crean una actividad sin que haya
nadie del equipo logueado. NULL en esa columna significa "la creó el sistema".
Se eligió antes que un usuario "sistema" falso porque ese usuario aparecería en
los listados de usuarios, necesitaría un hash de contraseña que nadie usa y
cualquier rol que se le diera sería una puerta abierta.

Revision ID: 0014_actividades_sin_creador
Revises: 0013_indices_propiedad_id
Create Date: 2026-09-29

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0014_actividades_sin_creador"
down_revision: str | None = "0013_indices_propiedad_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("activities", "created_by_user_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    # Volver a NOT NULL falla si quedaron consultas web: hay que borrarlas o
    # asignarles un creador antes de bajar esta migración.
    op.alter_column("activities", "created_by_user_id", existing_type=sa.Integer(), nullable=False)
