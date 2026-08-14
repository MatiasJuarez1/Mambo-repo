"""Tests de `listar_propiedades`: filtro por varios estados y orden del listado público.

El sitio público muestra las operaciones ya cerradas (vendidas / alquiladas) junto a
las disponibles, con una faja encima. Eso exige dos cosas de esta capa:

1. poder pedir **varios** estados en una sola consulta (`estados`), sin perder el
   filtro exacto de `estado_comercial` que usa el admin;
2. que las disponibles vengan **primero**, para que la paginación no empuje el
   inventario vigente detrás de las cerradas.
"""

from datetime import datetime

from sqlalchemy.orm import Session

from app.modules.propiedades.models import (
    EstadoComercial,
    Propiedad,
    TipoOperacion,
    TipoPropiedad,
)
from app.modules.propiedades.service import listar_propiedades


def _crear_propiedad(
    db: Session,
    titulo: str,
    *,
    estado_comercial: EstadoComercial = EstadoComercial.disponible,
    tipo_operacion: TipoOperacion = TipoOperacion.venta,
    creado_en: datetime | None = None,
    eliminado_en: datetime | None = None,
) -> Propiedad:
    prop = Propiedad(
        titulo=titulo,
        tipo_propiedad=TipoPropiedad.casa,
        tipo_operacion=tipo_operacion,
        estado_comercial=estado_comercial,
        moneda="ARS",
        eliminado_en=eliminado_en,
    )
    if creado_en is not None:
        prop.creado_en = creado_en
    db.add(prop)
    db.commit()
    return prop


def _titulos(props: list[Propiedad]) -> list[str]:
    return [p.titulo for p in props]


# ── Filtro por varios estados ────────────────────────────────────────────────


def test_estados_devuelve_solo_los_pedidos(db: Session):
    """`estados` acota el listado al conjunto pedido."""
    _crear_propiedad(db, "Disponible")
    _crear_propiedad(db, "Cerrada", estado_comercial=EstadoComercial.cerrada)
    _crear_propiedad(db, "Baja", estado_comercial=EstadoComercial.baja)

    resultado = listar_propiedades(
        db, estados=[EstadoComercial.disponible, EstadoComercial.cerrada]
    )

    assert sorted(_titulos(resultado)) == ["Cerrada", "Disponible"]


def test_estados_deja_afuera_las_dadas_de_baja(db: Session):
    """`baja` es una propiedad retirada, no una operación cerrada: nunca es pública."""
    _crear_propiedad(db, "Vigente")
    _crear_propiedad(db, "Retirada", estado_comercial=EstadoComercial.baja)

    resultado = listar_propiedades(
        db,
        estados=[
            EstadoComercial.disponible,
            EstadoComercial.reservada,
            EstadoComercial.cerrada,
        ],
    )

    assert _titulos(resultado) == ["Vigente"]


def test_sin_estados_no_filtra_por_estado(db: Session):
    """Sin `estados` ni `estado_comercial` el listado no discrimina (uso del admin)."""
    _crear_propiedad(db, "Disponible")
    _crear_propiedad(db, "Baja", estado_comercial=EstadoComercial.baja)

    assert len(listar_propiedades(db)) == 2


def test_estado_comercial_exacto_sigue_funcionando(db: Session):
    """El filtro de un solo estado que ya usaba el admin no cambia de comportamiento."""
    _crear_propiedad(db, "Disponible")
    _crear_propiedad(db, "Cerrada", estado_comercial=EstadoComercial.cerrada)

    resultado = listar_propiedades(db, estado_comercial=EstadoComercial.disponible)

    assert _titulos(resultado) == ["Disponible"]


def test_eliminadas_quedan_afuera_aunque_su_estado_este_pedido(db: Session):
    """El borrado lógico manda por encima del filtro de estados."""
    _crear_propiedad(db, "Vigente")
    _crear_propiedad(db, "Borrada", eliminado_en=datetime(2026, 1, 1, 12, 0, 0))

    resultado = listar_propiedades(db, estados=[EstadoComercial.disponible])

    assert _titulos(resultado) == ["Vigente"]


# ── Orden ────────────────────────────────────────────────────────────────────


def test_disponibles_van_antes_que_las_cerradas(db: Session):
    """Las cerradas se muestran, pero nunca por delante del inventario vigente."""
    _crear_propiedad(db, "Cerrada", estado_comercial=EstadoComercial.cerrada)
    _crear_propiedad(db, "Reservada", estado_comercial=EstadoComercial.reservada)
    _crear_propiedad(db, "Disponible")

    resultado = listar_propiedades(
        db,
        estados=[
            EstadoComercial.disponible,
            EstadoComercial.reservada,
            EstadoComercial.cerrada,
        ],
    )

    assert _titulos(resultado)[0] == "Disponible"


def test_dentro_del_mismo_estado_ordena_por_mas_reciente(db: Session):
    """A igual estado, primero la carga más nueva."""
    _crear_propiedad(db, "Vieja", creado_en=datetime(2026, 1, 1, 10, 0, 0))
    _crear_propiedad(db, "Nueva", creado_en=datetime(2026, 6, 1, 10, 0, 0))
    _crear_propiedad(db, "Media", creado_en=datetime(2026, 3, 1, 10, 0, 0))

    assert _titulos(listar_propiedades(db)) == ["Nueva", "Media", "Vieja"]


def test_la_paginacion_no_empuja_las_disponibles_detras_de_las_cerradas(db: Session):
    """Con `limit` chico, la primera página sigue siendo de propiedades vigentes.

    Es el motivo por el que el orden vive en la consulta y no en el frontend: si se
    ordenara en el cliente, el backend ya habría recortado a las primeras N filas.
    """
    for i in range(5):
        _crear_propiedad(
            db,
            f"Cerrada {i}",
            estado_comercial=EstadoComercial.cerrada,
            creado_en=datetime(2026, 6, 1, 10, 0, 0),  # más nuevas que las disponibles
        )
    _crear_propiedad(db, "Disponible", creado_en=datetime(2026, 1, 1, 10, 0, 0))

    resultado = listar_propiedades(
        db,
        estados=[EstadoComercial.disponible, EstadoComercial.cerrada],
        limit=2,
    )

    assert _titulos(resultado)[0] == "Disponible"


# ── Endpoint ─────────────────────────────────────────────────────────────────


def test_endpoint_acepta_estados_repetidos_en_la_query(client, db: Session):
    """Integración: `?estados=disponible&estados=cerrada` llega como lista al servicio."""
    _crear_propiedad(db, "Disponible")
    _crear_propiedad(db, "Cerrada", estado_comercial=EstadoComercial.cerrada)
    _crear_propiedad(db, "Baja", estado_comercial=EstadoComercial.baja)

    respuesta = client.get("/api/v1/propiedades?estados=disponible&estados=cerrada")

    assert respuesta.status_code == 200
    assert sorted(p["titulo"] for p in respuesta.json()) == ["Cerrada", "Disponible"]


def test_endpoint_rechaza_un_estado_inexistente(client):
    """Un valor fuera del enum es 422, no un listado silenciosamente vacío."""
    assert client.get("/api/v1/propiedades?estados=inventado").status_code == 422
