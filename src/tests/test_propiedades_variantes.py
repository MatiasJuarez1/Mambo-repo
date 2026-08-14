"""Tests de las variantes de imagen (copias reducidas para `srcset`).

Corren contra el backend de almacenamiento **local** y una carpeta temporal, no
contra mocks: lo que se verifica es que los archivos existan de verdad, con el
ancho que anuncia la clave del JSON. Un mock de `guardar_variante` diría que sí
aunque Pillow estuviera generando cualquier cosa.

Las cuatro reglas que fijan:

1. Una foto grande genera las tres variantes y las deja en la columna.
2. Los anchos mayores o iguales al original se saltean (no se agranda nada).
3. Borrar el medio borra también los archivos de las variantes.
4. Una fila con `variantes` en NULL —las anteriores a la columna, las del seed—
   se serializa sin romper, que es lo que hace posible desplegar sin backfill.
"""

import io
from pathlib import Path

import pytest
from PIL import Image
from sqlalchemy.orm import Session as DBSession

from app.config import get_settings
from app.modules.propiedades.models import (
    EstadoComercial,
    Propiedad,
    PropiedadMedio,
    TipoOperacion,
    TipoPropiedad,
)


@pytest.fixture
def media_tmp(tmp_path: Path, monkeypatch) -> Path:
    """Deja el almacenamiento local apuntando a una carpeta descartable.

    Se toca el entorno y se limpia el `lru_cache` de `get_settings` en vez de
    parchear el objeto `Settings`: es el mismo camino que recorre la app al
    arrancar, así que si algún día un campo dejara de leerse del entorno, el test
    se entera.
    """
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("MEDIA_ROOT", str(tmp_path))
    get_settings.cache_clear()
    yield tmp_path
    get_settings.cache_clear()


@pytest.fixture
def propiedad(db: DBSession) -> Propiedad:
    prop = Propiedad(
        titulo="Casa con fotos",
        tipo_propiedad=TipoPropiedad.casa,
        tipo_operacion=TipoOperacion.venta,
        estado_comercial=EstadoComercial.disponible,
        moneda="ARS",
    )
    db.add(prop)
    db.commit()
    return prop


@pytest.fixture
def staff(client, crear_usuario, iniciar_sesion):
    """Sesión con rol `staff`: subir y borrar medios lo exige."""
    crear_usuario(email="staff.fotos@mambo.com.ar", roles=("staff",))
    iniciar_sesion(email="staff.fotos@mambo.com.ar")
    return client


def _jpeg(ancho: int, alto: int) -> bytes:
    """Un JPEG real del tamaño pedido (un degradé, no un color plano).

    Con un color plano el archivo comprime a casi nada y la variante podría pesar
    lo mismo que el original, lo que haría inútil cualquier comparación de tamaño.
    """
    imagen = Image.new("RGB", (ancho, alto))
    imagen.putdata([(x % 256, (x + y) % 256, y % 256) for y in range(alto) for x in range(ancho)])
    salida = io.BytesIO()
    imagen.save(salida, format="JPEG")
    return salida.getvalue()


def _subir(client, propiedad_id: int, contenido: bytes) -> dict:
    respuesta = client.post(
        f"/api/v1/propiedades/{propiedad_id}/medios/upload",
        files={"archivo": ("foto.jpg", contenido, "image/jpeg")},
    )
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()


def _archivo_de(media_root: Path, url: str) -> Path:
    """Traduce la URL pública local (`/media/propiedades/x.jpg`) a su ruta en disco."""
    return media_root / url.removeprefix(get_settings().media_url_prefix).lstrip("/")


def test_una_foto_grande_genera_las_tres_variantes(staff, propiedad, media_tmp):
    """2000px de ancho: entran los tres anchos y los tres archivos existen de verdad."""
    medio = _subir(staff, propiedad.id, _jpeg(2000, 1500))

    assert sorted(medio["variantes"]) == ["1600", "400", "800"]

    for ancho, url in medio["variantes"].items():
        archivo = _archivo_de(media_tmp, url)
        assert archivo.exists(), f"falta el archivo de la variante {ancho}"
        with Image.open(archivo) as imagen:
            # El ancho real tiene que coincidir con la clave: es el descriptor `w`
            # del srcset y el navegador elige por ese número.
            assert imagen.width == int(ancho)


def test_las_claves_de_las_variantes_salen_del_nombre_del_original(staff, propiedad, media_tmp):
    """`…/<hex>.jpg` → `…/<hex>_800.jpg`. La convención es lo que permite no guardarlas."""
    medio = _subir(staff, propiedad.id, _jpeg(2000, 1500))

    base, extension = medio["url"].rsplit(".", 1)
    for ancho, url in medio["variantes"].items():
        assert url == f"{base}_{ancho}.{extension}"


def test_el_url_principal_sigue_siendo_la_imagen_completa(staff, propiedad, media_tmp):
    """Las variantes se agregan, no reemplazan: `url` sigue siendo el original de 1920."""
    medio = _subir(staff, propiedad.id, _jpeg(2000, 1500))

    with Image.open(_archivo_de(media_tmp, medio["url"])) as imagen:
        assert imagen.width == 1920


def test_una_foto_chica_no_se_agranda(staff, propiedad, media_tmp):
    """600px: solo la de 400. Los otros dos anchos serían copias infladas del mismo archivo."""
    medio = _subir(staff, propiedad.id, _jpeg(600, 450))

    assert list(medio["variantes"]) == ["400"]
    with Image.open(_archivo_de(media_tmp, medio["variantes"]["400"])) as imagen:
        assert imagen.width == 400


def test_una_foto_mas_chica_que_la_variante_mas_chica_queda_sin_variantes(
    staff, propiedad, media_tmp
):
    """300px: la columna queda en NULL, no en `{}`.

    Es el mismo valor que tienen las filas viejas, así el frontend distingue un
    solo caso ("no hay variantes, usá `url`") en vez de dos que significan igual.
    """
    medio = _subir(staff, propiedad.id, _jpeg(300, 225))

    assert medio["variantes"] is None


def test_borrar_el_medio_borra_tambien_las_variantes(staff, propiedad, media_tmp):
    """Sin esto, cada foto borrada dejaría tres archivos huérfanos pagando lugar en R2."""
    medio = _subir(staff, propiedad.id, _jpeg(2000, 1500))
    archivos = [_archivo_de(media_tmp, medio["url"])] + [
        _archivo_de(media_tmp, url) for url in medio["variantes"].values()
    ]
    assert all(archivo.exists() for archivo in archivos)

    respuesta = staff.delete(f"/api/v1/propiedades/{propiedad.id}/medios/{medio['id']}")

    assert respuesta.status_code == 204, respuesta.text
    assert not any(archivo.exists() for archivo in archivos)


def test_un_medio_sin_variantes_se_borra_sin_romper(staff, propiedad, db: DBSession, media_tmp):
    """Las filas anteriores a la columna tienen `variantes` en NULL y hay que poder borrarlas.

    El borrado no debe salir a inventar claves de variantes que nunca se generaron.
    """
    medio = PropiedadMedio(
        propiedad_id=propiedad.id,
        url="/media/propiedades/vieja.jpg",
        storage_key="propiedades/vieja.jpg",
    )
    db.add(medio)
    db.commit()

    assert staff.delete(f"/api/v1/propiedades/{propiedad.id}/medios/{medio.id}").status_code == 204


def test_un_medio_con_variantes_en_null_se_serializa(client, propiedad, db: DBSession):
    """El caso de las fotos ya subidas: la API las devuelve con `variantes: null`.

    Es lo que permite desplegar la columna sin backfill previo. Si esto fallara,
    el sitio público se quedaría sin fotos hasta que alguien corriera el script.
    """
    db.add(
        PropiedadMedio(
            propiedad_id=propiedad.id,
            url="https://ejemplo.test/foto-de-un-tercero.jpg",
        )
    )
    db.commit()

    respuesta = client.get(f"/api/v1/propiedades/{propiedad.id}")

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["medios"][0]["variantes"] is None
