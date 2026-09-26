"""Bloque 3: documentos adjuntos a propiedad, persona, operación o contrato."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import text

from app.modules.propiedades.models import Propiedad
from app.platform.alquileres.models import Contrato
from app.platform.deals.models import Deal
from app.platform.documentos.models import Documento
from app.platform.people.models import Person
from tests.helpers_crm import (
    crear_contrato_de_prueba,
    crear_deal,
    crear_persona,
    crear_propiedad,
)


@pytest.fixture
def sesion(client, crear_usuario, iniciar_sesion, media_tmp):
    usuario = crear_usuario()
    iniciar_sesion()
    return usuario


def test_modelo_documento_se_persiste_con_una_fk(db, sesion):
    prop = crear_propiedad(db)
    doc = Documento(
        tipo="boleto",
        propiedad_id=prop.id,
        archivo_url="/media/documentos/propiedad/1/x.pdf",
        archivo_key="documentos/propiedad/1/x.pdf",
        nombre_original="boleto.pdf",
        tamano_bytes=10,
        subido_por_user_id=sesion.id,
        created_at=datetime.now(UTC),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    assert doc.id is not None
    assert doc.persona_id is None and doc.deal_id is None and doc.contrato_id is None
    assert doc.subido_por == sesion.name


API = "/api/v1/documentos"


def _pdf(nombre: str = "doc.pdf") -> dict:
    return {"archivo": (nombre, b"%PDF-1.4 contenido", "application/pdf")}


@pytest.mark.parametrize(
    "campo",
    ["propiedad_id", "persona_id", "deal_id", "contrato_id"],
)
def test_subir_a_cada_entidad(client, db, sesion, media_tmp, campo):
    ids = {
        "propiedad_id": lambda: crear_propiedad(db).id,
        "persona_id": lambda: crear_persona(db).id,
        "deal_id": lambda: crear_deal(client, db),
        "contrato_id": lambda: crear_contrato_de_prueba(db, sesion.id).id,
    }
    entidad_id = ids[campo]()

    r = client.post(API, data={"tipo": "dni", campo: str(entidad_id)}, files=_pdf("dni_ana.pdf"))
    assert r.status_code == 201, r.text
    cuerpo = r.json()
    assert cuerpo["tipo"] == "dni"
    assert cuerpo["nombre_original"] == "dni_ana.pdf"
    assert cuerpo["tamano_bytes"] == len(b"%PDF-1.4 contenido")
    assert cuerpo["subido_por"] == sesion.name
    assert cuerpo["archivo_url"].endswith(".pdf")

    doc = db.get(Documento, cuerpo["id"])
    assert getattr(doc, campo) == entidad_id
    otras = {"propiedad_id", "persona_id", "deal_id", "contrato_id"} - {campo}
    assert all(getattr(doc, otra) is None for otra in otras)
    carpeta = campo.removesuffix("_id")
    assert doc.archivo_key.startswith(f"documentos/{carpeta}/{entidad_id}/")
    assert (media_tmp / doc.archivo_key).exists()


def test_sin_entidad_o_con_dos_422(client, db, sesion):
    prop = crear_propiedad(db)
    persona = crear_persona(db)

    r = client.post(API, data={"tipo": "dni"}, files=_pdf())
    assert r.status_code == 422
    assert "exactamente una entidad" in r.json()["detail"]

    r = client.post(
        API,
        data={"tipo": "dni", "propiedad_id": str(prop.id), "persona_id": str(persona.id)},
        files=_pdf(),
    )
    assert r.status_code == 422

    assert client.get(API).status_code == 422
    assert client.get(f"{API}?propiedad_id={prop.id}&persona_id={persona.id}").status_code == 422


def test_entidad_inexistente_404(client, db, sesion):
    r = client.post(API, data={"tipo": "dni", "propiedad_id": "9999"}, files=_pdf())
    assert r.status_code == 404
    assert r.json()["detail"] == "Propiedad no encontrada"

    r = client.post(API, data={"tipo": "dni", "persona_id": "9999"}, files=_pdf())
    assert r.status_code == 404
    assert r.json()["detail"] == "Persona no encontrada"

    r = client.post(API, data={"tipo": "dni", "deal_id": "9999"}, files=_pdf())
    assert r.status_code == 404
    assert r.json()["detail"] == "Deal no encontrado"

    r = client.post(API, data={"tipo": "dni", "contrato_id": "9999"}, files=_pdf())
    assert r.status_code == 404
    assert r.json()["detail"] == "Contrato no encontrado"


def test_deal_soft_deleted_404(client, db, sesion):
    deal_id = crear_deal(client, db)
    assert client.delete(f"/api/v1/deals/{deal_id}").status_code == 204
    assert db.get(Deal, deal_id).deleted_at is not None

    r = client.post(API, data={"tipo": "boleto", "deal_id": str(deal_id)}, files=_pdf())
    assert r.status_code == 404


def test_tipo_fuera_del_catalogo_422(client, db, sesion):
    prop = crear_propiedad(db)
    r = client.post(API, data={"tipo": "escritura", "propiedad_id": str(prop.id)}, files=_pdf())
    assert r.status_code == 422


def test_archivo_invalido_422_y_grande_413(client, db, sesion):
    prop = crear_propiedad(db)
    r = client.post(
        API,
        data={"tipo": "otro", "propiedad_id": str(prop.id)},
        files={"archivo": ("a.txt", b"hola", "text/plain")},
    )
    assert r.status_code == 422
    assert r.json()["detail"] == "El documento debe ser PDF o imagen (JPG, PNG, HEIC)"

    grande = b"%PDF" + b"0" * (10 * 1024 * 1024 + 1)
    r = client.post(
        API,
        data={"tipo": "otro", "propiedad_id": str(prop.id)},
        files={"archivo": ("a.pdf", grande, "application/pdf")},
    )
    assert r.status_code == 413
    assert r.json()["detail"] == "El documento supera los 10 MB"


def test_listar_filtra_por_entidad_y_ordena_desc(client, db, sesion, media_tmp):
    prop_a = crear_propiedad(db, titulo="A")
    prop_b = crear_propiedad(db, titulo="B")
    client.post(API, data={"tipo": "boleto", "propiedad_id": str(prop_a.id)}, files=_pdf("1.pdf"))
    client.post(API, data={"tipo": "dni", "propiedad_id": str(prop_a.id)}, files=_pdf("2.pdf"))
    client.post(API, data={"tipo": "otro", "propiedad_id": str(prop_b.id)}, files=_pdf("3.pdf"))

    r = client.get(f"{API}?propiedad_id={prop_a.id}")
    assert r.status_code == 200
    nombres = [d["nombre_original"] for d in r.json()]
    assert nombres == ["2.pdf", "1.pdf"]

    assert [d["nombre_original"] for d in client.get(f"{API}?propiedad_id={prop_b.id}").json()] == [
        "3.pdf"
    ]


def test_anonimo_401(client, db):
    prop = crear_propiedad(db)
    assert client.get(f"{API}?propiedad_id={prop.id}").status_code == 401
    r = client.post(API, data={"tipo": "dni", "propiedad_id": str(prop.id)}, files=_pdf())
    assert r.status_code == 401


def test_borrar_quita_fila_y_archivo(client, db, sesion, media_tmp):
    prop = crear_propiedad(db)
    r = client.post(API, data={"tipo": "boleto", "propiedad_id": str(prop.id)}, files=_pdf())
    doc_id = r.json()["id"]
    clave = db.get(Documento, doc_id).archivo_key
    assert (media_tmp / clave).exists()

    assert client.delete(f"{API}/{doc_id}").status_code == 204
    assert db.get(Documento, doc_id) is None
    assert not (media_tmp / clave).exists()

    r = client.delete(f"{API}/{doc_id}")
    assert r.status_code == 404
    assert r.json()["detail"] == "Documento no encontrado"


def test_borrar_anonimo_401(client, db):
    assert client.delete(f"{API}/1").status_code == 401


def _subir_y_obtener(client, db, campo: str, entidad_id: int) -> Documento:
    r = client.post(API, data={"tipo": "otro", campo: str(entidad_id)}, files=_pdf())
    assert r.status_code == 201, r.text
    return db.get(Documento, r.json()["id"])


def _borrar_con_fks(db, fila) -> None:
    """SQLite no aplica FKs por defecto y el engine de conftest no lo activa.
    Se activa solo en esta sesión, fuera de transacción, para probar el CASCADE.

    El commit final expira los objetos de la sesión (expire_on_commit por
    defecto) y el `documento` cascadeado se borra a nivel de motor, sin que el
    ORM se entere: si el test lee un atributo del objeto viejo después de este
    commit, SQLAlchemy intenta refrescarlo y explota con `ObjectDeletedError`.
    Por eso el id del documento hay que leerlo *antes* de llamar a esta función.
    """
    db.commit()
    db.execute(text("PRAGMA foreign_keys=ON"))
    db.delete(fila)
    db.commit()


def test_cascade_propiedad(client, db, sesion, media_tmp):
    prop = crear_propiedad(db)
    doc = _subir_y_obtener(client, db, "propiedad_id", prop.id)
    doc_id = doc.id  # ver nota en _borrar_con_fks: hay que leerlo antes del cascade
    _borrar_con_fks(db, db.get(Propiedad, prop.id))
    assert db.get(Documento, doc_id) is None


def test_cascade_persona(client, db, sesion, media_tmp):
    persona = crear_persona(db)
    doc = _subir_y_obtener(client, db, "persona_id", persona.id)
    doc_id = doc.id
    _borrar_con_fks(db, db.get(Person, persona.id))
    assert db.get(Documento, doc_id) is None


def test_cascade_deal(client, db, sesion, media_tmp):
    deal_id = crear_deal(client, db)
    doc = _subir_y_obtener(client, db, "deal_id", deal_id)
    doc_id = doc.id
    _borrar_con_fks(db, db.get(Deal, deal_id))
    assert db.get(Documento, doc_id) is None


def test_cascade_contrato(client, db, sesion, media_tmp):
    contrato = crear_contrato_de_prueba(db, sesion.id)
    doc = _subir_y_obtener(client, db, "contrato_id", contrato.id)
    doc_id = doc.id
    _borrar_con_fks(db, db.get(Contrato, contrato.id))
    assert db.get(Documento, doc_id) is None


def test_nombre_original_se_trunca_a_255(client, db, sesion, media_tmp):
    prop = crear_propiedad(db)
    largo = "a" * 300 + ".pdf"
    r = client.post(API, data={"tipo": "otro", "propiedad_id": str(prop.id)}, files=_pdf(largo))
    assert r.status_code == 201, r.text
    assert len(r.json()["nombre_original"]) == 255
