from tests.helpers_crm import crear_persona, crear_propiedad


def test_respuestas_traen_al_propietario(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    persona = crear_persona(db)
    prop = crear_propiedad(db, propietario_persona_id=persona.id)
    sin = crear_propiedad(db, titulo="Sin dueño")

    detalle = client.get(f"/api/v1/propiedades/{prop.id}").json()
    assert detalle["propietario"] == {"id": persona.id, "full_name": "Ana Pérez"}

    lista = client.get(f"/api/v1/propiedades?propietario_persona_id={persona.id}").json()
    assert [p["id"] for p in lista] == [prop.id]
    assert lista[0]["propietario"]["full_name"] == "Ana Pérez"
    assert client.get(f"/api/v1/propiedades/{sin.id}").json()["propietario"] is None


def test_propietario_inexistente_da_404(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()

    r = client.post(
        "/api/v1/propiedades", json={"titulo": "Casa", "propietario_persona_id": 9999}
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "La persona 9999 no existe"

    prop = crear_propiedad(db)
    r = client.put(f"/api/v1/propiedades/{prop.id}", json={"propietario_persona_id": 9999})
    assert r.status_code == 404
