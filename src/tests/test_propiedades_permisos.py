"""Tests de permisos sobre las operaciones de escritura de propiedades y publicaciones.

Estos tests nacieron demostrando un agujero real: hasta ahora `POST`, `PUT`, `DELETE`
y la subida de imágenes no pedían absolutamente nada, así que cualquiera que conociera
la URL podía crear, editar y borrar propiedades, y dejar archivos en el servidor.

La regla que fijan es doble y conviene no confundirla:

- **sin sesión → 401** ("no sé quién sos"),
- **con sesión pero sin rol `staff`/`admin` → 403** ("sé quién sos y no te alcanza").

Y una tercera, igual de importante: los `GET` siguen siendo **públicos y anónimos**.
El sitio los consume sin autenticación; protegerlos por descuido dejaría la web vacía.
"""

import pytest
from sqlalchemy.orm import Session as DBSession

from app.modules.propiedades.models import (
    EstadoComercial,
    Propiedad,
    TipoOperacion,
    TipoPropiedad,
)
from app.modules.publicaciones.models import EstadoPublicacion, Publicacion

# Una imagen no tiene por qué ser válida: la autorización se resuelve antes de que el
# handler llegue a mirar el archivo.
ARCHIVO_DE_PRUEBA = {"archivo": ("foto.jpg", b"contenido-cualquiera", "image/jpeg")}


@pytest.fixture
def propiedad(db: DBSession) -> Propiedad:
    """Una propiedad real, para que un 404 no se confunda con un 401 bien puesto."""
    prop = Propiedad(
        titulo="Casa de prueba",
        tipo_propiedad=TipoPropiedad.casa,
        tipo_operacion=TipoOperacion.venta,
        estado_comercial=EstadoComercial.disponible,
        moneda="ARS",
    )
    db.add(prop)
    db.commit()
    return prop


@pytest.fixture
def publicacion(db: DBSession, propiedad: Propiedad) -> Publicacion:
    pub = Publicacion(propiedad_id=propiedad.id, titulo="Publicación de prueba")
    db.add(pub)
    db.commit()
    return pub


def _escrituras_de_propiedades(propiedad_id: int) -> list[tuple[str, str, dict]]:
    """(método, ruta, kwargs) de cada endpoint que modifica el inventario."""
    return [
        ("post", "/api/v1/propiedades", {"json": {"titulo": "Intrusa"}}),
        ("put", f"/api/v1/propiedades/{propiedad_id}", {"json": {"titulo": "Editada"}}),
        ("delete", f"/api/v1/propiedades/{propiedad_id}", {}),
        (
            "post",
            f"/api/v1/propiedades/{propiedad_id}/medios",
            {"json": {"url": "http://ejemplo.test/foto.jpg"}},
        ),
        (
            "post",
            f"/api/v1/propiedades/{propiedad_id}/medios/upload",
            {"files": ARCHIVO_DE_PRUEBA},
        ),
        ("delete", f"/api/v1/propiedades/{propiedad_id}/medios/1", {}),
        (
            "post",
            f"/api/v1/propiedades/{propiedad_id}/caracteristicas",
            {"json": {"clave": "cochera", "valor": "si"}},
        ),
        ("delete", f"/api/v1/propiedades/{propiedad_id}/caracteristicas/1", {}),
    ]


def _escrituras_de_publicaciones(publicacion_id: int, propiedad_id: int) -> list:
    return [
        (
            "post",
            "/api/v1/publicaciones",
            {"json": {"propiedad_id": propiedad_id, "titulo": "Intrusa"}},
        ),
        ("put", f"/api/v1/publicaciones/{publicacion_id}", {"json": {"titulo": "Editada"}}),
        ("delete", f"/api/v1/publicaciones/{publicacion_id}", {}),
    ]


# ── Sin sesión: 401 ──────────────────────────────────────────────────────────


def test_escribir_propiedades_sin_sesion_da_401(client, propiedad):
    """El agujero que motivó la fase: sin cookie, ninguna escritura puede prosperar."""
    for metodo, ruta, kwargs in _escrituras_de_propiedades(propiedad.id):
        respuesta = getattr(client, metodo)(ruta, **kwargs)
        assert respuesta.status_code == 401, f"{metodo.upper()} {ruta} quedó abierto"


def test_escribir_publicaciones_sin_sesion_da_401(client, publicacion, propiedad):
    for metodo, ruta, kwargs in _escrituras_de_publicaciones(publicacion.id, propiedad.id):
        respuesta = getattr(client, metodo)(ruta, **kwargs)
        assert respuesta.status_code == 401, f"{metodo.upper()} {ruta} quedó abierto"


def test_crear_propiedad_sin_sesion_no_deja_rastro_en_la_base(client, db: DBSession):
    """El 401 tiene que cortar antes del insert, no después."""
    antes = db.query(Propiedad).count()

    assert client.post("/api/v1/propiedades", json={"titulo": "Intrusa"}).status_code == 401
    assert db.query(Propiedad).count() == antes


# ── Con sesión pero sin rol: 403 ─────────────────────────────────────────────


def test_escribir_propiedades_sin_rol_suficiente_da_403(
    client, propiedad, crear_usuario, iniciar_sesion
):
    """Estar autenticado no alcanza: hace falta `staff` o `admin`.

    El 403 (y no un 401) es lo que le permite al frontend distinguir "iniciá sesión"
    de "tu cuenta no tiene permiso", que son dos mensajes distintos para el usuario.
    """
    crear_usuario(email="curioso@mambo.com.ar", roles=("cliente",))
    iniciar_sesion(email="curioso@mambo.com.ar")

    for metodo, ruta, kwargs in _escrituras_de_propiedades(propiedad.id):
        respuesta = getattr(client, metodo)(ruta, **kwargs)
        assert respuesta.status_code == 403, f"{metodo.upper()} {ruta} no exigió rol"


def test_escribir_publicaciones_sin_rol_suficiente_da_403(
    client, publicacion, propiedad, crear_usuario, iniciar_sesion
):
    crear_usuario(email="curioso@mambo.com.ar", roles=("cliente",))
    iniciar_sesion(email="curioso@mambo.com.ar")

    for metodo, ruta, kwargs in _escrituras_de_publicaciones(publicacion.id, propiedad.id):
        respuesta = getattr(client, metodo)(ruta, **kwargs)
        assert respuesta.status_code == 403, f"{metodo.upper()} {ruta} no exigió rol"


def test_usuario_sin_ningun_rol_tampoco_puede_escribir(client, crear_usuario, iniciar_sesion):
    """Un usuario recién creado, sin roles asignados, no escribe nada."""
    crear_usuario(email="pelado@mambo.com.ar", roles=())
    iniciar_sesion(email="pelado@mambo.com.ar")

    assert client.post("/api/v1/propiedades", json={"titulo": "Intrusa"}).status_code == 403


# ── Con rol suficiente: pasa ─────────────────────────────────────────────────


@pytest.mark.parametrize("rol", ["staff", "admin"])
def test_staff_y_admin_pueden_crear_propiedades(client, crear_usuario, iniciar_sesion, rol):
    """Los dos roles habilitados escriben; si esto falla, el panel queda inservible."""
    crear_usuario(email=f"{rol}@mambo.com.ar", roles=(rol,))
    iniciar_sesion(email=f"{rol}@mambo.com.ar")

    respuesta = client.post("/api/v1/propiedades", json={"titulo": "Casa nueva"})

    assert respuesta.status_code == 201, respuesta.text
    assert respuesta.json()["titulo"] == "Casa nueva"


def test_admin_puede_editar_y_borrar(client, propiedad, crear_usuario, iniciar_sesion):
    crear_usuario(roles=("admin",))
    iniciar_sesion()

    assert (
        client.put(f"/api/v1/propiedades/{propiedad.id}", json={"titulo": "Editada"}).status_code
        == 200
    )
    assert client.delete(f"/api/v1/propiedades/{propiedad.id}").status_code == 204


# ── Los GET del sitio público siguen siendo anónimos ─────────────────────────


def test_las_lecturas_publicas_siguen_siendo_anonimas(client, propiedad, publicacion):
    """El sitio público consume estas rutas sin sesión: cerrarlas rompe la web entera."""
    rutas = [
        "/api/v1/propiedades",
        "/api/v1/propiedades/ciudades",
        f"/api/v1/propiedades/{propiedad.id}",
        "/api/v1/publicaciones/publicas",
    ]

    for ruta in rutas:
        assert client.get(ruta).status_code == 200, f"GET {ruta} dejó de ser público"


# ── Los GET de administración de publicaciones NO son públicos ───────────────
#
# `listar_publicaciones` y `obtener_publicacion` no filtran por estado: devuelven
# también las pausadas, es decir borradores y avisos retirados de circulación. Para
# el visitante existe `/publicas`, que solo trae las activas. Dejar las otras dos
# abiertas permitía listar y enumerar por id todo el material no publicado.


def test_listar_todas_las_publicaciones_exige_sesion(client, publicacion):
    assert client.get("/api/v1/publicaciones").status_code == 401


def test_obtener_una_publicacion_por_id_exige_sesion(client, publicacion):
    assert client.get(f"/api/v1/publicaciones/{publicacion.id}").status_code == 401


def test_una_publicacion_pausada_no_se_filtra_por_el_listado_publico(
    client, db: DBSession, propiedad
):
    """El endpoint del visitante solo muestra las activas, aunque haya pausadas."""
    db.add(
        Publicacion(
            propiedad_id=propiedad.id,
            titulo="Borrador que no debe verse",
            estado=EstadoPublicacion.pausada,
        )
    )
    db.commit()

    respuesta = client.get("/api/v1/publicaciones/publicas")

    assert respuesta.status_code == 200
    assert respuesta.json() == []


def test_staff_si_puede_leer_todas_las_publicaciones(
    client, publicacion, crear_usuario, iniciar_sesion
):
    """El panel necesita ver los borradores: con rol, las mismas rutas responden 200."""
    crear_usuario(email="staff.pubs@mambo.com.ar", roles=("staff",))
    iniciar_sesion(email="staff.pubs@mambo.com.ar")

    assert client.get("/api/v1/publicaciones").status_code == 200
    assert client.get(f"/api/v1/publicaciones/{publicacion.id}").status_code == 200
