"""Tests del script que crea el primer administrador.

Sin este script no hay forma de entrar al panel la primera vez: los endpoints de
escritura ya exigen rol `staff`/`admin` y no existe un alta pública de usuarios.

Se prueba `crear_admin()`, que es la parte con lógica; el envoltorio de consola
(`main`) solo pide los datos por teclado y llama acá.
"""

import pytest
from sqlalchemy.orm import Session as DBSession

from app.platform.auth.models import Role, User
from app.platform.auth.service import verify_password
from scripts.crear_admin import EmailYaRegistrado, crear_admin


def test_crea_el_usuario_con_el_rol_admin(db: DBSession):
    """El alta mínima: usuario activo y con permiso para escribir."""
    usuario = crear_admin(db, "jefa@mambo.com.ar", "unaClaveLarga123")

    assert usuario.id is not None
    assert usuario.email == "jefa@mambo.com.ar"
    assert usuario.is_active is True
    assert usuario.roles == ["admin"]


def test_la_contrasena_queda_hasheada_y_verificable(db: DBSession):
    """Se guarda el hash de bcrypt, nunca el texto plano, y `authenticate_user` lo acepta."""
    usuario = crear_admin(db, "jefa@mambo.com.ar", "unaClaveLarga123")

    assert usuario.password_hash != "unaClaveLarga123"
    assert verify_password("unaClaveLarga123", usuario.password_hash)


def test_reutiliza_el_rol_admin_si_ya_existe(db: DBSession):
    """Correr el script dos veces no puede dejar dos filas `admin` en `roles`."""
    db.add(Role(name="admin"))
    db.commit()

    crear_admin(db, "jefa@mambo.com.ar", "unaClaveLarga123")

    roles_admin = db.query(Role).filter(Role.name == "admin").all()
    assert len(roles_admin) == 1
    assert roles_admin[0].id is not None


def test_email_repetido_falla_con_un_mensaje_claro(db: DBSession):
    """Mejor un error explícito que un IntegrityError críptico del motor.

    Importa además porque el segundo intento suele ser alguien tratando de resetear
    una contraseña olvidada: el mensaje tiene que decirle que ese no es el camino.
    """
    crear_admin(db, "jefa@mambo.com.ar", "unaClaveLarga123")

    with pytest.raises(EmailYaRegistrado) as error:
        crear_admin(db, "jefa@mambo.com.ar", "otraClaveLarga456")

    assert "jefa@mambo.com.ar" in str(error.value)


def test_el_email_repetido_no_pisa_la_contrasena_existente(db: DBSession):
    """El intento fallido no puede dejar la cuenta a medio modificar."""
    crear_admin(db, "jefa@mambo.com.ar", "unaClaveLarga123")

    with pytest.raises(EmailYaRegistrado):
        crear_admin(db, "jefa@mambo.com.ar", "otraClaveLarga456")

    usuario = db.query(User).filter(User.email == "jefa@mambo.com.ar").one()
    assert verify_password("unaClaveLarga123", usuario.password_hash)


def test_el_email_se_normaliza_a_minusculas(db: DBSession):
    """El login compara el email tal cual llega; guardarlo en mayúsculas dejaría afuera
    a quien después escriba su dirección en minúsculas."""
    usuario = crear_admin(db, "  Jefa@Mambo.Com.Ar  ", "unaClaveLarga123")

    assert usuario.email == "jefa@mambo.com.ar"


def test_rechaza_contrasenas_demasiado_cortas(db: DBSession):
    """El schema de login exige 6 caracteres: crear algo más corto sería una cuenta
    imposible de usar."""
    with pytest.raises(ValueError):
        crear_admin(db, "jefa@mambo.com.ar", "corta")

    assert db.query(User).count() == 0


def test_el_admin_creado_puede_escribir_propiedades(client, db: DBSession):
    """Integración de punta a punta: es exactamente lo que hace falta el día del despliegue."""
    crear_admin(db, "jefa@mambo.com.ar", "unaClaveLarga123")

    login = client.post(
        "/auth/login", json={"email": "jefa@mambo.com.ar", "password": "unaClaveLarga123"}
    )
    assert login.status_code == 200

    respuesta = client.post("/api/v1/propiedades", json={"titulo": "Primera casa"})
    assert respuesta.status_code == 201, respuesta.text
