from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.publicaciones import service
from app.modules.publicaciones.models import EstadoPublicacion
from app.modules.publicaciones.schemas import (
    PublicacionCreate,
    PublicacionListItem,
    PublicacionResponse,
    PublicacionUpdate,
)

router = APIRouter(prefix="/publicaciones", tags=["Publicaciones"])


@router.get("/publicas", response_model=List[PublicacionListItem])
def listar_publicaciones_activas(
    propiedad_id: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Listado público: solo publicaciones activas."""
    return service.listar_publicaciones_activas(db, propiedad_id, skip, limit)


@router.get("", response_model=List[PublicacionListItem])
def listar_publicaciones(
    estado: Optional[EstadoPublicacion] = None,
    propiedad_id: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    return service.listar_publicaciones(db, estado, propiedad_id, skip, limit)


@router.get("/{publicacion_id}", response_model=PublicacionResponse)
def obtener_publicacion(publicacion_id: int, db: Session = Depends(get_db)):
    return service.obtener_publicacion(db, publicacion_id)


@router.post("", response_model=PublicacionResponse, status_code=status.HTTP_201_CREATED)
def crear_publicacion(data: PublicacionCreate, db: Session = Depends(get_db)):
    return service.crear_publicacion(db, data)


@router.put("/{publicacion_id}", response_model=PublicacionResponse)
def actualizar_publicacion(
    publicacion_id: int, data: PublicacionUpdate, db: Session = Depends(get_db)
):
    return service.actualizar_publicacion(db, publicacion_id, data)


@router.delete("/{publicacion_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_publicacion(publicacion_id: int, db: Session = Depends(get_db)):
    service.eliminar_publicacion(db, publicacion_id)
