"""Schemas Pydantic: AuditLogOut."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.platform.auth.schemas import UserBrief


class AuditLogOut(BaseModel):
    id: int
    entidad: str
    entidad_id: int
    accion: str
    cambios: dict[str, Any]
    usuario: UserBrief | None
    creado_en: datetime

    model_config = {"from_attributes": True}


class PaginatedAuditLog(BaseModel):
    total: int
    items: list[AuditLogOut]
