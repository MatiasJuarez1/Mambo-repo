from tests.helpers_crm import crear_persona


def test_put_reemplaza_el_conjunto_y_normaliza(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    persona = crear_persona(db)

    r = client.put(
        f"/api/v1/people/{persona.id}/tags",
        json={"tags": [" Inversor ", "inversor", "zona norte", ""]},
    )

    assert r.status_code == 200, r.text
    assert r.json()["tags"] == ["Inversor", "zona norte"]

    r = client.put(f"/api/v1/people/{persona.id}/tags", json={"tags": ["otra"]})
    assert r.json()["tags"] == ["otra"]


def test_listado_de_etiquetas_con_conteo(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    a, b = crear_persona(db), crear_persona(db, first_name="Bruno")
    client.put(f"/api/v1/people/{a.id}/tags", json={"tags": ["inversor", "zona norte"]})
    client.put(f"/api/v1/people/{b.id}/tags", json={"tags": ["Inversor"]})

    r = client.get("/api/v1/people/tags")

    assert r.status_code == 200
    assert r.json()[0] == {"nombre": "inversor", "cantidad": 2}
    assert r.json()[1]["nombre"] == "zona norte"


def test_filtro_por_etiqueta_sin_distinguir_mayusculas(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    a, b = crear_persona(db), crear_persona(db, first_name="Bruno")
    client.put(f"/api/v1/people/{a.id}/tags", json={"tags": ["Inversor"]})

    r = client.get("/api/v1/people?tag=inversor")

    assert [p["id"] for p in r.json()["items"]] == [a.id]
    assert r.json()["items"][0]["tags"] == ["Inversor"]
    assert b.id not in [p["id"] for p in r.json()["items"]]
