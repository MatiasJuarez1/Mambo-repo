import logging
from datetime import datetime
from io import BytesIO
from pathlib import PurePosixPath
from urllib.parse import urlsplit
from zipfile import ZipFile

import httpx
from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app import storage
from app.modules.propiedades.models import Propiedad, TipoMedio
from app.modules.publicaciones.models import EstadoPublicacion, Publicacion
from app.modules.publicaciones.schemas import PublicacionCreate, PublicacionUpdate

logger = logging.getLogger(__name__)

# Las fotos de terceros (las del seed) viven en un servidor que no controlamos:
# si no contesta rápido se saltea esa foto en vez de hacer esperar al agente.
TIMEOUT_FOTO_EXTERNA = 10


def listar_publicaciones(
    db: Session,
    estado: EstadoPublicacion | None = None,
    propiedad_id: int | None = None,
    skip: int = 0,
    limit: int = 20,
) -> list[Publicacion]:
    query = db.query(Publicacion).filter(Publicacion.eliminado_en.is_(None))

    if estado:
        query = query.filter(Publicacion.estado == estado)
    if propiedad_id:
        query = query.filter(Publicacion.propiedad_id == propiedad_id)

    # `PublicacionListItem` anida un `PropiedadListItem` entero.
    propiedad = joinedload(Publicacion.propiedad)
    return (
        query.options(
            propiedad.joinedload(Propiedad.ubicacion),
            propiedad.joinedload(Propiedad.propietario),
            propiedad.selectinload(Propiedad.medios),
        )
        .order_by(Publicacion.publicada_en.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def listar_publicaciones_activas(
    db: Session,
    propiedad_id: int | None = None,
    skip: int = 0,
    limit: int = 20,
) -> list[Publicacion]:
    """Endpoint público: solo devuelve publicaciones activas."""
    return listar_publicaciones(db, EstadoPublicacion.activa, propiedad_id, skip, limit)


def obtener_publicacion(db: Session, publicacion_id: int) -> Publicacion:
    pub = (
        db.query(Publicacion)
        .filter(
            Publicacion.id == publicacion_id,
            Publicacion.eliminado_en.is_(None),
        )
        .first()
    )
    if not pub:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Publicación no encontrada"
        )
    return pub


def _validar_slug_disponible(db: Session, slug: str | None, excluir_id: int | None = None) -> None:
    """Corta antes de que la restricción UNIQUE de la base tire un IntegrityError.

    No hay ningún exception_handler de IntegrityError en la app, así que sin este
    chequeo el segundo aviso con el mismo slug rompe con un 500 en texto plano.
    A propósito no filtra por `eliminado_en`: el borrado es lógico, la fila (y su
    slug) sigue existiendo en la tabla y sigue chocando contra el UNIQUE real.
    Dejar reusar el slug de una publicación borrada sería prometer algo que la
    base no cumple.
    """
    if not slug:
        return
    query = db.query(Publicacion.id).filter(Publicacion.slug == slug)
    if excluir_id is not None:
        query = query.filter(Publicacion.id != excluir_id)
    if query.first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una publicación con ese slug",
        )


def crear_publicacion(db: Session, data: PublicacionCreate) -> Publicacion:
    _validar_slug_disponible(db, data.slug)
    pub = Publicacion(
        propiedad_id=data.propiedad_id,
        titulo=data.titulo,
        descripcion=data.descripcion,
        estado=data.estado,
        precio_publicado=data.precio_publicado,
        moneda_publicada=data.moneda_publicada,
        slug=data.slug,
        publicada_en=datetime.utcnow() if data.estado == EstadoPublicacion.activa else None,
    )
    db.add(pub)
    db.commit()
    db.refresh(pub)
    return pub


def actualizar_publicacion(
    db: Session, publicacion_id: int, data: PublicacionUpdate
) -> Publicacion:
    pub = obtener_publicacion(db, publicacion_id)

    campos = data.model_dump(exclude_unset=True)
    if "slug" in campos:
        _validar_slug_disponible(db, campos["slug"], excluir_id=publicacion_id)
    for field, value in campos.items():
        setattr(pub, field, value)

    # Registrar fecha de publicación cuando se activa por primera vez
    if data.estado == EstadoPublicacion.activa and pub.publicada_en is None:
        pub.publicada_en = datetime.utcnow()

    db.commit()
    db.refresh(pub)
    return pub


def eliminar_publicacion(db: Session, publicacion_id: int) -> None:
    pub = obtener_publicacion(db, publicacion_id)
    pub.eliminado_en = datetime.utcnow()
    pub.estado = EstadoPublicacion.eliminada
    db.commit()


def _bytes_de_foto(medio) -> bytes:
    """Trae los bytes del original de una foto.

    Por `storage_key` cuando el archivo es nuestro —funciona igual en local y en
    R2— y por HTTP cuando no lo es: los medios del seed apuntan a URLs de
    terceros y no tienen clave con la que buscarlos en el almacenamiento.
    """
    if medio.storage_key:
        return storage.leer_archivo(medio.storage_key)

    respuesta = httpx.get(medio.url, timeout=TIMEOUT_FOTO_EXTERNA)
    respuesta.raise_for_status()
    return respuesta.content


def _texto_descripcion(pub: Publicacion) -> str:
    """El .txt que acompaña a las fotos: lo que el agente pega en la red social."""
    lineas = [pub.titulo, ""]
    if pub.precio_publicado is not None:
        lineas.append(f"Precio: {pub.moneda_publicada} {pub.precio_publicado}")
        lineas.append("")
    lineas.append(pub.descripcion or "")
    return "\n".join(lineas)


def generar_paquete_descarga(db: Session, publicacion_id: int) -> bytes:
    """ZIP con las fotos originales de la propiedad y el texto de la publicación.

    Solo fotos: `propiedades_medios` también guarda videos y documentos, que no
    sirven para un posteo y harían el paquete pesado sin que nadie los pidiera.
    Se mandan los originales y no las variantes reducidas porque en redes se
    quiere la mejor calidad disponible, no la miniatura de la web.
    """
    pub = obtener_publicacion(db, publicacion_id)
    fotos = [m for m in pub.propiedad.medios if m.tipo_medio == TipoMedio.imagen]

    buffer = BytesIO()
    with ZipFile(buffer, "w") as zf:
        for numero, medio in enumerate(fotos, start=1):
            try:
                contenido = _bytes_de_foto(medio)
            except Exception:  # noqa: BLE001 — una foto perdida no invalida el paquete
                logger.warning("No se pudo traer la foto %s de la publicación %s", medio.id, pub.id)
                continue
            # PurePosixPath(medio.url).suffix a secas no alcanza: las URLs de
            # terceros (CDNs firmados, Unsplash del seed) traen query string, y
            # el suffix se queda con todo lo que sigue al último punto —
            # ".jpg?token=abc123"—, que ni siquiera es un nombre de archivo
            # válido en Windows. Por eso se aísla el path antes de pedir el suffix.
            extension = PurePosixPath(urlsplit(medio.url).path).suffix or ".jpg"
            zf.writestr(f"foto-{numero:02d}{extension}", contenido)

        zf.writestr("descripcion.txt", _texto_descripcion(pub))

    return buffer.getvalue()
