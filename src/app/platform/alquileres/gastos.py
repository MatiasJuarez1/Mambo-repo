"""Gastos por contrato (expensas, reparaciones, impuestos) que la liquidación
le descuenta al propietario. Editables hasta que entran en una liquidación."""

from __future__ import annotations

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.platform.alquileres.cobros import conflicto
from app.platform.alquileres.models import Gasto
from app.platform.alquileres.schemas import GastoActualizar, GastoCrear
from app.platform.alquileres.service import obtener_contrato
from app.storage import borrar_imagen, guardar_archivo

MAX_BYTES_COMPROBANTE = 10 * 1024 * 1024
# Extensión por tipo declarado. HEIC entra porque las fotos de iPhone llegan así.
EXTENSIONES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/heic": ".heic",
    "image/heif": ".heif",
}


def obtener_gasto(db: Session, contrato_id: int, gasto_id: int) -> Gasto:
    gasto = db.get(Gasto, gasto_id)
    if gasto is None or gasto.contrato_id != contrato_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gasto no encontrado")
    return gasto


def _editable_o_409(gasto: Gasto) -> None:
    if gasto.liquidacion_id is not None:
        raise conflicto(f"El gasto ya fue liquidado en la N° {gasto.liquidacion.numero_formateado}")


def listar(db: Session, contrato_id: int) -> list[Gasto]:
    return obtener_contrato(db, contrato_id).gastos


def crear(db: Session, contrato_id: int, datos: GastoCrear, user_id: int) -> Gasto:
    """Sin restricción por estado del contrato: la última expensa puede llegar
    después de finalizado."""
    contrato = obtener_contrato(db, contrato_id)
    gasto = Gasto(**datos.model_dump(), created_by_user_id=user_id)
    contrato.gastos.append(gasto)
    db.commit()
    db.refresh(gasto)
    return gasto


def actualizar(db: Session, contrato_id: int, gasto_id: int, datos: GastoActualizar) -> Gasto:
    gasto = obtener_gasto(db, contrato_id, gasto_id)
    _editable_o_409(gasto)
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(gasto, campo, valor)
    db.commit()
    db.refresh(gasto)
    return gasto


def borrar(db: Session, contrato_id: int, gasto_id: int) -> None:
    gasto = obtener_gasto(db, contrato_id, gasto_id)
    _editable_o_409(gasto)
    if gasto.comprobante_key:
        borrar_imagen(gasto.comprobante_url, gasto.comprobante_key)
    db.delete(gasto)
    db.commit()


def subir_comprobante(db: Session, contrato_id: int, gasto_id: int, archivo: UploadFile) -> Gasto:
    gasto = obtener_gasto(db, contrato_id, gasto_id)
    _editable_o_409(gasto)
    extension = EXTENSIONES.get(archivo.content_type or "")
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El comprobante debe ser PDF o imagen (JPG, PNG, HEIC)",
        )
    contenido = archivo.file.read()
    if len(contenido) > MAX_BYTES_COMPROBANTE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="El comprobante supera los 10 MB",
        )
    guardado = guardar_archivo(contenido, f"gastos/{contrato_id}/{gasto_id}{extension}")
    if gasto.comprobante_key and gasto.comprobante_key != guardado.clave:
        borrar_imagen(gasto.comprobante_url, gasto.comprobante_key)
    gasto.comprobante_url = guardado.url
    gasto.comprobante_key = guardado.clave
    db.commit()
    db.refresh(gasto)
    return gasto


def quitar_comprobante(db: Session, contrato_id: int, gasto_id: int) -> Gasto:
    gasto = obtener_gasto(db, contrato_id, gasto_id)
    _editable_o_409(gasto)
    if gasto.comprobante_key:
        borrar_imagen(gasto.comprobante_url, gasto.comprobante_key)
    gasto.comprobante_url = None
    gasto.comprobante_key = None
    db.commit()
    db.refresh(gasto)
    return gasto
