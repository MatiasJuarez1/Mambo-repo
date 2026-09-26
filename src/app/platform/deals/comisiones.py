"""Comisión de una operación ganada: alta por defecto al ganar, reapertura, edición completa.

Sin importar `service` (él importa este módulo): las funciones reciben el `Deal`.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.formato import redondear
from app.platform.auth.models import User
from app.platform.deals.models import Comision, ComisionReparto, Deal
from app.platform.deals.schemas import ComisionIn
from app.platform.inmobiliaria.models import Inmobiliaria
from app.platform.inmobiliaria.service import ID_UNICO

# Nombre del pipeline base → campo de la inmobiliaria con el % por defecto.
PCT_POR_PIPELINE = {"Venta": "honorarios_venta_pct", "Alquiler": "honorarios_alquiler_pct"}

CERO = Decimal("0.00")


def calcular_monto(monto_operacion: Decimal, pct: Decimal | None) -> Decimal:
    if pct is None:
        return CERO
    return redondear(monto_operacion * pct / Decimal(100))


def _pct_por_defecto(db: Session, deal: Deal) -> Decimal | None:
    campo = PCT_POR_PIPELINE.get(deal.pipeline.name)
    # `db.get` y no `obtener()`: este último commitea si la fila no existe, y acá
    # estamos en medio de la transacción del cambio de etapa.
    inmobiliaria = db.get(Inmobiliaria, ID_UNICO)
    if campo is None or inmobiliaria is None:
        return None
    return getattr(inmobiliaria, campo)


def crear_por_defecto(db: Session, deal: Deal) -> Comision:
    """Al ganar: monto del deal, % de la inmobiliaria según el pipeline, todo al
    asignado. Idempotente: si ya hay comisión no la pisa. Sin commit."""
    if deal.comision is not None:
        return deal.comision
    pct = _pct_por_defecto(db, deal)
    monto_operacion = deal.amount if deal.amount is not None else Decimal(0)
    comision = Comision(
        deal_id=deal.id,
        monto_operacion=monto_operacion,
        moneda=deal.currency,
        pct=pct,
        monto=calcular_monto(monto_operacion, pct),
    )
    if deal.assigned_to_user_id is not None:
        comision.reparto.append(ComisionReparto(user_id=deal.assigned_to_user_id, pct=Decimal(100)))
    deal.comision = comision
    db.add(comision)
    return comision


def al_reabrir(db: Session, deal: Deal) -> None:
    """El deal deja de estar ganado: la comisión se va, salvo que ya se haya cobrado. Sin commit."""
    comision = deal.comision
    if comision is None:
        return
    if comision.cobrada:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La comisión ya fue cobrada; desmarcala antes de reabrir la operación",
        )
    db.delete(comision)
    deal.comision = None


def guardar(db: Session, deal: Deal, data: ComisionIn) -> Comision:
    """Crea o reemplaza la comisión del deal, reparto incluido. Solo deals ganados. Commit."""
    if not deal.is_won:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="La operación no está ganada"
        )
    ids = [r.user_id for r in data.reparto]
    if ids:
        existentes = {
            u.id
            for u in db.query(User.id).filter(User.id.in_(ids), User.deleted_at.is_(None)).all()
        }
        for user_id in ids:
            if user_id not in existentes:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Usuario {user_id} no encontrado",
                )

    comision = deal.comision or Comision(deal_id=deal.id, moneda=deal.currency)
    comision.monto_operacion = data.monto_operacion
    comision.pct = data.pct
    comision.monto = (
        data.monto if data.monto is not None else calcular_monto(data.monto_operacion, data.pct)
    )
    comision.cobrada = data.cobrada
    comision.fecha_cobro = (data.fecha_cobro or date.today()) if data.cobrada else None
    comision.notas = data.notas
    comision.updated_at = datetime.now(UTC)
    db.add(comision)
    db.flush()

    # Borrar antes de insertar: el unit of work inserta antes de borrar y el mismo
    # agente repetido entre el reparto viejo y el nuevo chocaría con el unique.
    db.query(ComisionReparto).filter(ComisionReparto.comision_id == comision.id).delete()
    db.flush()
    for r in data.reparto:
        db.add(ComisionReparto(comision_id=comision.id, user_id=r.user_id, pct=r.pct))
    db.commit()
    db.expire(comision, ["reparto"])
    db.refresh(comision)
    return comision
