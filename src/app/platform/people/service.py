"""Lógica de negocio: CRUD people y people_contacts."""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session as DBSession

from app.modules.propiedades.models import Propiedad
from app.modules.propiedades.schemas import PropiedadBrief
from app.platform.activities.models import Activity
from app.platform.deals.models import Deal, DealParty
from app.platform.people.models import Person, PersonContact, PersonTag
from app.platform.people.schemas import (
    ActividadVinculoOut,
    DealVinculoOut,
    PersonContactCreate,
    PersonContactUpdate,
    PersonCreate,
    PersonLinksOut,
    PersonUpdate,
    PropiedadVinculoOut,
    ReservaVinculoOut,
)
from app.platform.reservations.models import Reservation

# ---------------------------------------------------------------------------
# People
# ---------------------------------------------------------------------------

def list_people(
    db: DBSession,
    search: str | None = None,
    tag: str | None = None,
    rol: str | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[int, list[Person]]:
    q = db.query(Person).filter(Person.deleted_at.is_(None))
    if search:
        term = f"%{search}%"
        q = q.filter(
            or_(
                Person.first_name.ilike(term),
                Person.last_name.ilike(term),
                Person.document_number.ilike(term),
            )
        )
    if tag:
        q = q.join(PersonTag).filter(func.lower(PersonTag.nombre) == tag.strip().lower())
    if rol:
        q = q.filter(Person.id.in_(_ids_con_rol(rol)))
    total = q.count()
    items = q.order_by(Person.last_name, Person.first_name).offset(skip).limit(limit).all()
    return total, items


def get_person_or_404(db: DBSession, person_id: int) -> Person:
    person = db.query(Person).filter(Person.id == person_id, Person.deleted_at.is_(None)).first()
    if not person:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Persona no encontrada")
    return person


def create_person(db: DBSession, data: PersonCreate) -> Person:
    person = Person(
        first_name=data.first_name,
        last_name=data.last_name,
        document_type=data.document_type,
        document_number=data.document_number,
        notes=data.notes,
    )
    db.add(person)
    db.flush()  # obtener person.id antes de agregar contactos

    for contact_data in data.contacts:
        contact = PersonContact(person_id=person.id, **contact_data.model_dump())
        db.add(contact)

    db.commit()
    db.refresh(person)
    return person


def update_person(db: DBSession, person_id: int, data: PersonUpdate) -> Person:
    person = get_person_or_404(db, person_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(person, field, value)
    person.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(person)
    return person


def soft_delete_person(db: DBSession, person_id: int) -> None:
    person = get_person_or_404(db, person_id)
    person.deleted_at = datetime.now(UTC)
    db.commit()


# ---------------------------------------------------------------------------
# PersonContact (sub-recurso)
# ---------------------------------------------------------------------------

def list_contacts(db: DBSession, person_id: int) -> list[PersonContact]:
    get_person_or_404(db, person_id)
    return db.query(PersonContact).filter(PersonContact.person_id == person_id).all()


def add_contact(db: DBSession, person_id: int, data: PersonContactCreate) -> PersonContact:
    get_person_or_404(db, person_id)

    # Verificar unicidad (person_id, type, value)
    existing = (
        db.query(PersonContact)
        .filter(
            PersonContact.person_id == person_id,
            PersonContact.type == data.type,
            PersonContact.value == data.value,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este contacto ya existe para la persona",
        )

    if data.is_primary:
        _clear_primary(db, person_id, data.type)

    contact = PersonContact(person_id=person_id, **data.model_dump())
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


def update_contact(
    db: DBSession, person_id: int, contact_id: int, data: PersonContactUpdate
) -> PersonContact:
    contact = _get_contact_or_404(db, person_id, contact_id)

    if data.is_primary is True:
        _clear_primary(db, person_id, contact.type)

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(contact, field, value)

    db.commit()
    db.refresh(contact)
    return contact


def remove_contact(db: DBSession, person_id: int, contact_id: int) -> None:
    contact = _get_contact_or_404(db, person_id, contact_id)
    db.delete(contact)
    db.commit()


# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------

def _get_contact_or_404(db: DBSession, person_id: int, contact_id: int) -> PersonContact:
    contact = (
        db.query(PersonContact)
        .filter(PersonContact.id == contact_id, PersonContact.person_id == person_id)
        .first()
    )
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contacto no encontrado")
    return contact


def _clear_primary(db: DBSession, person_id: int, contact_type: str) -> None:
    """Quita el flag is_primary del contacto primario actual del mismo tipo."""
    db.query(PersonContact).filter(
        PersonContact.person_id == person_id,
        PersonContact.type == contact_type,
        PersonContact.is_primary.is_(True),
    ).update({"is_primary": False})


# ---------------------------------------------------------------------------
# Tags
# ---------------------------------------------------------------------------

def set_tags(db: DBSession, person_id: int, tags: list[str]) -> Person:
    """Reemplaza el conjunto entero. Recorta, descarta vacíos y deduplica sin
    distinguir mayúsculas conservando la primera forma escrita."""
    person = get_person_or_404(db, person_id)
    unicos: dict[str, str] = {}
    for crudo in tags:
        limpio = crudo.strip()
        if limpio:
            unicos.setdefault(limpio.lower(), limpio)
    person.tag_rows = [PersonTag(nombre=nombre) for nombre in unicos.values()]
    person.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(person)
    return person


def list_tags(db: DBSession) -> list[tuple[str, int]]:
    """Etiquetas distintas en uso (en minúsculas) con cuántas personas las tienen."""
    filas = (
        db.query(func.lower(PersonTag.nombre), func.count(PersonTag.id))
        .join(Person)
        .filter(Person.deleted_at.is_(None))
        .group_by(func.lower(PersonTag.nombre))
        .order_by(func.count(PersonTag.id).desc(), func.lower(PersonTag.nombre))
        .all()
    )
    return [(nombre, cantidad) for nombre, cantidad in filas]


# ---------------------------------------------------------------------------
# Roles derivados
# ---------------------------------------------------------------------------
#
# Una persona no "es" compradora: figura como tal en una operación ganada. Los
# roles se calculan siempre desde las relaciones para que nunca queden viejos y
# para que la misma persona pueda ser dueña de una cosa y compradora de otra.

ROLES = ("propietario", "comprador", "vendedor", "inquilino", "interesado")


def _consulta_rol(rol: str):
    """Select (person_id, cantidad) para un rol. Se reutiliza para contar y filtrar."""
    if rol == "propietario":
        return (
            select(Propiedad.propietario_persona_id.label("person_id"), func.count().label("n"))
            .where(Propiedad.propietario_persona_id.is_not(None), Propiedad.eliminado_en.is_(None))
            .group_by(Propiedad.propietario_persona_id)
        )
    if rol in ("comprador", "vendedor", "inquilino"):
        return (
            select(DealParty.person_id.label("person_id"), func.count().label("n"))
            .join(Deal, Deal.id == DealParty.deal_id)
            .where(DealParty.role == rol, Deal.is_won.is_(True), Deal.deleted_at.is_(None))
            .group_by(DealParty.person_id)
        )
    if rol == "interesado":
        abiertos = (
            select(DealParty.person_id.label("person_id"))
            .join(Deal, Deal.id == DealParty.deal_id)
            .where(Deal.is_won.is_(False), Deal.is_lost.is_(False), Deal.deleted_at.is_(None))
        )
        reservas = select(Reservation.person_id.label("person_id")).where(
            Reservation.status == "activa"
        )
        union = abiertos.union_all(reservas).subquery()
        return (
            select(union.c.person_id.label("person_id"), func.count().label("n"))
            .group_by(union.c.person_id)
        )
    raise ValueError(f"Rol desconocido: {rol}")


def roles_de_personas(db: DBSession, person_ids: list[int]) -> dict[int, dict[str, int]]:
    """Roles de varias personas en cinco consultas agregadas (no una por persona)."""
    resultado = {pid: dict.fromkeys(ROLES, 0) for pid in person_ids}
    if not person_ids:
        return resultado
    for rol in ROLES:
        sub = _consulta_rol(rol).subquery()
        filas = db.execute(
            select(sub.c.person_id, sub.c.n).where(sub.c.person_id.in_(person_ids))
        ).all()
        for pid, n in filas:
            resultado[pid][rol] = n
    return resultado


def _ids_con_rol(rol: str):
    if rol not in ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Rol desconocido: {rol}. Válidos: {', '.join(ROLES)}",
        )
    sub = _consulta_rol(rol).subquery()
    return select(sub.c.person_id)


# ---------------------------------------------------------------------------
# Vínculos (lo que carga la ficha de una persona en una sola llamada)
# ---------------------------------------------------------------------------

def get_person_links(db: DBSession, person_id: int) -> PersonLinksOut:
    get_person_or_404(db, person_id)

    propiedades = (
        db.query(Propiedad)
        .filter(Propiedad.propietario_persona_id == person_id, Propiedad.eliminado_en.is_(None))
        .order_by(Propiedad.creado_en.desc())
        .all()
    )
    reservas = (
        db.query(Reservation)
        .filter(Reservation.person_id == person_id)
        .order_by(Reservation.created_at.desc())
        .all()
    )
    partes = (
        db.query(DealParty)
        .join(Deal, Deal.id == DealParty.deal_id)
        .filter(DealParty.person_id == person_id, Deal.deleted_at.is_(None))
        .order_by(Deal.created_at.desc())
        .all()
    )
    actividades = (
        db.query(Activity)
        .filter(Activity.person_id == person_id, Activity.status == "pendiente")
        .order_by(Activity.due_at.asc().nulls_last(), Activity.created_at.desc())
        .all()
    )

    return PersonLinksOut(
        propiedades=[
            PropiedadVinculoOut(
                id=p.id, titulo=p.titulo, tipo_operacion=p.tipo_operacion,
                estado_comercial=p.estado_comercial, foto_principal=_foto_principal(p),
            )
            for p in propiedades
        ],
        reservas=[
            ReservaVinculoOut(
                id=r.id, status=r.status, amount=r.amount, currency=r.currency,
                expires_at=r.expires_at,
                propiedad=PropiedadBrief(
                    id=r.propiedad.id, titulo=r.propiedad.titulo,
                    estado_comercial=r.propiedad.estado_comercial,
                ),
            )
            for r in reservas
        ],
        deals=[
            DealVinculoOut(
                id=pt.deal.id, title=pt.deal.title, pipeline=pt.deal.pipeline.name,
                stage=pt.deal.stage.name, is_won=pt.deal.is_won, is_lost=pt.deal.is_lost,
                amount=pt.deal.amount, currency=pt.deal.currency, role=pt.role,
                propiedad=(
                    PropiedadBrief(
                        id=pt.deal.propiedad.id, titulo=pt.deal.propiedad.titulo,
                        estado_comercial=pt.deal.propiedad.estado_comercial,
                    )
                    if pt.deal.propiedad else None
                ),
            )
            for pt in partes
        ],
        actividades=[
            ActividadVinculoOut(
                id=a.id, activity_type=a.activity_type, status=a.status, title=a.title,
                due_at=a.due_at,
            )
            for a in actividades
        ],
    )


def _foto_principal(prop: Propiedad) -> str | None:
    principal = next((m for m in prop.medios if m.es_principal), None) or (
        prop.medios[0] if prop.medios else None
    )
    return principal.url if principal else None
