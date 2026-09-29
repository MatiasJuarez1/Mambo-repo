"""Consultas del sitio público: un visitante pide una visita y queda en el CRM.

Antes el formulario armaba un `mailto:` y dependía de que el visitante tuviera un
cliente de correo configurado; la consulta, si llegaba, quedaba en una bandeja y
no en el sistema. Ahora cada consulta es una `Person` (nueva o existente) más una
`Activity` de tipo visita, pendiente y sin asignar, para que alguien la tome.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta, timezone
from datetime import time as hora

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.email import EmailNoEnviado, email_configurado, enviar_email
from app.modules.propiedades.models import Propiedad
from app.modules.propiedades.service import obtener_propiedad
from app.platform.activities.models import Activity
from app.platform.consultas.schemas import ConsultaCreate
from app.platform.inmobiliaria.service import obtener as obtener_inmobiliaria
from app.platform.people.models import Person, PersonContact, PersonTag

logger = logging.getLogger(__name__)

ETIQUETA_WEB = "consulta web"

# Argentina no tiene horario de verano: un offset fijo alcanza y evita depender
# de `tzdata`, que en Windows no viene instalado.
_HORA_ARGENTINA = timezone(timedelta(hours=-3))
# La fecha que elige el visitante es un día, no un horario. Se agenda a las 10 para
# que la actividad caiga dentro del día pedido en cualquier vista del panel.
_HORA_AGENDA = hora(10, 0)


# ---------------------------------------------------------------------------
# Límite de envíos por IP
# ---------------------------------------------------------------------------


class LimitePorIp:
    """Ventana deslizante en memoria. Alcanza con una sola instancia de la API
    (Render free/starter); con varias, cada una llevaría su propia cuenta y el
    límite efectivo se multiplicaría, que para frenar spam sigue sirviendo."""

    def __init__(self, maximo: int, ventana_segundos: int) -> None:
        self.maximo = maximo
        self.ventana = ventana_segundos
        self._envios: dict[str, deque[float]] = defaultdict(deque)

    def permitir(self, ip: str) -> bool:
        ahora = time.monotonic()
        envios = self._envios[ip]
        while envios and ahora - envios[0] > self.ventana:
            envios.popleft()
        if len(envios) >= self.maximo:
            return False
        envios.append(ahora)
        return True

    def reiniciar(self) -> None:
        self._envios.clear()


limite_consultas = LimitePorIp(maximo=5, ventana_segundos=600)


# ---------------------------------------------------------------------------
# Alta de la consulta
# ---------------------------------------------------------------------------


def _solo_digitos(valor: str) -> str:
    return "".join(c for c in valor if c.isdigit())


def _digitos_sql(columna):
    """La columna sin los separadores habituales de un teléfono, del lado de la base.
    `replace` existe igual en Postgres y en SQLite (los tests)."""
    for caracter in (" ", "-", "+", "(", ")", "."):
        columna = func.replace(columna, caracter, "")
    return columna


def _buscar_persona(db: Session, telefono: str, email: str | None) -> Person | None:
    """Misma persona = mismo teléfono (ignorando separadores) o mismo email.

    Sin esto, alguien que consulta por tres propiedades quedaría cargado tres
    veces y el equipo perdería el historial de lo que ya le ofrecieron.
    """
    condiciones = [
        PersonContact.type.in_(("phone", "whatsapp"))
        & (_digitos_sql(PersonContact.value) == _solo_digitos(telefono))
    ]
    if email:
        condiciones.append(
            (PersonContact.type == "email") & (func.lower(PersonContact.value) == email.lower())
        )
    return (
        db.query(Person)
        .join(PersonContact, PersonContact.person_id == Person.id)
        .filter(Person.deleted_at.is_(None), or_(*condiciones))
        .order_by(Person.id)
        .first()
    )


def _completar_contactos(person: Person, telefono: str, email: str | None) -> None:
    """Agrega a una persona ya cargada los datos que trae la consulta y le faltan."""
    tiene_telefono = any(
        c.type in ("phone", "whatsapp") and _solo_digitos(c.value) == _solo_digitos(telefono)
        for c in person.contacts
    )
    if not tiene_telefono:
        person.contacts.append(PersonContact(type="whatsapp", value=telefono))
    if email and not any(
        c.type == "email" and c.value.lower() == email.lower() for c in person.contacts
    ):
        person.contacts.append(PersonContact(type="email", value=email))


def _describir(data: ConsultaCreate, prop: Propiedad) -> str:
    lineas = [f"Consulta recibida desde el sitio web por «{prop.titulo}».", ""]
    lineas.append(f"Nombre: {data.nombre} {data.apellido}")
    lineas.append(f"Teléfono: {data.telefono}")
    if data.email:
        lineas.append(f"Email: {data.email}")
    if data.fecha_preferida:
        lineas.append(
            f"Día preferido para la visita: {data.fecha_preferida:%d/%m/%Y} (horario a coordinar)"
        )
    if data.mensaje:
        lineas += ["", data.mensaje]
    return "\n".join(lineas)


def crear_consulta(db: Session, data: ConsultaCreate) -> tuple[Activity, bool]:
    """Registra la consulta. Devuelve la actividad creada y si la persona es nueva."""
    prop = obtener_propiedad(db, data.propiedad_id)

    email = str(data.email) if data.email else None
    person = _buscar_persona(db, data.telefono, email)
    es_nueva = person is None
    if person is None:
        person = Person(first_name=data.nombre, last_name=data.apellido)
        db.add(person)
    _completar_contactos(person, data.telefono, email)
    if not any(t.nombre.lower() == ETIQUETA_WEB for t in person.tag_rows):
        person.tag_rows.append(PersonTag(nombre=ETIQUETA_WEB))
    person.updated_at = datetime.now(UTC)

    due_at = None
    if data.fecha_preferida:
        due_at = datetime.combine(data.fecha_preferida, _HORA_AGENDA, tzinfo=_HORA_ARGENTINA)

    actividad = Activity(
        activity_type="visita",
        status="pendiente",
        title=f"Visita pedida desde la web: {prop.titulo}"[:255],
        description=_describir(data, prop),
        due_at=due_at,
        person=person,
        property_id=prop.id,
        created_by_user_id=None,
    )
    db.add(actividad)
    db.commit()
    db.refresh(actividad)
    return actividad, es_nueva


# ---------------------------------------------------------------------------
# Aviso por email
# ---------------------------------------------------------------------------


def armar_aviso(db: Session, actividad: Activity, es_nueva: bool) -> tuple[str, str, str] | None:
    """Destinatario, asunto y cuerpo del aviso al equipo, o None si no hay a quién
    mandarlo. Se arma dentro del request (con la sesión abierta) y se envía después."""
    if not email_configurado():
        return None
    inmobiliaria = obtener_inmobiliaria(db)
    if not inmobiliaria.email:
        return None
    persona = actividad.person
    asunto = f"Nueva consulta web: {persona.full_name}"
    aviso_persona = (
        "Es un contacto nuevo: quedó cargado en Personas con la etiqueta «consulta web»."
        if es_nueva
        else "La persona ya estaba cargada: la consulta se sumó a su ficha."
    )
    cuerpo = (
        f"{actividad.description}\n\n{aviso_persona}\n"
        "La visita quedó como actividad pendiente y sin asignar en el panel."
    )
    return inmobiliaria.email, asunto, cuerpo


def enviar_aviso(destinatario: str, asunto: str, cuerpo: str) -> None:
    """Corre como BackgroundTask: si el SMTP falla, la consulta ya está guardada y
    el visitante no tiene por qué enterarse; queda en el log."""
    try:
        enviar_email(destinatario, asunto, cuerpo)
    except EmailNoEnviado as exc:
        logger.warning("Consulta web guardada pero sin aviso por email: %s", exc)
