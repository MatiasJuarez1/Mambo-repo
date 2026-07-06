"""Lógica de negocio: CRUD people y people_contacts."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session as DBSession

from app.platform.people.models import Person, PersonContact
from app.platform.people.schemas import (
    PersonContactCreate,
    PersonContactUpdate,
    PersonCreate,
    PersonUpdate,
)


# ---------------------------------------------------------------------------
# People
# ---------------------------------------------------------------------------

def list_people(
    db: DBSession,
    search: str | None = None,
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
    person.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(person)
    return person


def soft_delete_person(db: DBSession, person_id: int) -> None:
    person = get_person_or_404(db, person_id)
    person.deleted_at = datetime.now(timezone.utc)
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
