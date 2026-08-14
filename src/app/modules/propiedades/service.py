import io
from collections.abc import Sequence
from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import case
from sqlalchemy.orm import Session

# Registra el decodificador HEIC/HEIF (fotos de iPhone) en Pillow. Es opcional:
# si la librería no está instalada, el resto de los formatos sigue funcionando.
try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:
    pass

from app.modules.propiedades.models import (
    EstadoComercial,
    Propiedad,
    PropiedadCaracteristica,
    PropiedadMedio,
    PropiedadUbicacion,
    TipoMedio,
    TipoOperacion,
    TipoPropiedad,
)
from app.modules.propiedades.schemas import (
    CaracteristicaCreate,
    MedioCreate,
    PropiedadCreate,
    PropiedadUpdate,
)
from app.storage import borrar_imagen, guardar_imagen


def listar_propiedades(
    db: Session,
    tipo_propiedad: TipoPropiedad | None = None,
    tipo_operacion: TipoOperacion | None = None,
    estado_comercial: EstadoComercial | None = None,
    ciudad: str | None = None,
    precio_min: Decimal | None = None,
    precio_max: Decimal | None = None,
    skip: int = 0,
    limit: int = 20,
    estados: Sequence[EstadoComercial] | None = None,
) -> list[Propiedad]:
    """Listado de propiedades con filtros opcionales.

    Hay dos filtros de estado porque cubren dos usos distintos y conviven:
    `estado_comercial` acota a uno exacto (el que usa el admin), mientras que
    `estados` acepta un conjunto, que es lo que necesita el sitio público para
    mostrar las operaciones ya cerradas junto a las disponibles sin arrastrar las
    dadas de baja. Si se pasan los dos, se aplican ambos.
    """
    query = db.query(Propiedad).filter(Propiedad.eliminado_en.is_(None))

    if tipo_propiedad:
        query = query.filter(Propiedad.tipo_propiedad == tipo_propiedad)
    if tipo_operacion:
        query = query.filter(Propiedad.tipo_operacion == tipo_operacion)
    if estado_comercial:
        query = query.filter(Propiedad.estado_comercial == estado_comercial)
    if estados:
        query = query.filter(Propiedad.estado_comercial.in_(estados))
    if precio_min is not None:
        query = query.filter(Propiedad.precio >= precio_min)
    if precio_max is not None:
        query = query.filter(Propiedad.precio <= precio_max)
    if ciudad:
        query = query.join(PropiedadUbicacion).filter(
            PropiedadUbicacion.ciudad.ilike(f"%{ciudad}%")
        )

    # Las disponibles van primero y recién después las reservadas/cerradas/bajas.
    # El orden vive acá y no en el frontend porque `limit` recorta ANTES de que el
    # cliente reciba nada: ordenar allá dejaría el inventario vigente fuera de la
    # primera página en cuanto se acumulen operaciones cerradas.
    prioridad_estado = case(
        (Propiedad.estado_comercial == EstadoComercial.disponible, 0),
        else_=1,
    )

    return (
        query.order_by(prioridad_estado, Propiedad.creado_en.desc(), Propiedad.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def listar_ciudades(db: Session) -> list[str]:
    """Devuelve las ciudades que tienen al menos una propiedad publicada.

    Se usa para alimentar el desplegable de zonas del frontend: solo interesan las
    ciudades con propiedades vigentes (no eliminadas) y disponibles. Se descartan
    las ubicaciones sin ciudad cargada (nula o cadena vacía) y el resultado viene
    sin repetidos y ordenado alfabéticamente.
    """
    filas = (
        db.query(PropiedadUbicacion.ciudad)
        .join(Propiedad, Propiedad.id == PropiedadUbicacion.propiedad_id)
        .filter(
            Propiedad.eliminado_en.is_(None),
            Propiedad.estado_comercial == EstadoComercial.disponible,
            PropiedadUbicacion.ciudad.isnot(None),
            PropiedadUbicacion.ciudad != "",
        )
        .distinct()
        .order_by(PropiedadUbicacion.ciudad)
        .all()
    )
    return [fila[0] for fila in filas]


def obtener_propiedad(db: Session, propiedad_id: int) -> Propiedad:
    prop = db.query(Propiedad).filter(
        Propiedad.id == propiedad_id,
        Propiedad.eliminado_en.is_(None),
    ).first()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Propiedad no encontrada")
    return prop


def crear_propiedad(db: Session, data: PropiedadCreate) -> Propiedad:
    prop = Propiedad(
        titulo=data.titulo,
        descripcion=data.descripcion,
        tipo_propiedad=data.tipo_propiedad,
        tipo_operacion=data.tipo_operacion,
        estado_comercial=data.estado_comercial,
        moneda=data.moneda,
        precio=data.precio,
        dormitorios=data.dormitorios,
        banos=data.banos,
        m2_cubiertos=data.m2_cubiertos,
        m2_totales=data.m2_totales,
        propietario_persona_id=data.propietario_persona_id,
    )
    db.add(prop)
    db.flush()

    if data.ubicacion:
        db.add(PropiedadUbicacion(propiedad_id=prop.id, **data.ubicacion.model_dump()))

    for medio_data in data.medios:
        db.add(PropiedadMedio(propiedad_id=prop.id, **medio_data.model_dump()))

    for caract_data in data.caracteristicas:
        db.add(PropiedadCaracteristica(propiedad_id=prop.id, **caract_data.model_dump()))

    db.commit()
    db.refresh(prop)
    return prop


def actualizar_propiedad(db: Session, propiedad_id: int, data: PropiedadUpdate) -> Propiedad:
    prop = obtener_propiedad(db, propiedad_id)

    campos = data.model_dump(exclude_unset=True, exclude={"ubicacion"})
    for field, value in campos.items():
        setattr(prop, field, value)

    if data.ubicacion is not None:
        if prop.ubicacion:
            for field, value in data.ubicacion.model_dump(exclude_unset=True).items():
                setattr(prop.ubicacion, field, value)
        else:
            db.add(PropiedadUbicacion(propiedad_id=prop.id, **data.ubicacion.model_dump()))

    db.commit()
    db.refresh(prop)
    return prop


def eliminar_propiedad(db: Session, propiedad_id: int) -> None:
    prop = obtener_propiedad(db, propiedad_id)
    prop.eliminado_en = datetime.utcnow()
    db.commit()


def agregar_medio(db: Session, propiedad_id: int, data: MedioCreate) -> PropiedadMedio:
    obtener_propiedad(db, propiedad_id)
    medio = PropiedadMedio(propiedad_id=propiedad_id, **data.model_dump())
    db.add(medio)
    db.commit()
    db.refresh(medio)
    return medio


MAX_BYTES_IMAGEN = 8 * 1024 * 1024  # 8 MB

# Lado máximo (px) al que se redimensiona la imagen; las que ya son más chicas
# no se agrandan. Mantiene las fotos livianas sin depender del navegador.
MAX_LADO_PX = 1920

# Formato real detectado por Pillow (imagen.format) -> extensión de guardado.
# Nos basamos en el contenido del archivo, NO en el content_type del navegador:
# en Windows suele llegar vacío o como "application/octet-stream" para imágenes
# perfectamente válidas, y así se rechazaban fotos legítimas. HEIC/HEIF (iPhone)
# y MPO (JPEG multi-imagen de algunas cámaras) se convierten a JPG al guardar.
FORMATOS_SOPORTADOS = {
    "JPEG": ".jpg",
    "PNG": ".png",
    "WEBP": ".webp",
    "GIF": ".gif",
    "HEIF": ".jpg",
    "MPO": ".jpg",
}


def _procesar_imagen(contenido: bytes) -> tuple[bytes, str]:
    """Valida y normaliza una imagen en el servidor con Pillow.

    - Detecta el formato real leyendo los bytes (no confía en el content_type que
      manda el navegador, que no es fiable) y rechaza los no soportados.
    - Corrige la orientación según los metadatos EXIF (fotos de celular).
    - Redimensiona si supera `MAX_LADO_PX` para no guardar archivos enormes.
    - Convierte HEIC/HEIF de iPhone a JPG.

    Los GIF (posiblemente animados) se devuelven sin tocar para no perder los
    fotogramas. Devuelve `(bytes_procesados, extension)` listos para escribir a disco.
    """
    try:
        imagen = Image.open(io.BytesIO(contenido))
        imagen.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo no es una imagen válida.",
        ) from exc

    formato = imagen.format
    if formato not in FORMATOS_SOPORTADOS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato no soportado. Subí una imagen JPG, PNG, WEBP, GIF o HEIC.",
        )

    extension = FORMATOS_SOPORTADOS[formato]

    # GIF (posiblemente animado): se devuelve tal cual para no perder fotogramas.
    if formato == "GIF":
        return contenido, extension

    imagen = ImageOps.exif_transpose(imagen)  # respeta la orientación de la cámara
    imagen.thumbnail((MAX_LADO_PX, MAX_LADO_PX))  # solo reduce, nunca agranda

    # HEIC/HEIF y MPO se guardan como JPEG; el resto conserva su formato.
    formato_salida = "JPEG" if formato in ("HEIF", "MPO") else formato
    if formato_salida == "JPEG" and imagen.mode != "RGB":
        imagen = imagen.convert("RGB")  # JPEG no soporta canal alfa

    salida = io.BytesIO()
    imagen.save(salida, format=formato_salida, optimize=True)
    return salida.getvalue(), extension


def subir_medio(
    db: Session,
    propiedad_id: int,
    archivo: UploadFile,
    descripcion: str | None = None,
    es_principal: bool = False,
) -> PropiedadMedio:
    """Guarda un archivo de imagen y registra el medio en la DB.

    Dónde queda el binario lo decide `app.storage` según `STORAGE_BACKEND`: en
    disco durante el desarrollo, en Cloudinary en producción. Acá solo se guardan
    la URL pública y la clave con la que después se lo puede borrar.
    """
    obtener_propiedad(db, propiedad_id)

    contenido = archivo.file.read()
    if len(contenido) > MAX_BYTES_IMAGEN:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="La imagen supera el máximo de 8 MB.",
        )

    # El backend detecta el formato real, valida y normaliza la imagen (no el navegador).
    contenido, extension = _procesar_imagen(contenido)

    guardado = guardar_imagen(contenido, extension)

    # El orden es la cantidad de medios ya existentes; si es la primera foto de la
    # propiedad se marca como principal por defecto.
    medios_existentes = (
        db.query(PropiedadMedio).filter(PropiedadMedio.propiedad_id == propiedad_id).count()
    )

    medio = PropiedadMedio(
        propiedad_id=propiedad_id,
        tipo_medio=TipoMedio.imagen,
        url=guardado.url,
        storage_key=guardado.clave,
        descripcion=descripcion,
        orden=medios_existentes,
        es_principal=es_principal or medios_existentes == 0,
    )
    db.add(medio)
    db.commit()
    db.refresh(medio)
    return medio


def eliminar_medio(db: Session, propiedad_id: int, medio_id: int) -> None:
    obtener_propiedad(db, propiedad_id)
    medio = db.query(PropiedadMedio).filter(
        PropiedadMedio.id == medio_id,
        PropiedadMedio.propiedad_id == propiedad_id,
    ).first()
    if not medio:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medio no encontrado")

    # Se borra primero el archivo y después la fila. `borrar_imagen` no propaga
    # errores del proveedor a propósito (ver su docstring): dejar la foto rota en
    # la web sería peor que dejar un archivo huérfano en el CDN.
    borrar_imagen(medio.url, medio.storage_key)

    db.delete(medio)
    db.commit()


def agregar_caracteristica(
    db: Session, propiedad_id: int, data: CaracteristicaCreate
) -> PropiedadCaracteristica:
    obtener_propiedad(db, propiedad_id)
    caract = PropiedadCaracteristica(propiedad_id=propiedad_id, **data.model_dump())
    db.add(caract)
    db.commit()
    db.refresh(caract)
    return caract


def eliminar_caracteristica(db: Session, propiedad_id: int, caracteristica_id: int) -> None:
    obtener_propiedad(db, propiedad_id)
    caract = db.query(PropiedadCaracteristica).filter(
        PropiedadCaracteristica.id == caracteristica_id,
        PropiedadCaracteristica.propiedad_id == propiedad_id,
    ).first()
    if not caract:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Característica no encontrada"
        )
    db.delete(caract)
    db.commit()
