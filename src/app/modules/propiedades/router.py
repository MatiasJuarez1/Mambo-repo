from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.propiedades import service
from app.modules.propiedades.models import EstadoComercial, TipoOperacion, TipoPropiedad
from app.modules.propiedades.schemas import (
    CaracteristicaCreate,
    CaracteristicaResponse,
    MedioCreate,
    MedioResponse,
    PropiedadCreate,
    PropiedadListItem,
    PropiedadResponse,
    PropiedadUpdate,
)

router = APIRouter(prefix="/propiedades", tags=["Propiedades"])


@router.get("", response_model=List[PropiedadListItem])
def listar_propiedades(
    tipo_propiedad: Optional[TipoPropiedad] = None,
    tipo_operacion: Optional[TipoOperacion] = None,
    estado_comercial: Optional[EstadoComercial] = None,
    ciudad: Optional[str] = None,
    precio_min: Optional[Decimal] = None,
    precio_max: Optional[Decimal] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return service.listar_propiedades(
        db, tipo_propiedad, tipo_operacion, estado_comercial, ciudad, precio_min, precio_max, skip, limit
    )


@router.get("/{propiedad_id}", response_model=PropiedadResponse)
def obtener_propiedad(propiedad_id: int, db: Session = Depends(get_db)):
    return service.obtener_propiedad(db, propiedad_id)


@router.post("", response_model=PropiedadResponse, status_code=status.HTTP_201_CREATED)
def crear_propiedad(data: PropiedadCreate, db: Session = Depends(get_db)):
    return service.crear_propiedad(db, data)


@router.put("/{propiedad_id}", response_model=PropiedadResponse)
def actualizar_propiedad(propiedad_id: int, data: PropiedadUpdate, db: Session = Depends(get_db)):
    return service.actualizar_propiedad(db, propiedad_id, data)


@router.delete("/{propiedad_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_propiedad(propiedad_id: int, db: Session = Depends(get_db)):
    service.eliminar_propiedad(db, propiedad_id)


# ── Medios ────────────────────────────────────────────────────────────────────

@router.post(
    "/{propiedad_id}/medios",
    response_model=MedioResponse,
    status_code=status.HTTP_201_CREATED,
)
def agregar_medio(propiedad_id: int, data: MedioCreate, db: Session = Depends(get_db)):
    return service.agregar_medio(db, propiedad_id, data)


@router.post(
    "/{propiedad_id}/medios/upload",
    response_model=MedioResponse,
    status_code=status.HTTP_201_CREATED,
)
def subir_medio(
    propiedad_id: int,
    archivo: UploadFile = File(...),
    descripcion: Optional[str] = Form(None),
    es_principal: bool = Form(False),
    db: Session = Depends(get_db),
):
    """Sube un archivo de imagen (multipart) y lo asocia a la propiedad."""
    return service.subir_medio(db, propiedad_id, archivo, descripcion, es_principal)


@router.delete("/{propiedad_id}/medios/{medio_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_medio(propiedad_id: int, medio_id: int, db: Session = Depends(get_db)):
    service.eliminar_medio(db, propiedad_id, medio_id)


# ── Características ───────────────────────────────────────────────────────────

@router.post(
    "/{propiedad_id}/caracteristicas",
    response_model=CaracteristicaResponse,
    status_code=status.HTTP_201_CREATED,
)
def agregar_caracteristica(
    propiedad_id: int, data: CaracteristicaCreate, db: Session = Depends(get_db)
):
    return service.agregar_caracteristica(db, propiedad_id, data)


@router.delete(
    "/{propiedad_id}/caracteristicas/{caracteristica_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def eliminar_caracteristica(
    propiedad_id: int, caracteristica_id: int, db: Session = Depends(get_db)
):
    service.eliminar_caracteristica(db, propiedad_id, caracteristica_id)
