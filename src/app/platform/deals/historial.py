"""Historial de etapas: una fila por estadía de un deal en una etapa (Bloque 4).

Es lo único que permite calcular tiempo promedio por etapa y conversión: el deal
solo recuerda cuándo entró a la etapa actual.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.platform.deals.models import Deal, DealStageHistory


def registrar_entrada(db: Session, deal: Deal, stage_id: int, ahora: datetime) -> None:
    """Cierra la estadía abierta del deal (si la hay) y abre una en `stage_id`. Sin commit."""
    abierta = (
        db.query(DealStageHistory)
        .filter(DealStageHistory.deal_id == deal.id, DealStageHistory.left_at.is_(None))
        .first()
    )
    if abierta is not None:
        abierta.left_at = ahora
    db.add(DealStageHistory(deal_id=deal.id, stage_id=stage_id, entered_at=ahora))
