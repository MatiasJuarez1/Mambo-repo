"""Crea el primer usuario administrador del panel.

Sin esto no hay manera de entrar la primera vez: los endpoints de escritura exigen
rol `staff`/`admin` y no existe un alta pública de usuarios.

Uso (desde `src/`):

    python -m scripts.crear_admin
    python -m scripts.crear_admin jefa@mambo.com.ar

La contraseña **nunca** se pasa por argumento: quedaría escrita en el historial del
shell y en la lista de procesos de la máquina. Se pide por consola con `getpass`, que
además no la muestra mientras se tipea.
"""
from __future__ import annotations

import getpass
import sys

from sqlalchemy.orm import Session as DBSession

# Importar `app.main` registra TODOS los modelos en `Base.registry`, no solo los de
# auth. Hace falta: `User.person` referencia a `Person` por nombre, y si esa clase
# nunca se importó, SQLAlchemy no puede resolver la relación y el script muere con
# un `InvalidRequestError` antes de tocar la base. Es el mismo recurso que usa
# `tests/conftest.py`; sin esto el script funciona en los tests (que sí importan la
# app) pero falla al ejecutarlo a mano, que es justamente para lo que existe.
import app.main  # noqa: F401
from app.database import SessionLocal
from app.platform.auth.models import Role, User, UserRole
from app.platform.auth.service import get_user_by_email, hash_password

ROL_ADMIN = "admin"
LARGO_MINIMO_CONTRASENA = 6  # el mismo que exige `LoginRequest`


class EmailYaRegistrado(Exception):
    """Ya hay un usuario con ese email.

    Es un error propio y no el `IntegrityError` del motor para poder dar un mensaje
    entendible: el segundo intento suele ser alguien queriendo recuperar una
    contraseña olvidada, y este script no sirve para eso.
    """


def obtener_o_crear_rol(db: DBSession, nombre: str) -> Role:
    """Devuelve el rol, creándolo si falta.

    La tabla `roles` puede venir vacía en una base recién instalada, así que el script
    no puede darla por sentada; y si el rol ya está, se respeta tal cual (incluida su
    descripción) para no pisar datos existentes.
    """
    rol = db.query(Role).filter(Role.name == nombre).first()
    if rol is None:
        rol = Role(name=nombre)
        db.add(rol)
        db.flush()
    return rol


def crear_admin(db: DBSession, email: str, contrasena: str, nombre: str | None = None) -> User:
    """Da de alta un usuario activo con rol `admin` y la contraseña hasheada.

    El commit es uno solo al final: si algo falla en el medio, no queda un usuario
    sin rol (que no podría escribir nada y sería difícil de diagnosticar).
    """
    email_normalizado = email.strip().lower()
    if not email_normalizado:
        raise ValueError("El email no puede estar vacío.")
    if len(contrasena) < LARGO_MINIMO_CONTRASENA:
        raise ValueError(
            f"La contraseña debe tener al menos {LARGO_MINIMO_CONTRASENA} caracteres."
        )
    if get_user_by_email(db, email_normalizado):
        raise EmailYaRegistrado(
            f"Ya existe un usuario con el email {email_normalizado}. "
            "Este script solo crea el primer administrador; para cambiar una "
            "contraseña hay que hacerlo desde la base."
        )

    usuario = User(
        # `users.name` es NOT NULL en la base. Si no se indica, se usa la parte local
        # del email como nombre visible para no bloquear el alta por un dato que el
        # panel todavía no muestra en ningún lado.
        name=(nombre or email_normalizado.split("@")[0]).strip(),
        email=email_normalizado,
        password_hash=hash_password(contrasena),
        is_active=True,
    )
    db.add(usuario)
    db.flush()

    rol = obtener_o_crear_rol(db, ROL_ADMIN)
    db.add(UserRole(user_id=usuario.id, role_id=rol.id))

    db.commit()
    db.refresh(usuario)
    return usuario


def _pedir_contrasena() -> str:
    """Pide la contraseña dos veces para atajar el error de tipeo.

    Es la única oportunidad de escribirla: si queda mal, el usuario no puede entrar y
    tampoco hay pantalla de recuperación.
    """
    contrasena = getpass.getpass("Contraseña: ")
    if contrasena != getpass.getpass("Repetir contraseña: "):
        raise ValueError("Las contraseñas no coinciden.")
    return contrasena


def main(argv: list[str] | None = None) -> int:
    argumentos = sys.argv[1:] if argv is None else argv
    email = argumentos[0] if argumentos else input("Email del administrador: ")

    try:
        contrasena = _pedir_contrasena()
    except (ValueError, KeyboardInterrupt, EOFError) as error:
        print(f"Cancelado: {error or 'entrada interrumpida'}")
        return 1

    db = SessionLocal()
    try:
        usuario = crear_admin(db, email, contrasena)
    except (EmailYaRegistrado, ValueError) as error:
        print(f"Error: {error}")
        return 1
    finally:
        db.close()

    print(f"Administrador creado: {usuario.email} (id={usuario.id})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
