"""Configuración común de los tests.

Camino elegido: **SQLite en memoria real** (no mocks). Los modelos apuntan a
PostgreSQL/MySQL, pero las únicas incompatibilidades encontradas se resuelven acá,
sin tocar los modelos de producción:

- `BigInteger` como clave primaria autoincremental: SQLite solo autoincrementa
  columnas declaradas `INTEGER`, así que se registra un compilador de tipos
  específico del dialecto sqlite que emite `INTEGER` en lugar de `BIGINT`.
- `Numeric`: SQLite no tiene tipo decimal nativo; SQLAlchemy lo emula y solo emite
  un warning, por lo que no requiere adaptación.
- `Enum`: SQLAlchemy lo materializa como VARCHAR + CHECK en SQLite, funciona igual.

La base vive en memoria y se comparte con el TestClient mediante `StaticPool` +
`check_same_thread=False`: así el request HTTP ve exactamente los mismos datos que
insertó el test (con un pool normal cada conexión sería una base vacía distinta).
"""

import pytest
from sqlalchemy import BigInteger, create_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db

# Importar `app.main` registra todos los routers y, de paso, todos los modelos en
# `Base.metadata`, que es lo que necesita `create_all` para armar el esquema.
from app.main import app
from app.modules.propiedades import models as propiedades_models  # noqa: F401
from app.platform.auth.dependencies import COOKIE_NAME
from app.platform.auth.models import Role, User, UserRole
from app.platform.auth.service import hash_password


@compiles(BigInteger, "sqlite")
def _bigint_como_integer_en_sqlite(type_, compiler, **kw) -> str:
    """SQLite solo autoincrementa columnas INTEGER, no BIGINT."""
    return "INTEGER"


@pytest.fixture
def engine():
    motor = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(motor)
    yield motor
    Base.metadata.drop_all(motor)
    motor.dispose()


@pytest.fixture
def db(engine) -> Session:
    TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    sesion = TestSessionLocal()
    try:
        yield sesion
    finally:
        sesion.close()


@pytest.fixture
def client(db):
    """TestClient que usa la misma sesión de base que el test."""

    def _get_db_de_test():
        yield db

    app.dependency_overrides[get_db] = _get_db_de_test
    from fastapi.testclient import TestClient

    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def crear_usuario(db):
    """Fábrica de usuarios de prueba con sus roles ya asociados.

    Devuelve una función en vez de un usuario fijo porque los tests de permisos
    necesitan varios perfiles distintos (admin, staff, sin rol, inactivo) conviviendo
    en el mismo escenario. La contraseña se hashea con el mismo `hash_password` de
    producción: con un hash falso, `authenticate_user` no podría verificarla.
    """

    def _crear(
        email: str = "admin@mambo.com.ar",
        password: str = "secreta123",
        roles: tuple[str, ...] = ("admin",),
        is_active: bool = True,
    ) -> User:
        usuario = User(
            name=email.split("@")[0],
            email=email,
            password_hash=hash_password(password),
            is_active=is_active,
        )
        db.add(usuario)
        db.flush()

        for nombre in roles:
            rol = db.query(Role).filter(Role.name == nombre).first()
            if rol is None:
                rol = Role(name=nombre)
                db.add(rol)
                db.flush()
            db.add(UserRole(user_id=usuario.id, role_id=rol.id))

        db.commit()
        db.refresh(usuario)
        return usuario

    return _crear


@pytest.fixture
def iniciar_sesion(client):
    """Hace login y devuelve el JWT emitido, dejando además al `client` autenticado.

    Se devuelve el token para los tests que necesitan manejar **dos** sesiones a la
    vez (el caso de dos dispositivos): el cliente guarda una sola cookie, así que la
    otra hay que llevarla a mano.
    """

    def _login(email: str = "admin@mambo.com.ar", password: str = "secreta123") -> str:
        respuesta = client.post("/auth/login", json={"email": email, "password": password})
        assert respuesta.status_code == 200, respuesta.text
        return respuesta.cookies[COOKIE_NAME]

    return _login
