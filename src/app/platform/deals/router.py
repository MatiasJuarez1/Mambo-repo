"""Router deals: /pipelines, /deals, PATCH /deals/{id}/stage, /deals/{id}/parties."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.platform.auth.dependencies import get_current_user, require_role
from app.platform.auth.models import User
from app.platform.deals import service
from app.platform.deals.schemas import (
    DealCreate,
    DealListOut,
    DealMoveStage,
    DealOut,
    DealPartyCreate,
    DealPartyOut,
    DealUpdate,
    PaginatedDeals,
    PipelineCreate,
    PipelineListOut,
    PipelineOut,
    PipelineStageCreate,
    PipelineStageOut,
    PipelineStageUpdate,
    PipelineUpdate,
)

router = APIRouter(tags=["deals"])

_staff = Depends(require_role("staff", "admin"))
_admin = Depends(require_role("admin"))


# ---------------------------------------------------------------------------
# Pipelines
# ---------------------------------------------------------------------------

@router.get("/pipelines", response_model=list[PipelineListOut])
def list_pipelines(
    active_only: bool = Query(default=False),
    db: DBSession = Depends(get_db),
    _: object = Depends(get_current_user),
) -> list[PipelineListOut]:
    pipelines = service.list_pipelines(db, active_only=active_only)
    return [
        PipelineListOut(
            id=p.id,
            name=p.name,
            is_active=p.is_active,
            stage_count=len(p.stages),
        )
        for p in pipelines
    ]


@router.get("/pipelines/{pipeline_id}", response_model=PipelineOut)
def get_pipeline(
    pipeline_id: int,
    db: DBSession = Depends(get_db),
    _: object = Depends(get_current_user),
) -> PipelineOut:
    pipeline = service.get_pipeline_or_404(db, pipeline_id)
    return PipelineOut.model_validate(pipeline)


@router.post(
    "/pipelines",
    response_model=PipelineOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_admin],
)
def create_pipeline(
    body: PipelineCreate,
    db: DBSession = Depends(get_db),
) -> PipelineOut:
    pipeline = service.create_pipeline(db, body)
    return PipelineOut.model_validate(pipeline)


@router.patch("/pipelines/{pipeline_id}", response_model=PipelineOut, dependencies=[_admin])
def update_pipeline(
    pipeline_id: int,
    body: PipelineUpdate,
    db: DBSession = Depends(get_db),
) -> PipelineOut:
    pipeline = service.update_pipeline(db, pipeline_id, body)
    return PipelineOut.model_validate(pipeline)


@router.delete(
    "/pipelines/{pipeline_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_admin],
)
def delete_pipeline(
    pipeline_id: int,
    db: DBSession = Depends(get_db),
) -> None:
    service.delete_pipeline(db, pipeline_id)


# ---------------------------------------------------------------------------
# Pipeline Stages (sub-recurso)
# ---------------------------------------------------------------------------

@router.post(
    "/pipelines/{pipeline_id}/stages",
    response_model=PipelineStageOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_admin],
)
def add_stage(
    pipeline_id: int,
    body: PipelineStageCreate,
    db: DBSession = Depends(get_db),
) -> PipelineStageOut:
    stage = service.add_stage(db, pipeline_id, body)
    return PipelineStageOut.model_validate(stage)


@router.patch(
    "/pipelines/{pipeline_id}/stages/{stage_id}",
    response_model=PipelineStageOut,
    dependencies=[_admin],
)
def update_stage(
    pipeline_id: int,
    stage_id: int,
    body: PipelineStageUpdate,
    db: DBSession = Depends(get_db),
) -> PipelineStageOut:
    stage = service.update_stage(db, pipeline_id, stage_id, body)
    return PipelineStageOut.model_validate(stage)


@router.delete(
    "/pipelines/{pipeline_id}/stages/{stage_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_admin],
)
def remove_stage(
    pipeline_id: int,
    stage_id: int,
    db: DBSession = Depends(get_db),
) -> None:
    service.remove_stage(db, pipeline_id, stage_id)


# ---------------------------------------------------------------------------
# Deals
# ---------------------------------------------------------------------------

@router.get("/deals", response_model=PaginatedDeals)
def list_deals(
    pipeline_id: int | None = Query(default=None),
    stage_id: int | None = Query(default=None),
    assigned_to_user_id: int | None = Query(default=None),
    is_closed: bool | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: DBSession = Depends(get_db),
    _: object = Depends(get_current_user),
) -> PaginatedDeals:
    total, items = service.list_deals(
        db,
        pipeline_id=pipeline_id,
        stage_id=stage_id,
        assigned_to_user_id=assigned_to_user_id,
        is_closed=is_closed,
        skip=skip,
        limit=limit,
    )
    return PaginatedDeals(total=total, items=[DealListOut.model_validate(d) for d in items])


@router.get("/deals/{deal_id}", response_model=DealOut)
def get_deal(
    deal_id: int,
    db: DBSession = Depends(get_db),
    _: object = Depends(get_current_user),
) -> DealOut:
    deal = service.get_deal_or_404(db, deal_id)
    return DealOut.model_validate(deal)


@router.post(
    "/deals",
    response_model=DealOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_staff],
)
def create_deal(
    body: DealCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DealOut:
    deal = service.create_deal(db, body, created_by_user_id=current_user.id)
    return DealOut.model_validate(deal)


@router.patch("/deals/{deal_id}", response_model=DealOut, dependencies=[_staff])
def update_deal(
    deal_id: int,
    body: DealUpdate,
    db: DBSession = Depends(get_db),
) -> DealOut:
    deal = service.update_deal(db, deal_id, body)
    return DealOut.model_validate(deal)


@router.patch("/deals/{deal_id}/stage", response_model=DealOut, dependencies=[_staff])
def move_stage(
    deal_id: int,
    body: DealMoveStage,
    db: DBSession = Depends(get_db),
) -> DealOut:
    deal = service.move_stage(db, deal_id, body)
    return DealOut.model_validate(deal)


@router.delete("/deals/{deal_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[_staff])
def delete_deal(
    deal_id: int,
    db: DBSession = Depends(get_db),
) -> None:
    service.soft_delete_deal(db, deal_id)


# ---------------------------------------------------------------------------
# Deal Parties (sub-recurso)
# ---------------------------------------------------------------------------

@router.get("/deals/{deal_id}/parties", response_model=list[DealPartyOut])
def list_parties(
    deal_id: int,
    db: DBSession = Depends(get_db),
    _: object = Depends(get_current_user),
) -> list[DealPartyOut]:
    parties = service.list_parties(db, deal_id)
    return [DealPartyOut.model_validate(p) for p in parties]


@router.post(
    "/deals/{deal_id}/parties",
    response_model=DealPartyOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_staff],
)
def add_party(
    deal_id: int,
    body: DealPartyCreate,
    db: DBSession = Depends(get_db),
) -> DealPartyOut:
    party = service.add_party(db, deal_id, body)
    return DealPartyOut.model_validate(party)


@router.delete(
    "/deals/{deal_id}/parties/{party_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_staff],
)
def remove_party(
    deal_id: int,
    party_id: int,
    db: DBSession = Depends(get_db),
) -> None:
    service.remove_party(db, deal_id, party_id)
