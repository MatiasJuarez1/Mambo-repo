"""Router documentos: alta multipart, listado por entidad y borrado. Solo staff."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.platform.auth.dependencies import get_current_user, require_role
from app.platform.auth.models import User
from app.platform.documentos import service
from app.platform.documentos.schemas import DocumentoOut, TipoDocumento

router = APIRouter(prefix="/documentos", tags=["documentos"])

# Por endpoint y no en el APIRouter, siguiendo el criterio del resto de los módulos.
SOLO_STAFF = [Depends(require_role("staff", "admin"))]


@router.post(
    "", response_model=DocumentoOut, status_code=status.HTTP_201_CREATED, dependencies=SOLO_STAFF
)
def subir_documento(
    tipo: Annotated[TipoDocumento, Form()],
    archivo: Annotated[UploadFile, File()],
    propiedad_id: Annotated[int | None, Form()] = None,
    persona_id: Annotated[int | None, Form()] = None,
    deal_id: Annotated[int | None, Form()] = None,
    contrato_id: Annotated[int | None, Form()] = None,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
) -> DocumentoOut:
    entidad = service.resolver_entidad(
        db,
        propiedad_id=propiedad_id,
        persona_id=persona_id,
        deal_id=deal_id,
        contrato_id=contrato_id,
    )
    doc = service.subir(db, tipo=tipo, entidad=entidad, archivo=archivo, user_id=usuario.id)
    return DocumentoOut.model_validate(doc)


@router.get("", response_model=list[DocumentoOut], dependencies=SOLO_STAFF)
def listar_documentos(
    propiedad_id: int | None = Query(default=None),
    persona_id: int | None = Query(default=None),
    deal_id: int | None = Query(default=None),
    contrato_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[DocumentoOut]:
    entidad = service.resolver_entidad(
        db,
        propiedad_id=propiedad_id,
        persona_id=persona_id,
        deal_id=deal_id,
        contrato_id=contrato_id,
    )
    return [DocumentoOut.model_validate(d) for d in service.listar(db, entidad)]


@router.delete("/{documento_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=SOLO_STAFF)
def borrar_documento(documento_id: int, db: Session = Depends(get_db)) -> None:
    service.borrar(db, documento_id)
