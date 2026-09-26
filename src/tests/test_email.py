"""`app.email`: arma el mensaje y lo entrega por SMTP. Se prueba con un SMTP falso."""

import smtplib

import pytest

from app import email as modulo_email
from app.config import get_settings


class _SmtpFalso:
    """Registra lo que haría `smtplib.SMTP`, sin abrir sockets."""

    instancias: list["_SmtpFalso"] = []

    def __init__(self, host, port, timeout=None):
        self.host, self.port = host, port
        self.tls = False
        self.login_con = None
        self.enviados = []
        _SmtpFalso.instancias.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self):
        self.tls = True

    def login(self, user, password):
        self.login_con = (user, password)

    def send_message(self, msg):
        self.enviados.append(msg)


@pytest.fixture
def smtp_falso(monkeypatch):
    _SmtpFalso.instancias.clear()
    monkeypatch.setattr(smtplib, "SMTP", _SmtpFalso)
    s = get_settings()
    monkeypatch.setattr(s, "smtp_host", "smtp.ejemplo.com")
    monkeypatch.setattr(s, "smtp_port", 587)
    monkeypatch.setattr(s, "smtp_user", "mambo")
    monkeypatch.setattr(s, "smtp_password", "clave")
    monkeypatch.setattr(s, "email_from", "Mambo <no-reply@mambo.com.ar>")
    return _SmtpFalso


def test_enviar_email_con_adjunto(smtp_falso):
    modulo_email.enviar_email(
        "ana@ejemplo.com",
        "Recibo N° 0001-00000001",
        "Hola Ana,\nAdjuntamos el recibo.",
        [modulo_email.Adjunto("recibo.pdf", b"%PDF-1.4 fake", "application/pdf")],
    )

    smtp = smtp_falso.instancias[0]
    assert (smtp.host, smtp.port) == ("smtp.ejemplo.com", 587)
    assert smtp.tls is True
    assert smtp.login_con == ("mambo", "clave")
    msg = smtp.enviados[0]
    assert msg["To"] == "ana@ejemplo.com"
    assert msg["From"] == "Mambo <no-reply@mambo.com.ar>"
    assert msg["Subject"] == "Recibo N° 0001-00000001"
    adjuntos = [p for p in msg.iter_attachments()]
    assert adjuntos[0].get_filename() == "recibo.pdf"
    assert adjuntos[0].get_content_type() == "application/pdf"


def test_sin_configuracion_lanza(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "smtp_host", None)
    monkeypatch.setattr(s, "email_from", None)
    with pytest.raises(modulo_email.EmailNoEnviado):
        modulo_email.enviar_email("a@b.com", "x", "y")


def test_error_de_smtp_se_envuelve(smtp_falso, monkeypatch):
    def _explota(self, msg):
        raise smtplib.SMTPServerDisconnected("se cortó")

    monkeypatch.setattr(smtp_falso, "send_message", _explota)
    with pytest.raises(modulo_email.EmailNoEnviado, match="se cortó"):
        modulo_email.enviar_email("a@b.com", "x", "y")
