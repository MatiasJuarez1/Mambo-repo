"""Los listados no pueden disparar queries por fila (N+1).

Cada test siembra una fila, mide cuántas sentencias SQL cuesta el request, siembra
más filas —cada una con sus propias entidades relacionadas, para que el identity
map no tape nada— y exige que el costo no cambie. Comparar contra la medición
con una fila, en vez de fijar un número, deja agregar un eager load o un campo
sin reescribir el test, y sigue fallando en cuanto algo vuelve a ser lazy.
"""

from datetime import date, datetime, timedelta

import pytest

from app.modules.propiedades.models import (
    Propiedad,
    PropiedadMedio,
    PropiedadUbicacion,
)
from app.modules.publicaciones.models import EstadoPublicacion, Publicacion
from app.platform.activities.models import Activity
from app.platform.auth.models import User
from app.platform.deals.models import Deal, DealParty
from app.platform.reservations.models import Reservation
from tests.helpers_crm import (
    crear_contrato_de_prueba,
    crear_persona,
    crear_propiedad,
    etapa,
    pipeline_por_nombre,
)

MAS_FILAS = 4


@pytest.fixture
def usuario_id(client, crear_usuario, iniciar_sesion, media_tmp) -> int:
    # El id y no el User: `queries_de` vacía la sesión y el objeto queda detached.
    usuario = crear_usuario()
    iniciar_sesion()
    return usuario.id


@pytest.fixture
def queries_de(client, db, contar_queries):
    def _medir(url: str) -> int:
        # Sin esto, las filas recién sembradas siguen en la sesión compartida con
        # el TestClient y un lazy load las resolvería sin ir a la base.
        db.expunge_all()
        with contar_queries() as sentencias:
            r = client.get(url)
        assert r.status_code == 200, r.text
        return len(sentencias)

    return _medir


def _usuario(db, n: int) -> User:
    u = User(name=f"u{n}", email=f"u{n}@test.com", password_hash="x", is_active=True)
    db.add(u)
    db.flush()
    return u


_contador = iter(range(10_000))


def _propiedad_completa(db) -> Propiedad:
    n = next(_contador)
    prop = crear_propiedad(
        db, titulo=f"Prop {n}", propietario_persona_id=crear_persona(db, f"Dueño{n}").id
    )
    db.add(PropiedadUbicacion(propiedad_id=prop.id, ciudad=f"Ciudad {n}"))
    for orden in range(2):
        db.add(
            PropiedadMedio(
                propiedad_id=prop.id,
                url=f"https://x/{n}-{orden}.jpg",
                orden=orden,
                es_principal=orden == 0,
            )
        )
    db.commit()
    return prop


def _deal(db, usuario_id: int, persona_id: int | None = None) -> Deal:
    venta = pipeline_por_nombre(db, "Venta")
    deal = Deal(
        title=f"Op {next(_contador)}",
        pipeline_id=venta.id,
        stage_id=etapa(venta, "Consulta").id,
        created_by_user_id=usuario_id,
        property_id=_propiedad_completa(db).id,
    )
    db.add(deal)
    db.flush()
    db.add(
        DealParty(deal_id=deal.id, person_id=persona_id or crear_persona(db).id, role="comprador")
    )
    db.add(DealParty(deal_id=deal.id, person_id=crear_persona(db).id, role="vendedor"))
    db.commit()
    return deal


def _no_crece(queries_de, url: str, sembrar) -> None:
    sembrar()
    con_una = queries_de(url)
    for _ in range(MAS_FILAS):
        sembrar()
    assert queries_de(url) == con_una


# ── Inventario (público) ──────────────────────────────────────────────────────


def test_listado_de_propiedades(db, queries_de):
    _no_crece(queries_de, "/api/v1/propiedades", lambda: _propiedad_completa(db))


def test_listado_publico_de_publicaciones(db, queries_de):
    def sembrar():
        db.add(
            Publicacion(
                propiedad_id=_propiedad_completa(db).id,
                titulo="Aviso",
                estado=EstadoPublicacion.activa,
                publicada_en=datetime.utcnow(),
            )
        )
        db.commit()

    _no_crece(queries_de, "/api/v1/publicaciones/publicas", sembrar)


# ── CRM ───────────────────────────────────────────────────────────────────────


def test_listado_de_deals(db, usuario_id, queries_de):
    _no_crece(queries_de, "/api/v1/deals", lambda: _deal(db, usuario_id))


def test_listado_de_actividades(db, usuario_id, queries_de):
    def sembrar():
        n = next(_contador)
        db.add(
            Activity(
                title="Llamar",
                activity_type="llamada",
                created_by_user_id=_usuario(db, n).id,
                assigned_to_user_id=_usuario(db, n + 5000).id,
                person_id=crear_persona(db).id,
                property_id=_propiedad_completa(db).id,
                deal_id=_deal(db, usuario_id).id,
            )
        )
        db.commit()

    _no_crece(queries_de, "/api/v1/activities", sembrar)


def test_listado_de_reservas(db, usuario_id, queries_de):
    def sembrar():
        db.add(
            Reservation(
                person_id=crear_persona(db).id,
                property_id=_propiedad_completa(db).id,
                created_by_user_id=_usuario(db, next(_contador)).id,
            )
        )
        db.commit()

    _no_crece(queries_de, "/api/v1/reservations", sembrar)


def test_vinculos_de_una_persona(db, usuario_id, queries_de):
    persona_id = crear_persona(db, "Titular").id

    def sembrar():
        prop = _propiedad_completa(db)
        prop.propietario_persona_id = persona_id
        db.add(
            Reservation(
                person_id=persona_id,
                property_id=_propiedad_completa(db).id,
                created_by_user_id=usuario_id,
            )
        )
        db.commit()
        _deal(db, usuario_id, persona_id=persona_id)
        crear_contrato_de_prueba(
            db,
            usuario_id,
            titulo=f"Alquiler {next(_contador)}",
            partes=[
                {"person_id": persona_id, "rol": "inquilino"},
                {"person_id": crear_persona(db).id, "rol": "propietario"},
            ],
        )

    _no_crece(queries_de, f"/api/v1/people/{persona_id}/vinculos", sembrar)


# ── Alquileres ────────────────────────────────────────────────────────────────


def test_listado_de_contratos(db, usuario_id, queries_de):
    _no_crece(
        queries_de,
        "/api/v1/alquileres/contratos",
        lambda: crear_contrato_de_prueba(db, usuario_id, titulo=f"Depto {next(_contador)}"),
    )


def test_liquidaciones_de_un_contrato(client, db, usuario_id, queries_de):
    hoy = date.today()
    inicio = (hoy.replace(day=1) - timedelta(days=200)).replace(day=1)
    contrato = crear_contrato_de_prueba(
        db, usuario_id, fecha_inicio=inicio, fecha_fin=inicio + timedelta(days=700)
    )
    base = f"/api/v1/alquileres/contratos/{contrato.id}"
    periodos = iter(sorted(c.periodo for c in contrato.cobros if c.periodo < hoy.replace(day=1)))
    cobros = {c.periodo: c.id for c in contrato.cobros}

    def sembrar():
        periodo = next(periodos)
        r = client.post(
            f"{base}/cobros/{cobros[periodo]}/pagos",
            json={
                "fecha_pago": str(periodo + timedelta(days=2)),
                "monto": "100000",
                "punitorio": "0",
                "medio": "efectivo",
            },
        )
        assert r.status_code == 201, r.text
        r = client.post(f"{base}/liquidaciones", json={"periodo": periodo.strftime("%Y-%m")})
        assert r.status_code == 201, r.text

    _no_crece(queries_de, f"{base}/liquidaciones", sembrar)
