"""Router consultas: el único alta del CRM que es pública y anónima.

La usa el formulario "Solicitar visita" del sitio. Queda bajo `/api/v1` para que
el proxy de Vercel la alcance (solo reenvía `/api/*` y `/auth/*`).
"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.platform.consultas import service
from app.platform.consultas.schemas import ConsultaCreate, ConsultaRecibida

router = APIRouter(prefix="/consultas", tags=["consultas"])

_RECIBIDA = ConsultaRecibida(mensaje="¡Gracias! Recibimos tu consulta y te vamos a contactar.")


def _ip_del_cliente(request: Request) -> str:
    """Detrás de Vercel y Render la IP real llega en `X-Forwarded-For` (la primera
    de la lista). Se puede falsificar, pero para frenar spam alcanza."""
    reenviada = request.headers.get("x-forwarded-for")
    if reenviada:
        return reenviada.split(",")[0].strip()
    return request.client.host if request.client else "desconocida"


@router.post("", response_model=ConsultaRecibida, status_code=status.HTTP_201_CREATED)
def crear_consulta(
    data: ConsultaCreate,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    # Un bot llenó el campo oculto: se le responde igual que a una persona para
    # que no aprenda a esquivar la trampa, pero no se guarda nada.
    if data.sitio_web:
        return _RECIBIDA

    if not service.limite_consultas.permitir(_ip_del_cliente(request)):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Recibimos varias consultas seguidas. Probá de nuevo en unos minutos.",
        )

    actividad, es_nueva = service.crear_consulta(db, data)
    aviso = service.armar_aviso(db, actividad, es_nueva)
    if aviso is not None:
        background.add_task(service.enviar_aviso, *aviso)
    return _RECIBIDA
