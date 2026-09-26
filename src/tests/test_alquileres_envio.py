"""Envío de recibos y liquidaciones por email: destinatario, 202 y marca `enviado_email_at`."""

from datetime import date, timedelta

import pytest
from sqlalchemy.orm import sessionmaker

from app import email as modulo_email
from app.config import get_settings
from app.email import EmailNoEnviado
from app.platform.alquileres import recibos
from app.platform.alquileres.models import Liquidacion, Pago
from app.platform.people.models import PersonContact
from tests.helpers_crm import crear_contrato_de_prueba

HOY = date.today()


@pytest.fixture
def sesion(client, crear_usuario, iniciar_sesion, media_tmp):
    usuario = crear_usuario()
    iniciar_sesion()
    return usuario


@pytest.fixture
def sesion_background(engine, monkeypatch):
    """`enviar_y_marcar` abre su propia sesión con `app.database.SessionLocal`, que
    apunta a la base real. Acá se la redirige al motor de test: con `StaticPool` es
    la misma conexión SQLite que usa el resto del test, así que lo que commitea el
    background task lo ve la sesión `db` después de un `expire_all()`."""
    monkeypatch.setattr(recibos, "SessionLocal", sessionmaker(bind=engine))


@pytest.fixture
def smtp_configurado(monkeypatch):
    """`Settings` con SMTP completo, sin tocar variables de entorno."""
    s = get_settings()
    monkeypatch.setattr(s, "smtp_host", "smtp.ejemplo.com")
    monkeypatch.setattr(s, "smtp_user", "mambo")
    monkeypatch.setattr(s, "smtp_password", "clave")
    monkeypatch.setattr(s, "email_from", "Mambo <no-reply@mambo.com.ar>")


@pytest.fixture
def smtp_sin_configurar(monkeypatch):
    """Por si el `.env` de quien corre los tests tiene SMTP cargado."""
    s = get_settings()
    monkeypatch.setattr(s, "smtp_host", None)
    monkeypatch.setattr(s, "email_from", None)


@pytest.fixture
def emails_enviados(monkeypatch):
    """Captura lo que `app.email.enviar_email` hubiera mandado:
    (destinatario, asunto, cuerpo, adjuntos)."""
    capturados: list[tuple] = []

    def _falso(destinatario, asunto, cuerpo, adjuntos=()):
        capturados.append((destinatario, asunto, cuerpo, list(adjuntos)))

    monkeypatch.setattr(modulo_email, "enviar_email", _falso)
    # `recibos` importa la función por nombre: parchear también ahí.
    monkeypatch.setattr(recibos, "enviar_email", _falso, raising=False)
    return capturados


def _persona(contrato, rol: str):
    return next(p for p in contrato.partes if p.rol == rol).person


@pytest.fixture
def pago(db, client, sesion, sesion_background):
    """Contrato con un pago registrado hoy; inquilino y propietario con email primario."""
    inicio = (HOY - timedelta(days=95)).replace(day=1)
    contrato = crear_contrato_de_prueba(
        db, sesion.id, fecha_inicio=inicio, fecha_fin=inicio + timedelta(days=365)
    )
    inquilino, propietario = _persona(contrato, "inquilino"), _persona(contrato, "propietario")
    inquilino.contacts.append(PersonContact(type="email", value="viejo@ejemplo.com"))
    inquilino.contacts.append(PersonContact(type="email", value="ana@ejemplo.com", is_primary=True))
    propietario.contacts.append(
        PersonContact(type="email", value="juan@ejemplo.com", is_primary=True)
    )
    db.commit()

    cobro = contrato.cobros[0]
    r = client.post(
        f"/api/v1/alquileres/contratos/{contrato.id}/cobros/{cobro.id}/pagos",
        json={
            "fecha_pago": str(HOY),
            "monto": "100000",
            "punitorio": "0",
            "medio": "transferencia",
        },
    )
    assert r.status_code == 201, r.text
    return db.get(Pago, r.json()["pagos"][0]["id"])


@pytest.fixture
def liquidacion(client, db, pago):
    contrato_id = pago.cobro.contrato_id
    r = client.post(
        f"/api/v1/alquileres/contratos/{contrato_id}/liquidaciones",
        json={"periodo": HOY.strftime("%Y-%m")},
    )
    assert r.status_code == 201, r.text
    return db.get(Liquidacion, r.json()["id"])


def _url_recibo(pago: Pago) -> str:
    return (
        f"/api/v1/alquileres/contratos/{pago.cobro.contrato_id}/cobros/{pago.cobro_id}"
        f"/pagos/{pago.id}/enviar"
    )


def _url_liquidacion(liq: Liquidacion) -> str:
    return f"/api/v1/alquileres/contratos/{liq.contrato_id}/liquidaciones/{liq.id}/enviar"


# --- Recibo ---


def test_envia_al_email_primario_del_inquilino_y_marca_enviado(
    client, db, pago, smtp_configurado, emails_enviados
):
    r = client.post(_url_recibo(pago), json={})
    assert r.status_code == 202, r.text
    assert r.json()["id"] == pago.id

    assert len(emails_enviados) == 1
    destinatario, asunto, cuerpo, adjuntos = emails_enviados[0]
    assert destinatario == "ana@ejemplo.com"
    assert asunto.startswith("Recibo N° 0001-00000001")
    assert "Adjuntamos el recibo en PDF." in cuerpo
    assert adjuntos[0].nombre == "recibo-0001-00000001.pdf"
    assert adjuntos[0].contenido.startswith(b"%PDF")
    assert adjuntos[0].mime == "application/pdf"

    db.expire_all()
    assert db.get(Pago, pago.id).enviado_email_at is not None


def test_email_explicito_gana_y_se_valida(client, pago, smtp_configurado, emails_enviados):
    r = client.post(_url_recibo(pago), json={"email": "contador@ejemplo.com"})
    assert r.status_code == 202, r.text
    assert emails_enviados[0][0] == "contador@ejemplo.com"
    assert client.post(_url_recibo(pago), json={"email": "no-es-un-email"}).status_code == 422


def test_sin_email_del_inquilino_409(client, db, pago, smtp_configurado, emails_enviados):
    _persona(pago.cobro.contrato, "inquilino").contacts.clear()
    db.commit()
    r = client.post(_url_recibo(pago), json={})
    assert r.status_code == 409
    assert "email" in r.json()["detail"].lower()
    assert emails_enviados == []


def test_smtp_no_configurado_409(client, pago, smtp_sin_configurar, emails_enviados):
    r = client.post(_url_recibo(pago), json={})
    assert r.status_code == 409
    assert r.json()["detail"].startswith("Email no configurado")
    assert emails_enviados == []


def test_pago_anulado_409(client, pago, smtp_configurado, emails_enviados):
    base = _url_recibo(pago).removesuffix("/enviar")
    assert client.post(f"{base}/anular", json={"motivo": "Rebotó"}).status_code == 200
    assert client.post(_url_recibo(pago), json={}).status_code == 409
    assert emails_enviados == []


def test_fallo_de_smtp_no_marca_enviado(client, db, pago, smtp_configurado, monkeypatch, caplog):
    def _explota(*args, **kwargs):
        raise EmailNoEnviado("se cortó")

    monkeypatch.setattr(recibos, "enviar_email", _explota)
    r = client.post(_url_recibo(pago), json={})
    assert r.status_code == 202  # la respuesta sale antes del envío
    db.expire_all()
    assert db.get(Pago, pago.id).enviado_email_at is None
    assert "No se pudo enviar Pago" in caplog.text


# --- Liquidación ---


def test_envia_liquidacion_al_propietario(
    client, db, liquidacion, smtp_configurado, emails_enviados
):
    r = client.post(_url_liquidacion(liquidacion), json={})
    assert r.status_code == 202, r.text
    assert r.json()["numero_formateado"] == "0001-00000001"

    destinatario, asunto, cuerpo, adjuntos = emails_enviados[0]
    assert destinatario == "juan@ejemplo.com"
    assert asunto.startswith("Liquidación ")
    assert "Total a transferir" in cuerpo
    assert adjuntos[0].nombre == "liquidacion-0001-00000001.pdf"
    assert adjuntos[0].contenido.startswith(b"%PDF")

    db.expire_all()
    assert db.get(Liquidacion, liquidacion.id).enviado_email_at is not None


def test_liquidacion_sin_email_del_propietario_409(
    client, db, liquidacion, smtp_configurado, emails_enviados
):
    _persona(liquidacion.contrato, "propietario").contacts.clear()
    db.commit()
    assert client.post(_url_liquidacion(liquidacion), json={}).status_code == 409
    r = client.post(_url_liquidacion(liquidacion), json={"email": "juan@otro.com"})
    assert r.status_code == 202, r.text
    assert emails_enviados[0][0] == "juan@otro.com"
