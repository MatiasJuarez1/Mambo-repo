"""Lógica de negocio: registrar y consultar audit_log.

El registro no lo llama ningún servicio: se engancha a los flush de SQLAlchemy y
mira qué entidades de `AUDITADAS` se crearon, cambiaron o borraron. Así cubre
todos los caminos que las tocan (endpoints de hoy y de mañana, scripts) sin que
nadie tenga que acordarse de llamarlo.

Quién hizo el cambio sale de `session.info`, donde lo deja
`get_current_user` en la misma sesión que después usa el endpoint (FastAPI
resuelve `get_db` una sola vez por request). Una variable de contexto no sirve:
las dependencias síncronas corren en otro hilo y lo que setean no vuelve.
"""

from __future__ import annotations

import enum
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session, joinedload

from app.modules.propiedades.models import Propiedad
from app.platform.alquileres.models import Cobro, Contrato, Liquidacion, Pago
from app.platform.audit.models import AuditLog
from app.platform.auth.dependencies import CLAVE_USUARIO_AUDITORIA
from app.platform.deals.models import Comision

_CLAVE_PENDIENTES = "_audit_pendientes"

# Lo que mueve plata o cambia lo que se publica: donde un error, o un cambio que
# nadie reconoce, cuesta caro. El nombre es el que se guarda en `entidad`.
AUDITADAS: dict[type, str] = {
    Propiedad: "propiedad",
    Contrato: "contrato",
    Cobro: "cobro",
    Pago: "pago",
    Liquidacion: "liquidacion",
    Comision: "comision",
}

# Marcas de tiempo que cambian solas en cada edición: registrarlas sería ruido.
_IGNORADAS = {"actualizado_en", "updated_at", "creado_en", "created_at"}
_BAJA = {"eliminado_en", "deleted_at"}


def _valor(v: Any) -> Any:
    """Llevar un valor de columna a algo que entre en una columna JSON."""
    if isinstance(v, enum.Enum):
        return v.value
    if isinstance(v, Decimal):
        # Normalizado: el mismo precio llega "100000.00" leído de la base y
        # "100000" recién cargado, y el historial mostraría dos formatos.
        return format(v.normalize(), "f")
    if isinstance(v, datetime | date):
        return v.isoformat()
    if isinstance(v, bytes):
        return None
    return v


def _columnas(obj: Any) -> list[str]:
    return [c.key for c in inspect(obj).mapper.column_attrs if c.key not in _IGNORADAS]


def _foto(obj: Any) -> dict[str, Any]:
    """Todos los valores al momento: lo que se guarda al crear o borrar."""
    return {k: _valor(getattr(obj, k)) for k in _columnas(obj) if getattr(obj, k) is not None}


def _diferencias(obj: Any) -> dict[str, list[Any]]:
    estado = inspect(obj)
    cambios: dict[str, list[Any]] = {}
    for clave in _columnas(obj):
        historia = estado.attrs[clave].history
        if not historia.has_changes():
            continue
        antes = historia.deleted[0] if historia.deleted else None
        despues = historia.added[0] if historia.added else None
        if antes != despues:
            cambios[clave] = [_valor(antes), _valor(despues)]
    return cambios


@event.listens_for(Session, "before_flush")
def _anotar(session: Session, flush_context, instances) -> None:
    """Toma las diferencias ahora, que la historia de cada atributo todavía existe.
    Las filas se escriben después del flush, cuando los objetos nuevos ya tienen id."""
    pendientes = session.info.setdefault(_CLAVE_PENDIENTES, [])
    for obj in session.new:
        if type(obj) in AUDITADAS:
            pendientes.append((obj, "crear", None))
    for obj in session.dirty:
        if type(obj) not in AUDITADAS or not session.is_modified(obj):
            continue
        cambios = _diferencias(obj)
        if not cambios:
            continue
        es_baja = any(k in _BAJA and v[0] is None and v[1] is not None for k, v in cambios.items())
        pendientes.append((obj, "baja" if es_baja else "editar", cambios))
    for obj in session.deleted:
        if type(obj) in AUDITADAS:
            pendientes.append((obj, "borrar", _foto(obj)))


@event.listens_for(Session, "after_flush_postexec")
def _escribir(session: Session, flush_context) -> None:
    """Agrega las filas a la sesión. `commit` vuelve a hacer flush mientras quede
    algo pendiente, así que entran en la misma transacción que el cambio."""
    pendientes = session.info.pop(_CLAVE_PENDIENTES, None)
    if not pendientes:
        return
    usuario_id = session.info.get(CLAVE_USUARIO_AUDITORIA)
    for obj, accion, cambios in pendientes:
        if cambios is None:  # crear: recién ahora hay id y valores por defecto
            cambios = _foto(obj)
        session.add(
            AuditLog(
                user_id=usuario_id,
                entidad=AUDITADAS[type(obj)],
                entidad_id=obj.id,
                accion=accion,
                cambios=cambios,
            )
        )


@event.listens_for(Session, "after_soft_rollback")
def _descartar(session: Session, previous_transaction) -> None:
    session.info.pop(_CLAVE_PENDIENTES, None)


def listar(
    db: Session,
    *,
    entidad: str | None = None,
    entidad_id: int | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[int, list[AuditLog]]:
    q = db.query(AuditLog)
    if entidad is not None:
        q = q.filter(AuditLog.entidad == entidad)
    if entidad_id is not None:
        q = q.filter(AuditLog.entidad_id == entidad_id)
    total = q.count()
    items = (
        q.options(joinedload(AuditLog.usuario))
        .order_by(AuditLog.creado_en.desc(), AuditLog.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return total, items
