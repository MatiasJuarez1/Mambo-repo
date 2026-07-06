"""Router audit: GET /audit-log (solo staff)."""
from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/audit-log", tags=["audit"])

# TODO: definir endpoint de consulta del log de auditoría
