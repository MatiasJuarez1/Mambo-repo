"""El CRM tiene que vivir bajo /api/v1: el proxy de Vercel solo reenvía /api/* y /auth/*."""


def test_crm_montado_bajo_api_v1(client, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()

    assert client.get("/api/v1/people").status_code == 200
    assert client.get("/api/v1/reservations").status_code == 200
    assert client.get("/api/v1/deals").status_code == 200
    assert client.get("/api/v1/pipelines").status_code == 200
    assert client.get("/api/v1/activities").status_code == 200
    # auth se queda en la raíz: ya está proxiado y el frontend lo usa
    assert client.get("/auth/me").status_code == 200


def test_crm_ya_no_responde_en_la_raiz(client, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()

    assert client.get("/people").status_code == 404
    assert client.get("/deals").status_code == 404
