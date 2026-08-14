from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context
from app.config import settings
from app.database import Base

# Importar todos los modelos para que Alembic los detecte
from app.modules.propiedades import models as _propiedades_models  # noqa: F401
from app.modules.publicaciones import models as _publicaciones_models  # noqa: F401
from app.platform.activities import models as _activities_models  # noqa: F401
from app.platform.audit import models as _audit_models  # noqa: F401
from app.platform.auth import models as _auth_models  # noqa: F401
from app.platform.deals import models as _deals_models  # noqa: F401
from app.platform.notes import models as _notes_models  # noqa: F401
from app.platform.people import models as _people_models  # noqa: F401
from app.platform.reservations import models as _reservations_models  # noqa: F401

config = context.config

# El `%%` no es un typo. `set_main_option` guarda el valor en un ConfigParser, que
# trata `%` como sintaxis de interpolacion y hay que escaparlo duplicandolo. Salta
# apenas la contrasena de la base tiene un caracter especial: al percent-encodearla
# para meterla en la URL aparecen `%3F`, `%2B`… y Alembic muere con un
# `invalid interpolation syntax` que no menciona ni la contrasena ni la URL.
config.set_main_option("sqlalchemy.url", settings.sqlalchemy_database_url.replace("%", "%%"))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
