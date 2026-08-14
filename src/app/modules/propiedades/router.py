from decimal import Decimal

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
from app.platform.auth.dependencies import require_role

router = APIRouter(prefix="/propiedades", tags=["Propiedades"])

# Toda operación que modifica el inventario exige sesión con rol `staff` o `admin`.
# Va endpoint por endpoint y no en el `APIRouter` porque los GET tienen que seguir
# siendo públicos y anónimos: el sitio los consume sin login.
SOLO_STAFF = [Depends(require_role("staff", "admin"))]


@router.get("", response_model=list[PropiedadListItem])
def listar_propiedades(
    tipo_propiedad: TipoPropiedad | None = None,
    tipo_operacion: TipoOperacion | None = None,
    estado_comercial: EstadoComercial | None = None,
    estados: list[EstadoComercial] | None = Query(
        None,
        description=(
            "Varios estados a la vez, repitiendo el parámetro "
            "(?estados=disponible&estados=cerrada). Lo usa el sitio público para "
            "mostrar las operaciones cerradas junto a las disponibles."
        ),
    ),
    ciudad: str | None = None,
    precio_min: Decimal | None = None,
    precio_max: Decimal | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return service.listar_propiedades(
        db,
        tipo_propiedad=tipo_propiedad,
        tipo_operacion=tipo_operacion,
        estado_comercial=estado_comercial,
        ciudad=ciudad,
        precio_min=precio_min,
        precio_max=precio_max,
        skip=skip,
        limit=limit,
        estados=estados,
    )


# IMPORTANTE: esta ruta debe declararse ANTES de "/{propiedad_id}". FastAPI resuelve
# las rutas en orden de declaración: si quedara después, "ciudades" se tomaría como
# valor de {propiedad_id}, fallaría al convertirlo a int y devolvería 422. No moverla.
@router.get("/ciudades", response_model=list[str])
def listar_ciudades(db: Session = Depends(get_db)):
    """Ciudades con propiedades disponibles, para el desplegable de zonas."""
    return service.listar_ciudades(db)


@router.get("/{propiedad_id}", response_model=PropiedadResponse)
def obtener_propiedad(propiedad_id: int, db: Session = Depends(get_db)):
    return service.obtener_propiedad(db, propiedad_id)


@router.post(
    "",
    response_model=PropiedadResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=SOLO_STAFF,
)
def crear_propiedad(data: PropiedadCreate, db: Session = Depends(get_db)):
    return service.crear_propiedad(db, data)


@router.put("/{propiedad_id}", response_model=PropiedadResponse, dependencies=SOLO_STAFF)
def actualizar_propiedad(propiedad_id: int, data: PropiedadUpdate, db: Session = Depends(get_db)):
    return service.actualizar_propiedad(db, propiedad_id, data)


@router.delete(
    "/{propiedad_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=SOLO_STAFF
)
def eliminar_propiedad(propiedad_id: int, db: Session = Depends(get_db)):
    service.eliminar_propiedad(db, propiedad_id)


# ── Medios ────────────────────────────────────────────────────────────────────

@router.post(
    "/{propiedad_id}/medios",
    response_model=MedioResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=SOLO_STAFF,
)
def agregar_medio(propiedad_id: int, data: MedioCreate, db: Session = Depends(get_db)):
    return service.agregar_medio(db, propiedad_id, data)


@router.post(
    "/{propiedad_id}/medios/upload",
    response_model=MedioResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=SOLO_STAFF,
)
def subir_medio(
    propiedad_id: int,
    archivo: UploadFile = File(...),
    descripcion: str | None = Form(None),
    es_principal: bool = Form(False),
    db: Session = Depends(get_db),
):
    """Sube un archivo de imagen (multipart) y lo asocia a la propiedad."""
    return service.subir_medio(db, propiedad_id, archivo, descripcion, es_principal)


@router.delete(
    "/{propiedad_id}/medios/{medio_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=SOLO_STAFF,
)
def eliminar_medio(propiedad_id: int, medio_id: int, db: Session = Depends(get_db)):
    service.eliminar_medio(db, propiedad_id, medio_id)


# ── Características ───────────────────────────────────────────────────────────

@router.post(
    "/{propiedad_id}/caracteristicas",
    response_model=CaracteristicaResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=SOLO_STAFF,
)
def agregar_caracteristica(
    propiedad_id: int, data: CaracteristicaCreate, db: Session = Depends(get_db)
):
    return service.agregar_caracteristica(db, propiedad_id, data)


@router.delete(
    "/{propiedad_id}/caracteristicas/{caracteristica_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=SOLO_STAFF,
)
def eliminar_caracteristica(
    propiedad_id: int, caracteristica_id: int, db: Session = Depends(get_db)
):
    service.eliminar_caracteristica(db, propiedad_id, caracteristica_id)
