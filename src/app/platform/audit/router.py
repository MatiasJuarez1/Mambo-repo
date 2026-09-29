"""Router audit: GET /audit-log (solo admin)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.platform.audit import service
from app.platform.audit.schemas import PaginatedAuditLog
from app.platform.auth.dependencies import require_role

router = APIRouter(prefix="/audit-log", tags=["audit"])

# Solo admin: el historial muestra quién tocó cada precio y cada cobro, y es la
# herramienta para revisar el trabajo del resto del equipo.
SOLO_ADMIN = [Depends(require_role("admin"))]


@router.get("", response_model=PaginatedAuditLog, dependencies=SOLO_ADMIN)
def listar_cambios(
    entidad: str | None = None,
    entidad_id: int | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    total, items = service.listar(
        db, entidad=entidad, entidad_id=entidad_id, skip=skip, limit=limit
    )
    return {"total": total, "items": items}
