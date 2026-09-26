"""Fábricas mínimas para los tests del CRM. Insertan directo en la sesión de test."""

from app.modules.propiedades.models import EstadoComercial, Propiedad, TipoOperacion
from app.platform.deals.models import Pipeline, PipelineStage
from app.platform.deals.service import sembrar_pipelines_base
from app.platform.people.models import Person


def crear_propiedad(
    db,
    titulo: str = "Casa en Villa Elisa",
    estado: EstadoComercial = EstadoComercial.disponible,
    operacion: TipoOperacion = TipoOperacion.venta,
    **campos,
) -> Propiedad:
    prop = Propiedad(
        titulo=titulo, estado_comercial=estado, tipo_operacion=operacion, precio=100000, **campos
    )
    db.add(prop)
    db.commit()
    db.refresh(prop)
    return prop


def crear_persona(db, first_name: str = "Ana", last_name: str = "Pérez", **campos) -> Person:
    persona = Person(first_name=first_name, last_name=last_name, **campos)
    db.add(persona)
    db.commit()
    db.refresh(persona)
    return persona


def pipeline_por_nombre(db, nombre: str) -> Pipeline:
    """Devuelve el pipeline base, sembrándolos si hace falta."""
    sembrar_pipelines_base(db)
    return db.query(Pipeline).filter(Pipeline.name == nombre).one()


def etapa(pipeline: Pipeline, nombre: str) -> PipelineStage:
    return next(s for s in pipeline.stages if s.name == nombre)


def crear_contrato_de_prueba(db, user_id: int, **campos):
    """Contrato administrado de 12 meses (por defecto) con inquilino y propietario nuevos.

    `campos` sobreescribe cualquier campo de `ContratoCrear`. Devuelve el `Contrato`.
    """
    from datetime import date

    from app.platform.alquileres.schemas import ContratoCrear
    from app.platform.alquileres.service import crear_contrato

    prop = crear_propiedad(
        db, titulo=campos.pop("titulo", "Depto en La Plata"), operacion=TipoOperacion.alquiler
    )
    inquilino = crear_persona(db, "Ana", "Pérez")
    propietario = crear_persona(db, "Juan", "López")
    base = {
        "property_id": prop.id,
        "partes": [
            {"person_id": inquilino.id, "rol": "inquilino"},
            {"person_id": propietario.id, "rol": "propietario"},
        ],
        "fecha_inicio": date(2026, 1, 1),
        "fecha_fin": date(2026, 12, 31),
        "dia_vencimiento": 10,
        "monto_inicial": 100000,
        "moneda": "ARS",
        "indice": "sin_ajuste",
        "administrado": True,
        "honorarios_pct": 10,
    }
    base.update(campos)
    return crear_contrato(db, ContratoCrear.model_validate(base), user_id)


def crear_deal(client, db, titulo: str = "Op") -> int:
    """Crea una operación por la API (pipeline Venta, etapa Consulta) y devuelve su id."""
    p = pipeline_por_nombre(db, "Venta")
    r = client.post(
        "/api/v1/deals",
        json={
            "title": titulo,
            "pipeline_id": p.id,
            "stage_id": etapa(p, "Consulta").id,
            "amount": 1000000,
            "parties": [{"person_id": crear_persona(db).id, "role": "comprador"}],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]
