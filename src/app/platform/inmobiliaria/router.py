"""Router: GET/PUT /inmobiliaria y POST /inmobiliaria/logo."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.platform.auth.dependencies import get_current_user, require_role
from app.platform.inmobiliaria import service
from app.platform.inmobiliaria.schemas import InmobiliariaOut, InmobiliariaUpdate

router = APIRouter(prefix="/inmobiliaria", tags=["inmobiliaria"])

SOLO_ADMIN = [Depends(require_role("admin"))]


@router.get("", response_model=InmobiliariaOut)
def obtener(db: Session = Depends(get_db), _: object = Depends(get_current_user)):
    return InmobiliariaOut.desde(service.obtener(db))


@router.put("", response_model=InmobiliariaOut, dependencies=SOLO_ADMIN)
def actualizar(data: InmobiliariaUpdate, db: Session = Depends(get_db)):
    return InmobiliariaOut.desde(service.actualizar(db, data))


@router.post("/logo", response_model=InmobiliariaOut, dependencies=SOLO_ADMIN)
def subir_logo(archivo: UploadFile = File(...), db: Session = Depends(get_db)):
    return InmobiliariaOut.desde(service.subir_logo(db, archivo))
