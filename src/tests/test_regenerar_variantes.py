"""Tests del backfill de variantes (`scripts/regenerar_variantes.py`).

Corren contra el almacenamiento **local** en una carpeta descartable, igual que
`test_propiedades_variantes.py`: los originales se escriben de verdad y el
script los vuelve a leer de verdad. Con un mock de la lectura, el test más
importante de todos —que una foto rota no se lleve puesto el lote— no probaría
nada, porque la falla que interesa es justamente la del archivo real.

Las cinco reglas que fijan:

1. Una fila con `variantes` en NULL se llena.
2. Es idempotente: la segunda corrida no vuelve a tocarla.
3. `--forzar` sí la reprocesa.
4. Las filas sin `storage_key` (fotos de terceros) se saltean.
5. Una foto que falla no aborta el resto del lote.
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
    TipoMedio,
    TipoOperacion,
    TipoPropiedad,
)
from app.storage import guardar_imagen
from scripts.regenerar_variantes import regenerar


@pytest.fixture
def media_tmp(tmp_path: Path, monkeypatch) -> Path:
    """Deja el almacenamiento local apuntando a una carpeta descartable.

    Se toca el entorno y se limpia el `lru_cache` de `get_settings` (el mismo
    camino que recorre la app al arrancar) en vez de parchear el `Settings`.
    """
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("MEDIA_ROOT", str(tmp_path))
    get_settings.cache_clear()
    yield tmp_path
    get_settings.cache_clear()


@pytest.fixture
def propiedad(db: DBSession) -> Propiedad:
    prop = Propiedad(
        titulo="Casa con fotos viejas",
        tipo_propiedad=TipoPropiedad.casa,
        tipo_operacion=TipoOperacion.venta,
        estado_comercial=EstadoComercial.disponible,
        moneda="ARS",
    )
    db.add(prop)
    db.commit()
    return prop


def _jpeg(ancho: int, alto: int) -> bytes:
    """Un JPEG real del tamaño pedido (un degradé, no un color plano)."""
    imagen = Image.new("RGB", (ancho, alto))
    imagen.putdata([(x % 256, (x + y) % 256, y % 256) for y in range(alto) for x in range(ancho)])
    salida = io.BytesIO()
    imagen.save(salida, format="JPEG")
    return salida.getvalue()


def _medio_ya_subido(
    db: DBSession, propiedad: Propiedad, ancho: int = 2000, alto: int = 1500
) -> PropiedadMedio:
    """Una foto como las de antes de las variantes: archivo en disco, columna en NULL.

    El original se escribe con el mismo `guardar_imagen` de producción, así la
    clave y la URL tienen exactamente la forma que el script se va a encontrar.
    """
    guardado = guardar_imagen(_jpeg(ancho, alto), ".jpg")
    medio = PropiedadMedio(
        propiedad_id=propiedad.id,
        tipo_medio=TipoMedio.imagen,
        url=guardado.url,
        storage_key=guardado.clave,
    )
    db.add(medio)
    db.commit()
    db.refresh(medio)
    return medio


def _archivo_de(media_root: Path, url: str) -> Path:
    """Traduce la URL pública local (`/media/propiedades/x.jpg`) a su ruta en disco."""
    return media_root / url.removeprefix(get_settings().media_url_prefix).lstrip("/")


def test_llena_las_variantes_de_una_fila_en_null(db: DBSession, propiedad, media_tmp):
    """El caso base: la foto ya subida queda con sus tres copias y los archivos existen."""
    medio = _medio_ya_subido(db, propiedad)
    assert medio.variantes is None

    resumen = regenerar(db, informar=lambda _: None)

    assert (resumen.procesados, resumen.salteados, resumen.fallados) == (1, 0, 0)
    db.refresh(medio)
    assert sorted(medio.variantes) == ["1600", "400", "800"]
    for ancho, url in medio.variantes.items():
        archivo = _archivo_de(media_tmp, url)
        assert archivo.exists(), f"falta el archivo de la variante {ancho}"
        with Image.open(archivo) as imagen:
            assert imagen.width == int(ancho)


def test_es_idempotente(db: DBSession, propiedad, media_tmp):
    """Correrlo dos veces no cambia nada la segunda: se puede cortar y retomar sin miedo."""
    medio = _medio_ya_subido(db, propiedad)

    regenerar(db, informar=lambda _: None)
    db.refresh(medio)
    variantes_primera = dict(medio.variantes)
    modificados = {
        archivo: archivo.stat().st_mtime_ns for archivo in media_tmp.rglob("*") if archivo.is_file()
    }

    resumen = regenerar(db, informar=lambda _: None)

    assert (resumen.procesados, resumen.salteados, resumen.fallados) == (0, 1, 0)
    db.refresh(medio)
    assert medio.variantes == variantes_primera
    # Ni siquiera se reescribieron los archivos: la segunda corrida no bajó nada.
    assert {
        archivo: archivo.stat().st_mtime_ns for archivo in media_tmp.rglob("*") if archivo.is_file()
    } == modificados


def test_forzar_reprocesa_una_fila_que_ya_tenia_variantes(db: DBSession, propiedad, media_tmp):
    """La escotilla para cuando lo guardado quedó mal (URLs viejas, un ancho nuevo)."""
    medio = _medio_ya_subido(db, propiedad)
    medio.variantes = {"400": "/media/propiedades/quedo-mal.jpg"}
    db.commit()

    resumen = regenerar(db, forzar=True, informar=lambda _: None)

    assert (resumen.procesados, resumen.salteados, resumen.fallados) == (1, 0, 0)
    db.refresh(medio)
    assert sorted(medio.variantes) == ["1600", "400", "800"]
    assert medio.variantes["400"] != "/media/propiedades/quedo-mal.jpg"


def test_saltea_las_filas_sin_storage_key(db: DBSession, propiedad, media_tmp):
    """Los medios del seed apuntan a URLs de terceros: no hay original nuestro que bajar."""
    medio = PropiedadMedio(
        propiedad_id=propiedad.id,
        tipo_medio=TipoMedio.imagen,
        url="https://ejemplo.test/foto-de-un-tercero.jpg",
    )
    db.add(medio)
    db.commit()

    reporte: list[str] = []
    resumen = regenerar(db, informar=reporte.append)

    assert (resumen.procesados, resumen.salteados, resumen.fallados) == (0, 1, 0)
    db.refresh(medio)
    assert medio.variantes is None
    assert any("storage_key" in linea for linea in reporte)


def test_una_foto_que_falla_no_aborta_el_lote(db: DBSession, propiedad, media_tmp):
    """La razón de ser del manejo de errores: 1 archivo corrupto no puede costar 199 fotos.

    La rota va en el medio a propósito: si el lote muriera con ella, la tercera
    quedaría sin procesar y el test lo vería.
    """
    primera = _medio_ya_subido(db, propiedad)

    rota = PropiedadMedio(
        propiedad_id=propiedad.id,
        tipo_medio=TipoMedio.imagen,
        url="/media/propiedades/rota.jpg",
        storage_key="propiedades/rota.jpg",
    )
    db.add(rota)
    db.commit()
    archivo_roto = _archivo_de(media_tmp, rota.url)
    archivo_roto.parent.mkdir(parents=True, exist_ok=True)
    archivo_roto.write_bytes(b"esto no es un JPEG")

    tercera = _medio_ya_subido(db, propiedad)

    resumen = regenerar(db, informar=lambda _: None)

    assert (resumen.procesados, resumen.salteados, resumen.fallados) == (2, 0, 1)
    assert resumen.fallas[0][0] == rota.id
    for medio in (primera, tercera):
        db.refresh(medio)
        assert sorted(medio.variantes) == ["1600", "400", "800"]
    db.refresh(rota)
    assert rota.variantes is None


def test_dry_run_no_escribe_nada(db: DBSession, propiedad, media_tmp):
    """Sirve para contar antes de gastar descargas, no para dejar la base a medias."""
    medio = _medio_ya_subido(db, propiedad)
    archivos = sorted(archivo.name for archivo in media_tmp.rglob("*") if archivo.is_file())

    resumen = regenerar(db, dry_run=True, informar=lambda _: None)

    assert (resumen.procesados, resumen.salteados, resumen.fallados) == (1, 0, 0)
    db.refresh(medio)
    assert medio.variantes is None
    assert sorted(a.name for a in media_tmp.rglob("*") if a.is_file()) == archivos
