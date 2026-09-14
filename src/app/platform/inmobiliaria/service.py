"""Configuración de la inmobiliaria: siempre la fila id=1."""

from __future__ import annotations

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.modules.propiedades.service import MAX_BYTES_IMAGEN, procesar_imagen
from app.platform.inmobiliaria.models import Inmobiliaria
from app.platform.inmobiliaria.schemas import InmobiliariaUpdate
from app.storage import borrar_imagen, guardar_logo

ID_UNICO = 1
NOMBRE_POR_DEFECTO = "Mambo Groups"


def obtener(db: Session) -> Inmobiliaria:
    """La migración 0004 crea la fila; si no está (base de test, entorno nuevo) se crea."""
    fila = db.get(Inmobiliaria, ID_UNICO)
    if fila is None:
        fila = Inmobiliaria(id=ID_UNICO, nombre=NOMBRE_POR_DEFECTO)
        db.add(fila)
        db.commit()
        db.refresh(fila)
    return fila


def actualizar(db: Session, data: InmobiliariaUpdate) -> Inmobiliaria:
    fila = obtener(db)
    for campo, valor in data.model_dump(exclude_unset=True).items():
        setattr(fila, campo, valor)
    db.commit()
    db.refresh(fila)
    return fila


def subir_logo(db: Session, archivo: UploadFile) -> Inmobiliaria:
    fila = obtener(db)
    contenido = archivo.file.read()
    if len(contenido) > MAX_BYTES_IMAGEN:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="El logo supera el máximo de 8 MB.",
        )
    contenido, extension = procesar_imagen(contenido)
    guardado = guardar_logo(contenido, extension)
    # El logo no tiene variantes (no hay `srcset`), así que no se pasan anchos a borrar.
    if fila.logo_storage_key:
        borrar_imagen(fila.logo_url, fila.logo_storage_key)
    fila.logo_url = guardado.url
    fila.logo_storage_key = guardado.clave
    db.commit()
    db.refresh(fila)
    return fila
