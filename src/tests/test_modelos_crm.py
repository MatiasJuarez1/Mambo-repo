"""Relaciones y columnas que suma el bloque CRM. Se prueban contra el esquema en memoria."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from app.modules.propiedades.models import Propiedad
from app.platform.deals.models import Comision, ComisionReparto, Deal, Pipeline, PipelineStage
from app.platform.inmobiliaria.models import Inmobiliaria
from app.platform.people.models import Person, PersonTag
from app.platform.reservations.models import Reservation


def test_propiedad_conoce_a_su_propietario(db):
    persona = Person(first_name="Ana", last_name="Pérez")
    db.add(persona)
    db.flush()
    prop = Propiedad(titulo="Casa", propietario_persona_id=persona.id)
    db.add(prop)
    db.commit()

    assert prop.propietario.full_name == "Ana Pérez"


def test_reserva_y_deal_conocen_a_su_propiedad(db, crear_usuario):
    usuario = crear_usuario()
    persona = Person(first_name="Ana", last_name="Pérez")
    prop = Propiedad(titulo="Casa")
    pipeline = Pipeline(name="Venta")
    db.add_all([persona, prop, pipeline])
    db.flush()
    etapa = PipelineStage(pipeline_id=pipeline.id, name="Consulta", position=1)
    db.add(etapa)
    db.flush()
    reserva = Reservation(person_id=persona.id, property_id=prop.id, created_by_user_id=usuario.id)
    deal = Deal(
        title="Venta casa",
        pipeline_id=pipeline.id,
        stage_id=etapa.id,
        created_by_user_id=usuario.id,
        property_id=prop.id,
    )
    db.add_all([reserva, deal])
    db.commit()

    assert reserva.propiedad.titulo == "Casa"
    assert deal.propiedad.titulo == "Casa"
    assert [r.id for r in prop.reservas] == [reserva.id]
    assert [d.id for d in prop.deals] == [deal.id]


def test_dias_en_etapa_sale_de_stage_changed_at(db, crear_usuario):
    usuario = crear_usuario()
    pipeline = Pipeline(name="Venta")
    db.add(pipeline)
    db.flush()
    etapa = PipelineStage(pipeline_id=pipeline.id, name="Consulta", position=1)
    db.add(etapa)
    db.flush()
    deal = Deal(
        title="x",
        pipeline_id=pipeline.id,
        stage_id=etapa.id,
        created_by_user_id=usuario.id,
        stage_changed_at=datetime.now(UTC) - timedelta(days=3, hours=1),
    )
    db.add(deal)
    db.commit()

    assert deal.dias_en_etapa == 3


def test_persona_expone_sus_etiquetas_como_strings(db):
    persona = Person(first_name="Ana", last_name="Pérez")
    persona.tag_rows = [PersonTag(nombre="inversor"), PersonTag(nombre="zona norte")]
    db.add(persona)
    db.commit()

    assert persona.tags == ["inversor", "zona norte"]


def test_inmobiliaria_es_una_tabla(db):
    db.add(Inmobiliaria(id=1, nombre="Mambo Groups"))
    db.commit()
    assert db.get(Inmobiliaria, 1).nombre == "Mambo Groups"


def test_comision_reparto_deriva_monto_y_nombre(db, crear_usuario):
    from tests.helpers_crm import etapa, pipeline_por_nombre

    usuario = crear_usuario()
    venta = pipeline_por_nombre(db, "Venta")
    deal = Deal(
        title="Op",
        pipeline_id=venta.id,
        stage_id=etapa(venta, "Ganada").id,
        created_by_user_id=usuario.id,
        amount=Decimal("1000000"),
    )
    db.add(deal)
    db.flush()
    comision = Comision(
        deal_id=deal.id,
        monto_operacion=Decimal("1000000"),
        moneda="ARS",
        pct=Decimal("3"),
        monto=Decimal("30000.00"),
    )
    comision.reparto.append(ComisionReparto(user_id=usuario.id, pct=Decimal("33.33")))
    db.add(comision)
    db.commit()
    db.refresh(deal)

    assert deal.comision.reparto[0].monto == Decimal("9999.00")
    assert deal.comision.reparto[0].nombre == usuario.name
    assert deal.comision.sin_monto is False
