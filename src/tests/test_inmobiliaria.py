"""Tests de la configuración de la inmobiliaria y del listado de usuarios.

La fila de `inmobiliaria` es única (id=1) y se autocrea si no existe -en test no
hay migraciones, así que el `GET` es quien la crea la primera vez-. El logo se
sube igual que las fotos de propiedades (Pillow valida y normaliza), pero sin
variantes: es un solo archivo, no un `srcset`.
"""

import io
from pathlib import Path

from PIL import Image


def _png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), "white").save(buffer, format="PNG")
    return buffer.getvalue()


def test_get_crea_la_fila_por_defecto(client, crear_usuario, iniciar_sesion):
    crear_usuario(roles=("staff",))
    iniciar_sesion()

    r = client.get("/api/v1/inmobiliaria")

    assert r.status_code == 200
    assert r.json()["nombre"] == "Mambo Groups"
    assert r.json()["honorarios_venta_pct"] is None


def test_put_solo_admin(client, crear_usuario, iniciar_sesion):
    crear_usuario(email="staff@mambo.com.ar", roles=("staff",))
    iniciar_sesion(email="staff@mambo.com.ar")
    assert client.put("/api/v1/inmobiliaria", json={"nombre": "Otra"}).status_code == 403

    crear_usuario()
    iniciar_sesion()
    r = client.put(
        "/api/v1/inmobiliaria",
        json={"nombre": "Mambo", "honorarios_venta_pct": 3, "honorarios_alquiler_pct": 5},
    )
    assert r.status_code == 200, r.text
    assert r.json()["nombre"] == "Mambo"
    assert float(r.json()["honorarios_venta_pct"]) == 3.0


def test_subir_logo(client, crear_usuario, iniciar_sesion, tmp_path, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "media_root", tmp_path)
    crear_usuario()
    iniciar_sesion()

    r = client.post(
        "/api/v1/inmobiliaria/logo", files={"archivo": ("logo.png", _png(), "image/png")}
    )

    assert r.status_code == 200, r.text
    assert r.json()["logo_url"].endswith(".jpg") or r.json()["logo_url"].endswith(".png")


def test_subir_logo_reemplaza_el_anterior(
    client, db, crear_usuario, iniciar_sesion, tmp_path, monkeypatch
):
    """Al subir un logo nuevo, el anterior se borra del almacenamiento."""
    from app.config import get_settings
    from app.platform.inmobiliaria.service import obtener as obtener_inmobiliaria

    monkeypatch.setattr(get_settings(), "media_root", tmp_path)
    crear_usuario()
    iniciar_sesion()

    # Primera subida
    r1 = client.post(
        "/api/v1/inmobiliaria/logo",
        files={"archivo": ("logo.png", _png(), "image/png")},
    )
    assert r1.status_code == 200, r1.text
    first_url = r1.json()["logo_url"]

    # Guardar la clave del primer logo para verificar su borrado
    inmobiliaria_antes = obtener_inmobiliaria(db)
    first_storage_key = inmobiliaria_antes.logo_storage_key
    first_file_path = Path(tmp_path) / first_storage_key

    # Verificar que el primer archivo existe
    assert first_file_path.exists(), "El primer logo debería existir"

    # Segunda subida con contenido diferente
    r2 = client.post(
        "/api/v1/inmobiliaria/logo",
        files={"archivo": ("logo2.png", _png(), "image/png")},
    )
    assert r2.status_code == 200, r2.text
    second_url = r2.json()["logo_url"]

    # URLs diferentes
    assert first_url != second_url, "URLs del primer y segundo logo distintas"

    # El archivo del primer logo debería haberse borrado
    assert not first_file_path.exists(), "El primer logo debería haberse borrado"


def test_listado_de_usuarios(client, crear_usuario, iniciar_sesion):
    crear_usuario()
    crear_usuario(email="staff@mambo.com.ar", roles=("staff",))
    iniciar_sesion()

    r = client.get("/auth/users")

    assert r.status_code == 200
    assert {u["email"] for u in r.json()} == {"admin@mambo.com.ar", "staff@mambo.com.ar"}
    assert set(r.json()[0]) == {"id", "name", "email"}


def test_put_punitorio_y_gracia_y_get_email_configurado(client, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    r = client.put("/api/v1/inmobiliaria", json={"punitorio_diario_pct": "0.100", "dias_gracia": 5})
    assert r.status_code == 200, r.text
    assert float(r.json()["punitorio_diario_pct"]) == 0.1
    assert r.json()["dias_gracia"] == 5
    assert r.json()["email_configurado"] is False


def test_dias_aviso_recordatorios_y_recordatorios_configurado(
    client, crear_usuario, iniciar_sesion, monkeypatch
):
    from app.config import get_settings

    crear_usuario()
    iniciar_sesion()
    s = get_settings()
    monkeypatch.setattr(s, "recordatorios_token", None)

    r = client.get("/api/v1/inmobiliaria")
    assert r.json()["dias_aviso_recordatorios"] == 30
    assert r.json()["recordatorios_configurado"] is False

    r = client.put("/api/v1/inmobiliaria", json={"dias_aviso_recordatorios": 60})
    assert r.status_code == 200, r.text
    assert r.json()["dias_aviso_recordatorios"] == 60
    for fuera_de_rango in (0, 181):
        r = client.put("/api/v1/inmobiliaria", json={"dias_aviso_recordatorios": fuera_de_rango})
        assert r.status_code == 422

    monkeypatch.setattr(s, "recordatorios_token", "secreto")
    monkeypatch.setattr(s, "smtp_host", "smtp.ejemplo.com")
    monkeypatch.setattr(s, "email_from", "Mambo <no-reply@mambo.com.ar>")
    assert client.get("/api/v1/inmobiliaria").json()["recordatorios_configurado"] is True
