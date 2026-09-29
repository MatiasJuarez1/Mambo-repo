"""Router busquedas: CRUD /busquedas, coincidencias e interesados. Solo staff."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.propiedades.service import obtener_propiedad
from app.platform.auth.dependencies import require_role
from app.platform.auth.models import User
from app.platform.busquedas import service
from app.platform.busquedas.models import Busqueda
from app.platform.busquedas.schemas import (
    BusquedaCreate,
    BusquedaOut,
    BusquedaUpdate,
    CoincidenciasOut,
)

router = APIRouter(prefix="/busquedas", tags=["busquedas"])

_staff = require_role("staff", "admin")
SOLO_STAFF = [Depends(_staff)]


def _out(db: Session, busqueda: Busqueda) -> BusquedaOut:
    out = BusquedaOut.model_validate(busqueda)
    out.coincidencias = service.contar_coincidencias(db, busqueda)
    return out


@router.get("", response_model=list[BusquedaOut], dependencies=SOLO_STAFF)
def listar_busquedas(person_id: int | None = Query(None), db: Session = Depends(get_db)):
    return [_out(db, b) for b in service.listar(db, person_id)]


# Antes de "/{busqueda_id}" para que "interesados" no se tome como id.
@router.get(
    "/interesados/{propiedad_id}", response_model=list[BusquedaOut], dependencies=SOLO_STAFF
)
def interesados(propiedad_id: int, db: Session = Depends(get_db)):
    """Búsquedas activas a las que les sirve esta propiedad: a quién ofrecérsela."""
    prop = obtener_propiedad(db, propiedad_id)
    return [_out(db, b) for b in service.interesados(db, prop)]


@router.get(
    "/{busqueda_id}/coincidencias", response_model=CoincidenciasOut, dependencies=SOLO_STAFF
)
def coincidencias(busqueda_id: int, db: Session = Depends(get_db)):
    return {"busqueda_id": busqueda_id, "propiedades": service.coincidencias(db, busqueda_id)}


@router.post("", response_model=BusquedaOut, status_code=status.HTTP_201_CREATED)
def crear_busqueda(
    data: BusquedaCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(_staff),
):
    return _out(db, service.crear(db, data, usuario.id))


@router.patch("/{busqueda_id}", response_model=BusquedaOut, dependencies=SOLO_STAFF)
def actualizar_busqueda(busqueda_id: int, data: BusquedaUpdate, db: Session = Depends(get_db)):
    return _out(db, service.actualizar(db, busqueda_id, data))


@router.delete("/{busqueda_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=SOLO_STAFF)
def borrar_busqueda(busqueda_id: int, db: Session = Depends(get_db)):
    service.borrar(db, busqueda_id)
