"""Bandeja de recordatorios: se calcula sobre cobros, ajustes y contratos, no se guarda."""

from datetime import date, timedelta
from decimal import Decimal

import pytest

from app import email as modulo_email
from app.config import get_settings
from app.platform.alquileres import recordatorios
from app.platform.alquileres.models import (
    Ajuste,
    Contrato,
    EstadoAjuste,
    EstadoCobro,
    EstadoContrato,
)
from tests.helpers_crm import crear_contrato_de_prueba

HOY = date.today()


@pytest.fixture
def usuario(crear_usuario):
    return crear_usuario()


def _con_fechas(db, user_id: int, **campos) -> Contrato:
    """Contrato administrado que arranca hace ~3 meses. Los cobros se acomodan a mano
    para que el test no dependa del día del mes en que corre."""
    inicio = (HOY - timedelta(days=95)).replace(day=1)
    base = {"fecha_inicio": inicio, "fecha_fin": HOY + timedelta(days=25)}
    base.update(campos)
    return crear_contrato_de_prueba(db, user_id, **base)


def _fijar_cobros(contrato: Contrato, vencimientos: list[date]) -> None:
    """Los primeros N cobros vencen en las fechas dadas; el resto se anula."""
    for cobro, fecha in zip(contrato.cobros, vencimientos, strict=False):
        cobro.fecha_vencimiento = fecha
    for cobro in contrato.cobros[len(vencimientos) :]:
        cobro.estado = EstadoCobro.anulado


@pytest.fixture
def escenario(db, usuario):
    """Un contrato ICL con: cobro vencido hace 5 días, cobro a 10 días, cobro a 50 días,
    ajuste atrasado 3 días, ajuste a 20 días, ajuste ya aplicado, y fin a 25 días."""
    contrato = _con_fechas(db, usuario.id, indice="icl", frecuencia_meses=3)
    assert len(contrato.cobros) >= 3
    _fijar_cobros(
        contrato,
        [HOY - timedelta(days=5), HOY + timedelta(days=10), HOY + timedelta(days=50)],
    )
    contrato.ajustes.clear()
    contrato.ajustes.extend(
        [
            Ajuste(fecha_prevista=HOY - timedelta(days=3), estado=EstadoAjuste.pendiente),
            Ajuste(fecha_prevista=HOY + timedelta(days=20), estado=EstadoAjuste.pendiente),
            Ajuste(
                fecha_prevista=HOY - timedelta(days=60),
                estado=EstadoAjuste.aplicado,
                monto_anterior=Decimal("100000.00"),
                monto_nuevo=Decimal("120000.00"),
            ),
        ]
    )
    db.commit()
    return contrato


def test_listar_junta_los_cuatro_tipos_en_orden_de_fecha(db, escenario):
    r = recordatorios.listar(db, HOY, dias=30)

    assert r.hoy == HOY and r.dias == 30 and r.total == 5
    assert [(i.tipo, i.dias) for i in r.items] == [
        ("cobro_vencido", -5),
        ("ajuste", -3),
        ("cobro_por_vencer", 10),
        ("ajuste", 20),
        ("fin_contrato", 25),
    ]
    assert r.por_tipo == {
        "cobro_vencido": 1,
        "cobro_por_vencer": 1,
        "ajuste": 2,
        "fin_contrato": 1,
    }

    vencido = r.items[0]
    assert vencido.contrato_id == escenario.id
    assert vencido.referencia_id == escenario.cobros[0].id
    assert vencido.propiedad.titulo == "Depto en La Plata"
    assert [p.full_name for p in vencido.inquilinos] == ["Ana Pérez"]
    # Snapshot del período al crear el contrato (100.000): el ajuste aplicado se
    # agregó después y no toca cobros ya generados.
    assert vencido.monto == Decimal("100000.00")
    assert vencido.moneda == "ARS"

    ajuste = r.items[1]
    assert ajuste.detalle == "Ajuste ICL"
    assert ajuste.monto == Decimal("120000.00")  # monto vigente: el del ajuste aplicado
    atrasado = next(a for a in escenario.ajustes if a.fecha_prevista == HOY - timedelta(days=3))
    assert ajuste.referencia_id == atrasado.id

    fin = r.items[4]
    assert fin.detalle == "Termina el contrato"
    assert fin.referencia_id == escenario.id
    assert fin.fecha == escenario.fecha_fin


def test_la_ventana_acota_lo_futuro_pero_no_lo_atrasado(db, escenario):
    r = recordatorios.listar(db, HOY, dias=7)
    assert [(i.tipo, i.dias) for i in r.items] == [("cobro_vencido", -5), ("ajuste", -3)]

    r = recordatorios.listar(db, HOY, dias=60)
    assert r.total == 6
    assert r.items[-1].tipo == "cobro_por_vencer" and r.items[-1].dias == 50


def test_no_aparecen_contratos_no_vigentes_ni_cobros_anulados_ni_ajustes_resueltos(
    db, usuario, escenario
):
    escenario.estado = EstadoContrato.finalizado
    db.commit()
    assert recordatorios.listar(db, HOY, dias=60).total == 0

    otro = _con_fechas(db, usuario.id, indice="sin_ajuste", fecha_fin=HOY + timedelta(days=400))
    _fijar_cobros(otro, [HOY - timedelta(days=5)])
    otro.cobros[0].estado = EstadoCobro.anulado
    otro.ajustes.append(Ajuste(fecha_prevista=HOY + timedelta(days=2), estado=EstadoAjuste.omitido))
    db.commit()
    assert recordatorios.listar(db, HOY, dias=60).total == 0


def test_fin_de_contrato_ya_renovado_lo_dice(db, usuario, escenario):
    _fijar_cobros(escenario, [])  # sin cobros con saldo, para aislar el fin
    escenario.ajustes.clear()
    # No administrado: si generara cobros, el primero vencería dentro de la ventana.
    nuevo = crear_contrato_de_prueba(
        db,
        usuario.id,
        fecha_inicio=escenario.fecha_fin + timedelta(days=1),
        fecha_fin=escenario.fecha_fin + timedelta(days=365),
        administrado=False,
    )
    nuevo.contrato_anterior_id = escenario.id
    db.commit()
    db.expire_all()

    r = recordatorios.listar(db, HOY, dias=30)
    assert [i.tipo for i in r.items] == ["fin_contrato"]
    assert r.items[0].detalle == "Termina el contrato · renovado"


# ---------------------------------------------------------------------------
# GET /recordatorios
# ---------------------------------------------------------------------------


def test_get_usa_la_ventana_de_la_inmobiliaria_y_acepta_dias(client, iniciar_sesion, escenario):
    iniciar_sesion()
    r = client.get("/api/v1/alquileres/recordatorios")
    assert r.status_code == 200, r.text
    assert r.json()["dias"] == 30 and r.json()["total"] == 5
    assert r.json()["items"][0]["tipo"] == "cobro_vencido"
    assert r.json()["items"][0]["propiedad"]["titulo"] == "Depto en La Plata"

    r = client.put("/api/v1/inmobiliaria", json={"dias_aviso_recordatorios": 60})
    assert r.status_code == 200
    assert client.get("/api/v1/alquileres/recordatorios").json()["total"] == 6

    assert client.get("/api/v1/alquileres/recordatorios?dias=7").json()["total"] == 2
    assert client.get("/api/v1/alquileres/recordatorios?dias=0").status_code == 422


def test_get_exige_sesion(client):
    assert client.get("/api/v1/alquileres/recordatorios").status_code == 401


# ---------------------------------------------------------------------------
# POST /recordatorios/enviar
# ---------------------------------------------------------------------------

URL_ENVIAR = "/api/v1/alquileres/recordatorios/enviar"


@pytest.fixture
def smtp_configurado(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "smtp_host", "smtp.ejemplo.com")
    monkeypatch.setattr(s, "smtp_user", "mambo")
    monkeypatch.setattr(s, "smtp_password", "clave")
    monkeypatch.setattr(s, "email_from", "Mambo <no-reply@mambo.com.ar>")


@pytest.fixture
def token(monkeypatch):
    monkeypatch.setattr(get_settings(), "recordatorios_token", "secreto")
    return {"X-Recordatorios-Token": "secreto"}


@pytest.fixture
def emails_enviados(monkeypatch):
    capturados: list[tuple] = []

    def _falso(destinatario, asunto, cuerpo, adjuntos=()):
        capturados.append((destinatario, asunto, cuerpo, list(adjuntos)))

    monkeypatch.setattr(modulo_email, "enviar_email", _falso)
    monkeypatch.setattr(recordatorios, "enviar_email", _falso)
    return capturados


def test_sin_token_configurado_es_404(client, monkeypatch, smtp_configurado):
    monkeypatch.setattr(get_settings(), "recordatorios_token", None)
    r = client.post(URL_ENVIAR, headers={"X-Recordatorios-Token": "lo-que-sea"})
    assert r.status_code == 404


def test_token_incorrecto_o_ausente_es_401(client, token, smtp_configurado):
    assert client.post(URL_ENVIAR).status_code == 401
    assert client.post(URL_ENVIAR, headers={"X-Recordatorios-Token": "otro"}).status_code == 401


def test_destinatarios_son_staff_y_admin_activos(db, crear_usuario):
    from datetime import UTC, datetime

    crear_usuario(email="admin@mambo.com.ar", roles=("admin",))
    crear_usuario(email="staff@mambo.com.ar", roles=("staff",))
    crear_usuario(email="ambos@mambo.com.ar", roles=("staff", "admin"))
    crear_usuario(email="inactivo@mambo.com.ar", roles=("staff",), is_active=False)
    crear_usuario(email="sinrol@mambo.com.ar", roles=())
    borrado = crear_usuario(email="borrado@mambo.com.ar", roles=("staff",))
    borrado.deleted_at = datetime.now(UTC)
    db.commit()

    assert recordatorios.destinatarios_staff(db) == [
        "admin@mambo.com.ar",
        "ambos@mambo.com.ar",
        "staff@mambo.com.ar",
    ]


def test_enviar_manda_la_bandeja_al_staff(
    client, db, crear_usuario, escenario, token, smtp_configurado, emails_enviados
):
    crear_usuario(email="staff@mambo.com.ar", roles=("staff",))

    r = client.post(URL_ENVIAR, headers=token)

    assert r.status_code == 200, r.text
    assert r.json() == {"enviado_a": ["admin@mambo.com.ar", "staff@mambo.com.ar"], "items": 5}
    assert len(emails_enviados) == 1
    destinatario, asunto, cuerpo, adjuntos = emails_enviados[0]
    assert destinatario == "admin@mambo.com.ar, staff@mambo.com.ar"
    assert asunto.startswith("Recordatorios Mambo Groups · ")
    assert asunto.endswith(" · 5 pendientes")
    assert adjuntos == []
    # Los cuatro grupos, en orden, y el atraso en días.
    posiciones = [
        cuerpo.index("COBROS VENCIDOS (1)"),
        cuerpo.index("COBROS POR VENCER (1)"),
        cuerpo.index("AJUSTES (2)"),
        cuerpo.index("CONTRATOS QUE TERMINAN (1)"),
    ]
    assert posiciones == sorted(posiciones)
    assert "Depto en La Plata · Ana Pérez" in cuerpo
    assert "vencido hace 5 días" in cuerpo
    assert "Ajuste ICL · previsto" in cuerpo and "atrasado 3 días" in cuerpo
    assert "vence en 10 días" in cuerpo
    assert "termina" in cuerpo and "en 25 días" in cuerpo
    assert "saldo $ 100.000,00" in cuerpo
    assert "monto actual $ 120.000,00" in cuerpo


def test_bandeja_vacia_no_manda_nada(
    client, crear_usuario, token, smtp_configurado, emails_enviados
):
    crear_usuario()
    r = client.post(URL_ENVIAR, headers=token)
    assert r.status_code == 200
    assert r.json() == {"enviado_a": [], "items": 0}
    assert emails_enviados == []


def test_sin_smtp_es_409(client, escenario, token, monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "smtp_host", None)
    monkeypatch.setattr(s, "email_from", None)
    r = client.post(URL_ENVIAR, headers=token)
    assert r.status_code == 409
    assert "Email no configurado" in r.json()["detail"]


def test_sin_staff_es_409(client, db, escenario, token, smtp_configurado, emails_enviados):
    # El único usuario es el admin que creó el escenario: se lo desactiva.
    for u in db.query(recordatorios.User).all():
        u.is_active = False
    db.commit()
    r = client.post(URL_ENVIAR, headers=token)
    assert r.status_code == 409
    assert "staff" in r.json()["detail"]


def test_fallo_de_smtp_es_502(client, escenario, token, smtp_configurado, monkeypatch):
    def _explota(*args, **kwargs):
        raise modulo_email.EmailNoEnviado("se cortó")

    monkeypatch.setattr(recordatorios, "enviar_email", _explota)
    r = client.post(URL_ENVIAR, headers=token)
    assert r.status_code == 502
    assert "se cortó" in r.json()["detail"]
