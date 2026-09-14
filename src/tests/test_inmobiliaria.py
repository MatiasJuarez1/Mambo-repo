"""Tests de la configuración de la inmobiliaria y del listado de usuarios.

La fila de `inmobiliaria` es única (id=1) y se autocrea si no existe -en test no
hay migraciones, así que el `GET` es quien la crea la primera vez-. El logo se
sube igual que las fotos de propiedades (Pillow valida y normaliza), pero sin
variantes: es un solo archivo, no un `srcset`.
"""

import io

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


def test_listado_de_usuarios(client, crear_usuario, iniciar_sesion):
    crear_usuario()
    crear_usuario(email="staff@mambo.com.ar", roles=("staff",))
    iniciar_sesion()

    r = client.get("/auth/users")

    assert r.status_code == 200
    assert {u["email"] for u in r.json()} == {"admin@mambo.com.ar", "staff@mambo.com.ar"}
    assert set(r.json()[0]) == {"id", "name", "email"}
