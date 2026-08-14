"""Tests de `listar_ciudades`: las zonas que alimentan el desplegable del frontend."""

from datetime import datetime

from sqlalchemy.orm import Session

from app.modules.propiedades.models import (
    EstadoComercial,
    Propiedad,
    PropiedadUbicacion,
    TipoOperacion,
    TipoPropiedad,
)
from app.modules.propiedades.service import listar_ciudades


def _crear_propiedad(
    db: Session,
    ciudad: str | None,
    *,
    titulo: str = "Propiedad de prueba",
    estado_comercial: EstadoComercial = EstadoComercial.disponible,
    eliminado_en: datetime | None = None,
    con_ubicacion: bool = True,
) -> Propiedad:
    """Alta mínima de una propiedad con su ubicación, para armar los escenarios."""
    prop = Propiedad(
        titulo=titulo,
        tipo_propiedad=TipoPropiedad.casa,
        tipo_operacion=TipoOperacion.venta,
        estado_comercial=estado_comercial,
        moneda="ARS",
        eliminado_en=eliminado_en,
    )
    db.add(prop)
    db.flush()

    if con_ubicacion:
        db.add(PropiedadUbicacion(propiedad_id=prop.id, ciudad=ciudad))

    db.commit()
    return prop


def test_sin_propiedades_devuelve_lista_vacia(db: Session):
    """Sin datos cargados no hay ciudades que ofrecer."""
    assert listar_ciudades(db) == []


def test_ciudad_repetida_aparece_una_sola_vez(db: Session):
    """Varias propiedades en la misma ciudad no duplican la opción del desplegable."""
    _crear_propiedad(db, "Córdoba", titulo="Casa 1")
    _crear_propiedad(db, "Córdoba", titulo="Casa 2")
    _crear_propiedad(db, "Córdoba", titulo="Casa 3")

    assert listar_ciudades(db) == ["Córdoba"]


def test_ciudades_ordenadas_alfabeticamente(db: Session):
    """El resultado viene ordenado alfabéticamente, sin importar el orden de alta."""
    _crear_propiedad(db, "Rosario", titulo="Casa Rosario")
    _crear_propiedad(db, "Buenos Aires", titulo="Casa BA")
    _crear_propiedad(db, "Mendoza", titulo="Casa Mendoza")

    assert listar_ciudades(db) == ["Buenos Aires", "Mendoza", "Rosario"]


def test_propiedad_eliminada_no_aporta_su_ciudad(db: Session):
    """Una propiedad con borrado lógico no debe dejar su ciudad en la lista."""
    _crear_propiedad(db, "Salta", titulo="Vigente")
    _crear_propiedad(
        db,
        "Tucumán",
        titulo="Eliminada",
        eliminado_en=datetime(2026, 1, 1, 12, 0, 0),
    )

    assert listar_ciudades(db) == ["Salta"]


def test_propiedad_no_disponible_no_aporta_su_ciudad(db: Session):
    """Solo cuentan las propiedades con estado comercial `disponible`."""
    _crear_propiedad(db, "La Plata", titulo="Disponible")
    _crear_propiedad(
        db,
        "Mar del Plata",
        titulo="Cerrada",
        estado_comercial=EstadoComercial.cerrada,
    )
    _crear_propiedad(
        db,
        "Bariloche",
        titulo="Reservada",
        estado_comercial=EstadoComercial.reservada,
    )

    assert listar_ciudades(db) == ["La Plata"]


def test_ciudad_nula_o_vacia_se_descarta(db: Session):
    """Las ubicaciones sin ciudad cargada (nula o cadena vacía) no ensucian la lista."""
    _crear_propiedad(db, None, titulo="Sin ciudad")
    _crear_propiedad(db, "", titulo="Ciudad vacía")
    _crear_propiedad(db, "Neuquén", titulo="Con ciudad")

    assert listar_ciudades(db) == ["Neuquén"]


def test_endpoint_ciudades_responde_200_y_lista(client, db: Session):
    """Integración: `/api/v1/propiedades/ciudades` resuelve por su propia ruta.

    Si la ruta quedara declarada después de `/{propiedad_id}`, FastAPI intentaría
    convertir "ciudades" a int y devolvería 422; este test lo detecta.
    """
    _crear_propiedad(db, "Villa Carlos Paz", titulo="Casa VCP")
    _crear_propiedad(db, "Alta Gracia", titulo="Casa AG")

    respuesta = client.get("/api/v1/propiedades/ciudades")

    assert respuesta.status_code == 200
    assert respuesta.json() == ["Alta Gracia", "Villa Carlos Paz"]
