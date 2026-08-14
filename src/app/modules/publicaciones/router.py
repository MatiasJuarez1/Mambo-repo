
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
from app.platform.auth.dependencies import require_role

router = APIRouter(prefix="/publicaciones", tags=["Publicaciones"])

# Crear, editar o dar de baja una publicación exige sesión con rol `staff` o `admin`.
# Los GET quedan abiertos: son los que alimentan el sitio público, que es anónimo.
SOLO_STAFF = [Depends(require_role("staff", "admin"))]


@router.get("/publicas", response_model=list[PublicacionListItem])
def listar_publicaciones_activas(
    propiedad_id: int | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Listado público: solo publicaciones activas."""
    return service.listar_publicaciones_activas(db, propiedad_id, skip, limit)


# Este listado y el de abajo NO filtran por estado: devuelven también las pausadas,
# que son borradores y avisos retirados de circulación. Por eso exigen sesión, a
# diferencia de `/publicas`, que es el que consume el visitante y solo trae activas.
# Sin la restricción, cualquiera podía listar el material no publicado y enumerarlo
# por id.
@router.get("", response_model=list[PublicacionListItem], dependencies=SOLO_STAFF)
def listar_publicaciones(
    estado: EstadoPublicacion | None = None,
    propiedad_id: int | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    return service.listar_publicaciones(db, estado, propiedad_id, skip, limit)


@router.get("/{publicacion_id}", response_model=PublicacionResponse, dependencies=SOLO_STAFF)
def obtener_publicacion(publicacion_id: int, db: Session = Depends(get_db)):
    return service.obtener_publicacion(db, publicacion_id)


@router.post(
    "",
    response_model=PublicacionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=SOLO_STAFF,
)
def crear_publicacion(data: PublicacionCreate, db: Session = Depends(get_db)):
    return service.crear_publicacion(db, data)


@router.put("/{publicacion_id}", response_model=PublicacionResponse, dependencies=SOLO_STAFF)
def actualizar_publicacion(
    publicacion_id: int, data: PublicacionUpdate, db: Session = Depends(get_db)
):
    return service.actualizar_publicacion(db, publicacion_id, data)


@router.delete(
    "/{publicacion_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=SOLO_STAFF
)
def eliminar_publicacion(publicacion_id: int, db: Session = Depends(get_db)):
    service.eliminar_publicacion(db, publicacion_id)
