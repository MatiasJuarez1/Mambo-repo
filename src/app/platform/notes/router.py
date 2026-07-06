"""Router notes: GET/POST /notes filtrado por entidad."""
from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/notes", tags=["notes"])

# TODO: definir endpoints de notas por entidad
