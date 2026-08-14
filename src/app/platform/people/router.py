"""Router people: CRUD /people y sub-recurso /people/{id}/contacts."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.platform.auth.dependencies import get_current_user, require_role
from app.platform.people import service
from app.platform.people.schemas import (
    PaginatedPeople,
    PersonContactCreate,
    PersonContactOut,
    PersonContactUpdate,
    PersonCreate,
    PersonListOut,
    PersonOut,
    PersonUpdate,
)

router = APIRouter(prefix="/people", tags=["people"])

# Shorthand para proteger mutaciones: solo staff o admin
_staff = Depends(require_role("staff", "admin"))


# ---------------------------------------------------------------------------
# People
# ---------------------------------------------------------------------------

@router.get("", response_model=PaginatedPeople)
def list_people(
    search: str | None = Query(default=None, description="Buscar por nombre o documento"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: DBSession = Depends(get_db),
    _: object = Depends(get_current_user),
) -> PaginatedPeople:
    total, items = service.list_people(db, search=search, skip=skip, limit=limit)
    return PaginatedPeople(
        total=total,
        items=[PersonListOut.model_validate(p) for p in items],
    )


@router.get("/{person_id}", response_model=PersonOut)
def get_person(
    person_id: int,
    db: DBSession = Depends(get_db),
    _: object = Depends(get_current_user),
) -> PersonOut:
    person = service.get_person_or_404(db, person_id)
    return PersonOut.model_validate(person)


@router.post(
    "",
    response_model=PersonOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_staff],
)
def create_person(
    body: PersonCreate,
    db: DBSession = Depends(get_db),
) -> PersonOut:
    person = service.create_person(db, body)
    return PersonOut.model_validate(person)


@router.patch("/{person_id}", response_model=PersonOut, dependencies=[_staff])
def update_person(
    person_id: int,
    body: PersonUpdate,
    db: DBSession = Depends(get_db),
) -> PersonOut:
    person = service.update_person(db, person_id, body)
    return PersonOut.model_validate(person)


@router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[_staff])
def delete_person(
    person_id: int,
    db: DBSession = Depends(get_db),
) -> None:
    service.soft_delete_person(db, person_id)


# ---------------------------------------------------------------------------
# Contacts (sub-recurso)
# ---------------------------------------------------------------------------

@router.get("/{person_id}/contacts", response_model=list[PersonContactOut])
def list_contacts(
    person_id: int,
    db: DBSession = Depends(get_db),
    _: object = Depends(get_current_user),
) -> list[PersonContactOut]:
    contacts = service.list_contacts(db, person_id)
    return [PersonContactOut.model_validate(c) for c in contacts]


@router.post(
    "/{person_id}/contacts",
    response_model=PersonContactOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_staff],
)
def add_contact(
    person_id: int,
    body: PersonContactCreate,
    db: DBSession = Depends(get_db),
) -> PersonContactOut:
    contact = service.add_contact(db, person_id, body)
    return PersonContactOut.model_validate(contact)


@router.patch(
    "/{person_id}/contacts/{contact_id}",
    response_model=PersonContactOut,
    dependencies=[_staff],
)
def update_contact(
    person_id: int,
    contact_id: int,
    body: PersonContactUpdate,
    db: DBSession = Depends(get_db),
) -> PersonContactOut:
    contact = service.update_contact(db, person_id, contact_id, body)
    return PersonContactOut.model_validate(contact)


@router.delete(
    "/{person_id}/contacts/{contact_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_staff],
)
def remove_contact(
    person_id: int,
    contact_id: int,
    db: DBSession = Depends(get_db),
) -> None:
    service.remove_contact(db, person_id, contact_id)
