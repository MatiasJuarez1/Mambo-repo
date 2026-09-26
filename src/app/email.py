"""Envío de emails por SMTP con la biblioteca estándar.

Sin proveedor ni dependencia: cinco variables (`SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`) y sirve con Gmail (contraseña de
aplicación), Brevo, Resend o lo que tenga la inmobiliaria. Texto plano, sin
HTML: llega a cualquier cliente y no hay nada que maquetar.

Quien llama decide si va en un `BackgroundTask`; acá se envía en el hilo actual.
"""

from __future__ import annotations

import logging
import smtplib
from collections.abc import Sequence
from email.message import EmailMessage
from typing import NamedTuple

from app.config import get_settings

logger = logging.getLogger(__name__)


class Adjunto(NamedTuple):
    nombre: str
    contenido: bytes
    mime: str
    """Tipo MIME completo, p. ej. `application/pdf`."""


class EmailNoEnviado(Exception):
    """Cualquier falla de SMTP, envuelta para que el resto del código no importe smtplib."""


def email_configurado() -> bool:
    return get_settings().email_configurado


def enviar_email(
    destinatario: str, asunto: str, cuerpo: str, adjuntos: Sequence[Adjunto] = ()
) -> None:
    s = get_settings()
    if not s.email_configurado:
        raise EmailNoEnviado("Email no configurado (SMTP_HOST / EMAIL_FROM)")

    msg = EmailMessage()
    msg["From"] = s.email_from
    msg["To"] = destinatario
    msg["Subject"] = asunto
    msg.set_content(cuerpo)
    for adjunto in adjuntos:
        tipo, subtipo = adjunto.mime.split("/", 1)
        msg.add_attachment(
            adjunto.contenido, maintype=tipo, subtype=subtipo, filename=adjunto.nombre
        )

    try:
        if s.smtp_port == 465:
            with smtplib.SMTP_SSL(s.smtp_host, s.smtp_port, timeout=20) as smtp:
                if s.smtp_user:
                    smtp.login(s.smtp_user, s.smtp_password or "")
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=20) as smtp:
                smtp.starttls()
                if s.smtp_user:
                    smtp.login(s.smtp_user, s.smtp_password or "")
                smtp.send_message(msg)
    except (smtplib.SMTPException, OSError) as exc:
        logger.warning("No se pudo enviar el email a %s: %s", destinatario, exc)
        raise EmailNoEnviado(str(exc)) from exc
