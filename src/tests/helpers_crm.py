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
