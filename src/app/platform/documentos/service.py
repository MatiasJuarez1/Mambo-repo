"""Documentos adjuntos: subir, listar y borrar, para cualquiera de las cuatro entidades."""

from __future__ import annotations

import uuid
from typing import NamedTuple

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.modules.propiedades.service import obtener_propiedad
from app.platform.alquileres.service import obtener_contrato
from app.platform.deals.service import get_deal_or_404
from app.platform.documentos.models import Documento
from app.platform.people.service import get_person_or_404
from app.storage import borrar_imagen, guardar_archivo

MAX_BYTES = 10 * 1024 * 1024
# Misma whitelist que los comprobantes de gastos. HEIC entra por las fotos de iPhone.
EXTENSIONES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/heic": ".heic",
    "image/heif": ".heif",
}
CARPETA = "documentos"


class Entidad(NamedTuple):
    """La entidad dueña ya resuelta: qué columna de `Documento` se carga y con qué id."""

    columna: str
    carpeta: str
    id: int


# (columna, carpeta en storage, getter del módulo dueño que levanta su propio 404)
_ENTIDADES = (
    ("propiedad_id", "propiedad", obtener_propiedad),
    ("persona_id", "persona", get_person_or_404),
    ("deal_id", "deal", get_deal_or_404),
    ("contrato_id", "contrato", obtener_contrato),
)


def resolver_entidad(
    db: Session,
    *,
    propiedad_id: int | None,
    persona_id: int | None,
    deal_id: int | None,
    contrato_id: int | None,
) -> Entidad:
    """Exige exactamente una FK y verifica que la entidad exista (con su soft delete)."""
    valores = {
        "propiedad_id": propiedad_id,
        "persona_id": persona_id,
        "deal_id": deal_id,
        "contrato_id": contrato_id,
    }
    cargadas = [columna for columna, valor in valores.items() if valor is not None]
    if len(cargadas) != 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Debe indicar exactamente una entidad: propiedad, persona, operación o contrato",
        )
    columna = cargadas[0]
    _, carpeta, obtener = next(e for e in _ENTIDADES if e[0] == columna)
    entidad_id = valores[columna]
    assert entidad_id is not None
    obtener(db, entidad_id)
    return Entidad(columna=columna, carpeta=carpeta, id=entidad_id)


def subir(
    db: Session, *, tipo: str, entidad: Entidad, archivo: UploadFile, user_id: int
) -> Documento:
    extension = EXTENSIONES.get(archivo.content_type or "")
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El documento debe ser PDF o imagen (JPG, PNG, HEIC)",
        )
    contenido = archivo.file.read()
    if len(contenido) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="El documento supera los 10 MB",
        )

    clave = f"{CARPETA}/{entidad.carpeta}/{entidad.id}/{uuid.uuid4().hex}{extension}"
    guardado = guardar_archivo(contenido, clave)

    doc = Documento(
        tipo=tipo,
        archivo_url=guardado.url,
        archivo_key=guardado.clave or clave,
        # Postgres rechaza más de 255 con un 500; un navegador nunca manda tanto, un script sí.
        nombre_original=(archivo.filename or f"documento{extension}")[:255],
        tamano_bytes=len(contenido),
        subido_por_user_id=user_id,
        **{entidad.columna: entidad.id},
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def listar(db: Session, entidad: Entidad) -> list[Documento]:
    columna = getattr(Documento, entidad.columna)
    return (
        db.query(Documento)
        .filter(columna == entidad.id)
        .order_by(Documento.created_at.desc(), Documento.id.desc())
        .all()
    )


def obtener(db: Session, documento_id: int) -> Documento:
    doc = db.get(Documento, documento_id)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado")
    return doc


def borrar(db: Session, documento_id: int) -> None:
    """El archivo primero, la fila después; un huérfano en el bucket es basura barata."""
    doc = obtener(db, documento_id)
    borrar_imagen(doc.archivo_url, doc.archivo_key)
    db.delete(doc)
    db.commit()
