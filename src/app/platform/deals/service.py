"""Lógica de negocio: CRUD pipelines, deals, movimiento de etapa, deal_parties."""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session as DBSession
from sqlalchemy.orm import joinedload, selectinload

from app.modules.propiedades.service import EventoOperacion, aplicar_evento_de_operacion
from app.platform.deals import comisiones, historial
from app.platform.deals.models import Deal, DealParty, Pipeline, PipelineStage
from app.platform.deals.pipelines_base import PIPELINES_BASE
from app.platform.deals.schemas import (
    DealCreate,
    DealMoveStage,
    DealPartyCreate,
    DealUpdate,
    PipelineCreate,
    PipelineStageCreate,
    PipelineStageUpdate,
    PipelineUpdate,
)
from app.platform.reservations.models import Reservation

# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

def list_pipelines(db: DBSession, active_only: bool = False) -> list[Pipeline]:
    q = db.query(Pipeline)
    if active_only:
        q = q.filter(Pipeline.is_active.is_(True))
    return q.order_by(Pipeline.name).all()


def get_pipeline_or_404(db: DBSession, pipeline_id: int) -> Pipeline:
    pipeline = db.query(Pipeline).filter(Pipeline.id == pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pipeline no encontrado")
    return pipeline


def create_pipeline(db: DBSession, data: PipelineCreate) -> Pipeline:
    if db.query(Pipeline).filter(Pipeline.name == data.name).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un pipeline con ese nombre",
        )
    pipeline = Pipeline(
        name=data.name,
        description=data.description,
        is_active=data.is_active,
    )
    db.add(pipeline)
    db.flush()

    for stage_data in data.stages:
        stage = PipelineStage(pipeline_id=pipeline.id, **stage_data.model_dump())
        db.add(stage)

    db.commit()
    db.refresh(pipeline)
    return pipeline


def update_pipeline(db: DBSession, pipeline_id: int, data: PipelineUpdate) -> Pipeline:
    pipeline = get_pipeline_or_404(db, pipeline_id)
    if data.name and data.name != pipeline.name:
        if db.query(Pipeline).filter(Pipeline.name == data.name).first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe un pipeline con ese nombre",
            )
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(pipeline, field, value)
    db.commit()
    db.refresh(pipeline)
    return pipeline


def delete_pipeline(db: DBSession, pipeline_id: int) -> None:
    pipeline = get_pipeline_or_404(db, pipeline_id)
    active_deals = db.query(Deal).filter(
        Deal.pipeline_id == pipeline_id,
        Deal.deleted_at.is_(None),
        Deal.is_won.is_(False),
        Deal.is_lost.is_(False),
    ).count()
    if active_deals:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"El pipeline tiene {active_deals} deal(s) activo(s); no se puede eliminar",
        )
    db.delete(pipeline)
    db.commit()


def sembrar_pipelines_base(db: DBSession) -> None:
    """Crea Venta y Alquiler con sus etapas si la tabla está vacía.

    Idempotente. La migración 0004 hace lo mismo en producción; esta versión es
    para los tests y para un entorno de desarrollo recién creado.
    """
    if db.query(Pipeline).count() > 0:
        return
    for nombre, etapas in PIPELINES_BASE:
        pipeline = Pipeline(name=nombre)
        db.add(pipeline)
        db.flush()
        for etapa, posicion, is_won, is_lost in etapas:
            db.add(
                PipelineStage(
                    pipeline_id=pipeline.id, name=etapa, position=posicion,
                    is_won=is_won, is_lost=is_lost,
                )
            )
    db.commit()


# ---------------------------------------------------------------------------
# PipelineStage
# ---------------------------------------------------------------------------

def get_stage_or_404(db: DBSession, pipeline_id: int, stage_id: int) -> PipelineStage:
    stage = (
        db.query(PipelineStage)
        .filter(PipelineStage.id == stage_id, PipelineStage.pipeline_id == pipeline_id)
        .first()
    )
    if not stage:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Etapa no encontrada")
    return stage


def add_stage(db: DBSession, pipeline_id: int, data: PipelineStageCreate) -> PipelineStage:
    get_pipeline_or_404(db, pipeline_id)
    _check_stage_constraints(db, pipeline_id, data.is_won, data.is_lost)
    stage = PipelineStage(pipeline_id=pipeline_id, **data.model_dump())
    db.add(stage)
    db.commit()
    db.refresh(stage)
    return stage


def update_stage(
    db: DBSession, pipeline_id: int, stage_id: int, data: PipelineStageUpdate
) -> PipelineStage:
    stage = get_stage_or_404(db, pipeline_id, stage_id)
    patch = data.model_dump(exclude_unset=True)
    new_is_won = patch.get("is_won", stage.is_won)
    new_is_lost = patch.get("is_lost", stage.is_lost)
    _check_stage_constraints(db, pipeline_id, new_is_won, new_is_lost, exclude_id=stage_id)
    for field, value in patch.items():
        setattr(stage, field, value)
    db.commit()
    db.refresh(stage)
    return stage


def remove_stage(db: DBSession, pipeline_id: int, stage_id: int) -> None:
    stage = get_stage_or_404(db, pipeline_id, stage_id)
    if stage.is_won or stage.is_lost:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede borrar la etapa ganada ni la perdida: el tablero las necesita",
        )
    abiertos = (
        db.query(Deal)
        .filter(Deal.stage_id == stage_id, Deal.deleted_at.is_(None))
        .count()
    )
    if abiertos:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"La etapa tiene {abiertos} operación(es); movelas antes de borrarla",
        )
    db.delete(stage)
    db.commit()


# ---------------------------------------------------------------------------
# Deals
# ---------------------------------------------------------------------------

def list_deals(
    db: DBSession,
    pipeline_id: int | None = None,
    stage_id: int | None = None,
    assigned_to_user_id: int | None = None,
    is_closed: bool | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[int, list[Deal]]:
    q = db.query(Deal).filter(Deal.deleted_at.is_(None))
    if pipeline_id is not None:
        q = q.filter(Deal.pipeline_id == pipeline_id)
    if stage_id is not None:
        q = q.filter(Deal.stage_id == stage_id)
    if assigned_to_user_id is not None:
        q = q.filter(Deal.assigned_to_user_id == assigned_to_user_id)
    if is_closed is True:
        q = q.filter((Deal.is_won.is_(True)) | (Deal.is_lost.is_(True)))
    elif is_closed is False:
        q = q.filter(Deal.is_won.is_(False), Deal.is_lost.is_(False))
    total = q.count()
    items = (
        q.options(
            joinedload(Deal.propiedad),
            selectinload(Deal.parties).joinedload(DealParty.person),
        )
        .order_by(Deal.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return total, items


def get_deal_or_404(db: DBSession, deal_id: int) -> Deal:
    deal = db.query(Deal).filter(Deal.id == deal_id, Deal.deleted_at.is_(None)).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal no encontrado")
    return deal


def create_deal(db: DBSession, data: DealCreate, created_by_user_id: int) -> Deal:
    pipeline = get_pipeline_or_404(db, data.pipeline_id)
    _validate_stage_belongs_to_pipeline(db, data.stage_id, pipeline.id)

    deal = Deal(
        title=data.title,
        pipeline_id=data.pipeline_id,
        stage_id=data.stage_id,
        assigned_to_user_id=data.assigned_to_user_id,
        created_by_user_id=created_by_user_id,
        property_id=data.property_id,
        amount=data.amount,
        currency=data.currency,
        notes=data.notes,
    )
    db.add(deal)
    db.flush()
    historial.registrar_entrada(db, deal, data.stage_id, deal.stage_changed_at)

    for party_data in data.parties:
        db.add(DealParty(deal_id=deal.id, **party_data.model_dump()))

    # Crear directo en Ganada/Perdida es raro pero legal: aplica las mismas reglas.
    stage = db.query(PipelineStage).filter(PipelineStage.id == data.stage_id).first()
    deal.is_won = stage.is_won
    deal.is_lost = stage.is_lost
    if stage.is_won or stage.is_lost:
        deal.closed_at = datetime.now(UTC)
    _aplicar_cierre(db, deal, stage, estaba_cerrado=False)

    db.commit()
    db.refresh(deal)
    return deal


def update_deal(db: DBSession, deal_id: int, data: DealUpdate) -> Deal:
    deal = get_deal_or_404(db, deal_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(deal, field, value)
    deal.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(deal)
    return deal


def move_stage(db: DBSession, deal_id: int, data: DealMoveStage) -> Deal:
    deal = get_deal_or_404(db, deal_id)
    _validate_stage_belongs_to_pipeline(db, data.stage_id, deal.pipeline_id)
    stage = db.query(PipelineStage).filter(PipelineStage.id == data.stage_id).first()
    estaba_cerrado = deal.is_closed
    ahora = datetime.now(UTC)

    # Mover a la misma etapa no es una estadía nueva.
    if data.stage_id != deal.stage_id:
        historial.registrar_entrada(db, deal, data.stage_id, ahora)

    deal.stage_id = data.stage_id
    deal.stage_changed_at = ahora
    deal.is_won = stage.is_won
    deal.is_lost = stage.is_lost
    deal.closed_at = ahora if (stage.is_won or stage.is_lost) else None
    deal.updated_at = ahora

    # Antes del commit: si la propiedad rechaza el cierre (409), el deal no se mueve.
    _aplicar_cierre(db, deal, stage, estaba_cerrado)

    db.commit()
    db.refresh(deal)
    return deal


def soft_delete_deal(db: DBSession, deal_id: int) -> None:
    deal = get_deal_or_404(db, deal_id)
    deal.deleted_at = datetime.now(UTC)
    db.commit()


# ---------------------------------------------------------------------------
# DealParty (sub-recurso)
# ---------------------------------------------------------------------------

def list_parties(db: DBSession, deal_id: int) -> list[DealParty]:
    get_deal_or_404(db, deal_id)
    return db.query(DealParty).filter(DealParty.deal_id == deal_id).all()


def add_party(db: DBSession, deal_id: int, data: DealPartyCreate) -> DealParty:
    get_deal_or_404(db, deal_id)

    existing = (
        db.query(DealParty)
        .filter(
            DealParty.deal_id == deal_id,
            DealParty.person_id == data.person_id,
            DealParty.role == data.role,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Esta persona ya tiene ese rol en el deal",
        )

    party = DealParty(deal_id=deal_id, **data.model_dump())
    db.add(party)
    db.commit()
    db.refresh(party)
    return party


def remove_party(db: DBSession, deal_id: int, party_id: int) -> None:
    party = _get_party_or_404(db, deal_id, party_id)
    db.delete(party)
    db.commit()


# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------

def _get_party_or_404(db: DBSession, deal_id: int, party_id: int) -> DealParty:
    party = (
        db.query(DealParty)
        .filter(DealParty.id == party_id, DealParty.deal_id == deal_id)
        .first()
    )
    if not party:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parte no encontrada")
    return party


def _reserva_activa(db: DBSession, property_id: int) -> Reservation | None:
    return (
        db.query(Reservation)
        .filter(Reservation.property_id == property_id, Reservation.status == "activa")
        .first()
    )


def _aplicar_cierre(db: DBSession, deal: Deal, stage: PipelineStage, estaba_cerrado: bool) -> None:
    """Refleja el cambio de etapa en la propiedad, su reserva y la comisión.

    Sin commit: lo hace quien llama. Si algo rechaza el evento (409: la propiedad,
    el contrato de alquiler o una comisión cobrada), se revierte la sesión entera:
    el deal ya tiene la etapa nueva en memoria y sin rollback un lector de la misma
    sesión (los tests, o el `refresh` de un error posterior) la vería como aplicada.
    """
    try:
        _aplicar_cierre_sin_proteccion(db, deal, stage, estaba_cerrado)
    except HTTPException:
        db.rollback()
        raise


def _aplicar_cierre_sin_proteccion(
    db: DBSession, deal: Deal, stage: PipelineStage, estaba_cerrado: bool
) -> None:
    # La comisión y el contrato no dependen de que haya propiedad; la propiedad y
    # su reserva sí.
    con_propiedad = deal.property_id is not None
    if stage.is_won:
        if con_propiedad:
            aplicar_evento_de_operacion(db, deal.property_id, EventoOperacion.deal_ganado)
            reserva = _reserva_activa(db, deal.property_id)
            if reserva:
                reserva.status = "convertida"
                reserva.updated_at = datetime.now(UTC)
        comisiones.crear_por_defecto(db, deal)
    elif stage.is_lost:
        comisiones.al_reabrir(db, deal)
        if con_propiedad:
            reserva = _reserva_activa(db, deal.property_id)
            if reserva:
                reserva.status = "cancelada"
                reserva.updated_at = datetime.now(UTC)
            aplicar_evento_de_operacion(db, deal.property_id, EventoOperacion.deal_perdido)
    elif estaba_cerrado:
        comisiones.al_reabrir(db, deal)
        if deal.contrato is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El deal tiene un contrato de alquiler; rescindilo antes de reabrirlo",
            )
        if con_propiedad:
            aplicar_evento_de_operacion(db, deal.property_id, EventoOperacion.deal_reabierto)


def _validate_stage_belongs_to_pipeline(
    db: DBSession, stage_id: int, pipeline_id: int
) -> PipelineStage:
    stage = (
        db.query(PipelineStage)
        .filter(PipelineStage.id == stage_id, PipelineStage.pipeline_id == pipeline_id)
        .first()
    )
    if not stage:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La etapa no pertenece al pipeline indicado",
        )
    return stage


def _check_stage_constraints(
    db: DBSession,
    pipeline_id: int,
    is_won: bool,
    is_lost: bool,
    exclude_id: int | None = None,
) -> None:
    """Evita más de una etapa is_won y más de una is_lost por pipeline."""
    if is_won:
        q = db.query(PipelineStage).filter(
            PipelineStage.pipeline_id == pipeline_id, PipelineStage.is_won.is_(True)
        )
        if exclude_id:
            q = q.filter(PipelineStage.id != exclude_id)
        if q.first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe una etapa 'ganada' en este pipeline",
            )
    if is_lost:
        q = db.query(PipelineStage).filter(
            PipelineStage.pipeline_id == pipeline_id, PipelineStage.is_lost.is_(True)
        )
        if exclude_id:
            q = q.filter(PipelineStage.id != exclude_id)
        if q.first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe una etapa 'perdida' en este pipeline",
            )
