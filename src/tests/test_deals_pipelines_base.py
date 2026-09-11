from app.platform.deals.models import Pipeline
from app.platform.deals.service import sembrar_pipelines_base
from tests.helpers_crm import etapa, pipeline_por_nombre


def test_siembra_venta_y_alquiler_una_sola_vez(db):
    sembrar_pipelines_base(db)
    sembrar_pipelines_base(db)

    nombres = sorted(p.name for p in db.query(Pipeline).all())
    assert nombres == ["Alquiler", "Venta"]
    venta = pipeline_por_nombre(db, "Venta")
    assert [s.name for s in venta.stages] == ["Consulta", "Visita", "Oferta", "Ganada", "Perdida"]
    assert etapa(venta, "Ganada").is_won and etapa(venta, "Perdida").is_lost


def test_no_se_borra_la_etapa_ganada(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    venta = pipeline_por_nombre(db, "Venta")
    ganada = etapa(venta, "Ganada")

    r = client.delete(f"/api/v1/pipelines/{venta.id}/stages/{ganada.id}")

    assert r.status_code == 409
    assert "ganada" in r.json()["detail"].lower()
