"""Consultas del sitio público: persona + actividad en el CRM, antispam y aviso por email."""

import pytest

from app.config import get_settings
from app.platform.activities.models import Activity
from app.platform.consultas import service as consultas_service
from app.platform.inmobiliaria.service import obtener as obtener_inmobiliaria
from app.platform.people.models import Person, PersonContact
from tests.helpers_crm import crear_persona, crear_propiedad

API = "/api/v1/consultas"


@pytest.fixture(autouse=True)
def _limite_limpio():
    consultas_service.limite_consultas.reiniciar()
    yield
    consultas_service.limite_consultas.reiniciar()


@pytest.fixture
def emails(monkeypatch):
    """Captura los avisos en vez de mandarlos, con el SMTP dado por configurado."""
    enviados: list[tuple[str, str, str]] = []
    s = get_settings()
    monkeypatch.setattr(s, "smtp_host", "smtp.ejemplo.com")
    monkeypatch.setattr(s, "email_from", "no-reply@ejemplo.com")
    monkeypatch.setattr(
        consultas_service, "enviar_email", lambda d, a, c: enviados.append((d, a, c))
    )
    return enviados


def _consulta(propiedad_id: int, **over) -> dict:
    return {
        "propiedad_id": propiedad_id,
        "nombre": "Laura",
        "apellido": "Gómez",
        "telefono": "+54 11 5555-1234",
        "fecha_preferida": "2026-10-15",
        **over,
    }


def test_crea_persona_y_actividad_de_visita_sin_asignar(client, db):
    prop = crear_propiedad(db, titulo="Depto en Palermo")

    datos = _consulta(prop.id, email="laura@ejemplo.com", mensaje="¿Acepta mascotas?")
    r = client.post(API, json=datos)

    assert r.status_code == 201
    # La respuesta no revela ids ni si la persona ya existía.
    assert set(r.json()) == {"mensaje"}

    persona = db.query(Person).one()
    assert persona.full_name == "Laura Gómez"
    assert persona.tags == ["consulta web"]
    assert {(c.type, c.value) for c in persona.contacts} == {
        ("whatsapp", "+54 11 5555-1234"),
        ("email", "laura@ejemplo.com"),
    }

    actividad = db.query(Activity).one()
    assert actividad.activity_type == "visita"
    assert actividad.status == "pendiente"
    assert actividad.person_id == persona.id
    assert actividad.property_id == prop.id
    assert actividad.assigned_to_user_id is None
    assert actividad.created_by_user_id is None
    assert "Depto en Palermo" in actividad.title
    assert "15/10/2026" in actividad.description
    assert "¿Acepta mascotas?" in actividad.description


def test_reusa_la_persona_si_el_telefono_coincide_ignorando_separadores(client, db):
    prop = crear_propiedad(db)
    existente = crear_persona(db, first_name="Laura", last_name="Gómez")
    db.add(PersonContact(person_id=existente.id, type="phone", value="54 11 55551234"))
    db.commit()

    r = client.post(API, json=_consulta(prop.id, email="laura@ejemplo.com"))

    assert r.status_code == 201
    assert db.query(Person).count() == 1
    db.refresh(existente)
    # Se le suma el email que no tenía y no se duplica el teléfono.
    assert sorted(c.type for c in existente.contacts) == ["email", "phone"]
    assert db.query(Activity).one().person_id == existente.id


def test_reusa_la_persona_si_el_email_coincide_sin_distinguir_mayusculas(client, db):
    prop = crear_propiedad(db)
    existente = crear_persona(db)
    db.add(PersonContact(person_id=existente.id, type="email", value="Laura@Ejemplo.com"))
    db.commit()

    datos = _consulta(prop.id, telefono="221 400 0000", email="laura@ejemplo.com")
    r = client.post(API, json=datos)

    assert r.status_code == 201
    assert db.query(Person).count() == 1
    assert db.query(Activity).one().person_id == existente.id


def test_no_reusa_personas_borradas(client, db):
    from datetime import UTC, datetime

    prop = crear_propiedad(db)
    borrada = crear_persona(db, deleted_at=datetime.now(UTC))
    db.add(PersonContact(person_id=borrada.id, type="whatsapp", value="+54 11 5555-1234"))
    db.commit()

    client.post(API, json=_consulta(prop.id))

    assert db.query(Person).count() == 2
    assert db.query(Activity).one().person_id != borrada.id


def test_sin_fecha_la_actividad_queda_sin_vencimiento(client, db):
    prop = crear_propiedad(db)

    r = client.post(API, json=_consulta(prop.id, fecha_preferida=None))

    assert r.status_code == 201
    assert db.query(Activity).one().due_at is None


def test_propiedad_inexistente_404(client, db):
    r = client.post(API, json=_consulta(9999))
    assert r.status_code == 404
    assert db.query(Person).count() == 0


@pytest.mark.parametrize(
    "over",
    [
        {"nombre": "   "},
        {"telefono": "abc-defg"},
        {"email": "no-es-un-mail"},
        {"mensaje": "x" * 2001},
    ],
)
def test_valida_los_datos(client, db, over):
    prop = crear_propiedad(db)
    r = client.post(API, json=_consulta(prop.id, **over))
    assert r.status_code == 422


def test_honeypot_responde_ok_pero_no_guarda(client, db):
    prop = crear_propiedad(db)

    r = client.post(API, json=_consulta(prop.id, sitio_web="http://spam.example"))

    assert r.status_code == 201
    assert db.query(Person).count() == 0
    assert db.query(Activity).count() == 0


def test_limita_envios_por_ip(client, db):
    prop = crear_propiedad(db)
    cabecera = {"X-Forwarded-For": "200.1.2.3, 10.0.0.1"}

    for _ in range(5):
        assert client.post(API, json=_consulta(prop.id), headers=cabecera).status_code == 201
    r = client.post(API, json=_consulta(prop.id), headers=cabecera)
    assert r.status_code == 429

    # Otra IP no queda bloqueada por la primera.
    otra = client.post(API, json=_consulta(prop.id), headers={"X-Forwarded-For": "200.9.9.9"})
    assert otra.status_code == 201


def test_avisa_por_email_al_mail_de_la_inmobiliaria(client, db, emails):
    obtener_inmobiliaria(db).email = "oficina@mambo.com.ar"
    db.commit()
    prop = crear_propiedad(db, titulo="Casa con pileta")

    client.post(API, json=_consulta(prop.id))

    assert len(emails) == 1
    destinatario, asunto, cuerpo = emails[0]
    assert destinatario == "oficina@mambo.com.ar"
    assert "Laura Gómez" in asunto
    assert "Casa con pileta" in cuerpo
    assert "contacto nuevo" in cuerpo


def test_sin_mail_de_la_inmobiliaria_no_intenta_avisar(client, db, emails):
    prop = crear_propiedad(db)

    r = client.post(API, json=_consulta(prop.id))

    assert r.status_code == 201
    assert emails == []


def test_la_actividad_web_se_lista_en_el_panel_sin_creador(
    client, db, crear_usuario, iniciar_sesion
):
    prop = crear_propiedad(db)
    client.post(API, json=_consulta(prop.id))
    crear_usuario()
    iniciar_sesion()

    r = client.get("/api/v1/activities")

    assert r.status_code == 200
    item = r.json()["items"][0]
    assert item["created_by"] is None
    assert item["person"]["full_name"] == "Laura Gómez"
