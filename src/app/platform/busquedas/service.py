"""Búsquedas guardadas: qué busca cada persona y qué propiedades le sirven.

Dos direcciones de la misma pregunta:
- desde la persona: ¿qué propiedades disponibles cumplen lo que busca? (`coincidencias`)
- desde la propiedad: ¿a quién se la ofrezco? (`interesados`, y `avisar_coincidencias`,
  que además le deja una tarea al agente la primera vez que una propiedad le sirve
  a una búsqueda).
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.modules.propiedades.models import EstadoComercial, Propiedad, PropiedadUbicacion
from app.platform.activities.models import Activity
from app.platform.auth.dependencies import CLAVE_USUARIO_AUDITORIA
from app.platform.busquedas.models import Busqueda, BusquedaAviso
from app.platform.busquedas.schemas import BusquedaCreate, BusquedaUpdate
from app.platform.people.service import get_person_or_404

# ---------------------------------------------------------------------------
# Coincidencia
# ---------------------------------------------------------------------------


def _mismo_texto(a: str | None, b: str | None) -> bool:
    return (a or "").strip().lower() == (b or "").strip().lower()


def coincide(busqueda: Busqueda, prop: Propiedad) -> bool:
    """Una propiedad le sirve a una búsqueda si está disponible y cumple cada
    criterio cargado. Un criterio vacío no filtra; un dato que falta en la
    propiedad (sin precio, sin dormitorios) no cumple el criterio que lo pide."""
    if prop.eliminado_en is not None or prop.estado_comercial != EstadoComercial.disponible:
        return False
    if busqueda.tipo_operacion and prop.tipo_operacion != busqueda.tipo_operacion:
        return False
    if busqueda.tipo_propiedad and prop.tipo_propiedad != busqueda.tipo_propiedad:
        return False
    if busqueda.ciudad:
        ciudad = prop.ubicacion.ciudad if prop.ubicacion else None
        if not _mismo_texto(ciudad, busqueda.ciudad):
            return False
    if busqueda.precio_min is not None or busqueda.precio_max is not None:
        if prop.precio is None or prop.moneda != busqueda.moneda:
            return False
        if busqueda.precio_min is not None and prop.precio < busqueda.precio_min:
            return False
        if busqueda.precio_max is not None and prop.precio > busqueda.precio_max:
            return False
    if busqueda.dormitorios_min is not None:
        if prop.dormitorios is None or prop.dormitorios < busqueda.dormitorios_min:
            return False
    return True


def _consulta_coincidencias(db: Session, busqueda: Busqueda):
    """La misma regla que `coincide`, pero en SQL: para listar sin traer todo."""
    q = db.query(Propiedad).filter(
        Propiedad.eliminado_en.is_(None),
        Propiedad.estado_comercial == EstadoComercial.disponible,
    )
    if busqueda.tipo_operacion:
        q = q.filter(Propiedad.tipo_operacion == busqueda.tipo_operacion)
    if busqueda.tipo_propiedad:
        q = q.filter(Propiedad.tipo_propiedad == busqueda.tipo_propiedad)
    if busqueda.ciudad:
        q = q.join(PropiedadUbicacion, PropiedadUbicacion.propiedad_id == Propiedad.id).filter(
            func.lower(func.trim(PropiedadUbicacion.ciudad)) == busqueda.ciudad.strip().lower()
        )
    if busqueda.precio_min is not None or busqueda.precio_max is not None:
        q = q.filter(Propiedad.moneda == busqueda.moneda, Propiedad.precio.is_not(None))
        if busqueda.precio_min is not None:
            q = q.filter(Propiedad.precio >= busqueda.precio_min)
        if busqueda.precio_max is not None:
            q = q.filter(Propiedad.precio <= busqueda.precio_max)
    if busqueda.dormitorios_min is not None:
        q = q.filter(Propiedad.dormitorios >= busqueda.dormitorios_min)
    return q


def coincidencias(db: Session, busqueda_id: int) -> list[Propiedad]:
    busqueda = get_busqueda_or_404(db, busqueda_id)
    return _consulta_coincidencias(db, busqueda).order_by(Propiedad.id.desc()).all()


def contar_coincidencias(db: Session, busqueda: Busqueda) -> int:
    if not busqueda.activa:
        return 0
    return _consulta_coincidencias(db, busqueda).count()


def interesados(db: Session, prop: Propiedad) -> list[Busqueda]:
    """Búsquedas activas a las que les sirve esta propiedad. Se filtra en Python:
    son decenas, no miles, y así la regla vive en un solo lugar (`coincide`)."""
    activas = (
        db.query(Busqueda)
        .join(Busqueda.person)
        .options(joinedload(Busqueda.person))
        .filter(Busqueda.activa.is_(True))
        .all()
    )
    return [b for b in activas if b.person.deleted_at is None and coincide(b, prop)]


def avisar_coincidencias(db: Session, prop: Propiedad) -> int:
    """Deja una tarea de "ofrecer" por cada búsqueda a la que esta propiedad le
    sirve por primera vez. Se llama después de crear o editar una propiedad.
    Devuelve cuántas tareas creó."""
    ya_avisadas = {
        b_id
        for (b_id,) in db.query(BusquedaAviso.busqueda_id).filter(
            BusquedaAviso.propiedad_id == prop.id
        )
    }
    nuevas = [b for b in interesados(db, prop) if b.id not in ya_avisadas]
    for b in nuevas:
        db.add(BusquedaAviso(busqueda_id=b.id, propiedad_id=prop.id))
        db.add(
            Activity(
                activity_type="tarea",
                status="pendiente",
                title=f"Ofrecer «{prop.titulo}» a {b.person.full_name}"[:255],
                description=f"La propiedad cumple una búsqueda guardada de {b.person.full_name}.",
                person_id=b.person_id,
                property_id=prop.id,
                assigned_to_user_id=b.created_by_user_id,
                created_by_user_id=db.info.get(CLAVE_USUARIO_AUDITORIA),
            )
        )
    if nuevas:
        db.commit()
    return len(nuevas)


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


def get_busqueda_or_404(db: Session, busqueda_id: int) -> Busqueda:
    busqueda = db.get(Busqueda, busqueda_id)
    if busqueda is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Búsqueda no encontrada")
    return busqueda


def listar(db: Session, person_id: int | None = None) -> list[Busqueda]:
    q = db.query(Busqueda).options(joinedload(Busqueda.person))
    if person_id is not None:
        q = q.filter(Busqueda.person_id == person_id)
    return q.order_by(Busqueda.activa.desc(), Busqueda.created_at.desc()).all()


def _normalizar(datos: dict) -> dict:
    if datos.get("ciudad") is not None:
        datos["ciudad"] = datos["ciudad"].strip() or None
    if datos.get("moneda") is not None:
        datos["moneda"] = datos["moneda"].strip().upper() or None
    return datos


def crear(db: Session, data: BusquedaCreate, user_id: int) -> Busqueda:
    get_person_or_404(db, data.person_id)
    busqueda = Busqueda(**_normalizar(data.model_dump()), created_by_user_id=user_id)
    db.add(busqueda)
    db.commit()
    db.refresh(busqueda)
    return busqueda


def actualizar(db: Session, busqueda_id: int, data: BusquedaUpdate) -> Busqueda:
    busqueda = get_busqueda_or_404(db, busqueda_id)
    for campo, valor in _normalizar(data.model_dump(exclude_unset=True)).items():
        setattr(busqueda, campo, valor)
    # El rango se valida en el schema solo con lo que vino en el PATCH; acá, ya
    # combinado con lo guardado.
    if (busqueda.precio_min is not None or busqueda.precio_max is not None) and not busqueda.moneda:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Un rango de precio necesita la moneda",
        )
    db.commit()
    db.refresh(busqueda)
    return busqueda


def borrar(db: Session, busqueda_id: int) -> None:
    db.delete(get_busqueda_or_404(db, busqueda_id))
    db.commit()
