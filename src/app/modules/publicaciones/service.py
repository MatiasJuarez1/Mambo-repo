from datetime import datetime
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.modules.publicaciones.models import EstadoPublicacion, Publicacion
from app.modules.publicaciones.schemas import PublicacionCreate, PublicacionUpdate


def listar_publicaciones(
    db: Session,
    estado: Optional[EstadoPublicacion] = None,
    propiedad_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 20,
) -> List[Publicacion]:
    query = db.query(Publicacion).filter(Publicacion.eliminado_en.is_(None))

    if estado:
        query = query.filter(Publicacion.estado == estado)
    if propiedad_id:
        query = query.filter(Publicacion.propiedad_id == propiedad_id)

    return query.order_by(Publicacion.publicada_en.desc()).offset(skip).limit(limit).all()


def listar_publicaciones_activas(
    db: Session,
    propiedad_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 20,
) -> List[Publicacion]:
    """Endpoint público: solo devuelve publicaciones activas."""
    return listar_publicaciones(db, EstadoPublicacion.activa, propiedad_id, skip, limit)


def obtener_publicacion(db: Session, publicacion_id: int) -> Publicacion:
    pub = db.query(Publicacion).filter(
        Publicacion.id == publicacion_id,
        Publicacion.eliminado_en.is_(None),
    ).first()
    if not pub:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Publicación no encontrada"
        )
    return pub


def crear_publicacion(db: Session, data: PublicacionCreate) -> Publicacion:
    pub = Publicacion(
        propiedad_id=data.propiedad_id,
        titulo=data.titulo,
        descripcion=data.descripcion,
        estado=data.estado,
        publicada_en=datetime.utcnow() if data.estado == EstadoPublicacion.activa else None,
    )
    db.add(pub)
    db.commit()
    db.refresh(pub)
    return pub


def actualizar_publicacion(
    db: Session, publicacion_id: int, data: PublicacionUpdate
) -> Publicacion:
    pub = obtener_publicacion(db, publicacion_id)

    campos = data.model_dump(exclude_unset=True)
    for field, value in campos.items():
        setattr(pub, field, value)

    # Registrar fecha de publicación cuando se activa por primera vez
    if data.estado == EstadoPublicacion.activa and pub.publicada_en is None:
        pub.publicada_en = datetime.utcnow()

    db.commit()
    db.refresh(pub)
    return pub


def eliminar_publicacion(db: Session, publicacion_id: int) -> None:
    pub = obtener_publicacion(db, publicacion_id)
    pub.eliminado_en = datetime.utcnow()
    pub.estado = EstadoPublicacion.eliminada
    db.commit()
