"""Almacenamiento de los archivos subidos (fotos de propiedades).

Dos backends detrás de la misma interfaz, elegidos por `STORAGE_BACKEND`:

- **local** — escribe en `media_root/` y sirve por `/media` con `StaticFiles`. Es
  el modo de desarrollo: no necesita credenciales ni red.
- **cloudinary** — sube a Cloudinary y guarda la URL absoluta del CDN. Es el modo
  de producción, y no es una preferencia sino un requisito: el disco de Render es
  efímero y se borra entero en cada deploy, así que un archivo escrito localmente
  desaparece con la próxima subida de código.

Cada backend devuelve `ArchivoGuardado(url, clave)`. La `clave` es el
identificador con el que después se borra el archivo —la ruta relativa en local,
el `public_id` en Cloudinary— y se guarda en la columna `storage_key` del medio.
Se guarda en vez de deducirla de la URL porque la URL es lo que se le muestra al
navegador y puede cambiar de forma (versión, transformaciones, dominio propio)
sin que el identificador real cambie.
"""

import uuid
from pathlib import Path
from typing import NamedTuple

from app.config import get_settings

# Subcarpeta (local) / carpeta (Cloudinary) donde viven las fotos de propiedades.
CARPETA_PROPIEDADES = "propiedades"


class ArchivoGuardado(NamedTuple):
    """Resultado de guardar un archivo."""

    url: str
    """URL pública: relativa (`/media/...`) en local, absoluta del CDN en Cloudinary."""

    clave: str | None
    """Identificador para borrarlo después. `None` si el backend no lo necesita."""


def _configurar_cloudinary():
    """Devuelve el módulo `cloudinary.uploader` ya configurado.

    La importación es perezosa a propósito: en desarrollo y en los tests el
    backend es local y el paquete puede no estar instalado. Que falte solo
    debería romper a quien realmente vaya a subir algo a la nube.
    """
    try:
        import cloudinary
        import cloudinary.uploader
    except ModuleNotFoundError as exc:  # pragma: no cover - depende del entorno
        raise RuntimeError(
            "STORAGE_BACKEND=cloudinary pero el paquete `cloudinary` no está instalado. "
            "Instalalo con: pip install cloudinary"
        ) from exc

    settings = get_settings()
    if settings.cloudinary_url:
        # El SDK parsea `cloudinary://api_key:api_secret@cloud_name` solo.
        cloudinary.config(cloudinary_url=settings.cloudinary_url, secure=True)
    else:
        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret,
            secure=True,
        )
    return cloudinary.uploader


def _guardar_local(contenido: bytes, extension: str) -> ArchivoGuardado:
    settings = get_settings()
    nombre = f"{uuid.uuid4().hex}{extension}"
    destino_dir = Path(settings.media_root) / CARPETA_PROPIEDADES
    destino_dir.mkdir(parents=True, exist_ok=True)
    (destino_dir / nombre).write_bytes(contenido)

    return ArchivoGuardado(
        url=f"{settings.media_url_prefix}/{CARPETA_PROPIEDADES}/{nombre}",
        clave=f"{CARPETA_PROPIEDADES}/{nombre}",
    )


def _guardar_cloudinary(contenido: bytes, extension: str) -> ArchivoGuardado:
    uploader = _configurar_cloudinary()
    settings = get_settings()

    # El public_id va sin extensión: Cloudinary la deriva del formato del binario
    # y la agrega a la URL. Ponérsela acá la duplicaría (`archivo.jpg.jpg`).
    carpeta = f"{settings.cloudinary_carpeta}/{CARPETA_PROPIEDADES}".strip("/")
    public_id = f"{carpeta}/{uuid.uuid4().hex}"

    resultado = uploader.upload(
        contenido,
        public_id=public_id,
        resource_type="image",
        # La imagen ya viene validada y redimensionada por `_procesar_imagen`;
        # que Cloudinary no la vuelva a tocar al subirla.
        overwrite=False,
    )
    return ArchivoGuardado(url=resultado["secure_url"], clave=resultado["public_id"])


def guardar_imagen(contenido: bytes, extension: str) -> ArchivoGuardado:
    """Guarda los bytes de una imagen ya validada y devuelve dónde quedó."""
    if get_settings().storage_backend == "cloudinary":
        return _guardar_cloudinary(contenido, extension)
    return _guardar_local(contenido, extension)


def borrar_imagen(url: str, clave: str | None) -> None:
    """Borra el archivo del almacenamiento. No falla si ya no está.

    Borrar el archivo es siempre secundario respecto de borrar la fila: un archivo
    huérfano en el CDN es basura barata, pero una fila que no se pudo borrar deja
    una foto rota en la web. Por eso los errores del proveedor se tragan.

    Las filas sin `clave` (las del seed, que apuntan a URLs de terceros) no tienen
    nada que borrar: el archivo no es nuestro.
    """
    if not clave:
        return

    settings = get_settings()

    if settings.storage_backend == "cloudinary":
        try:
            _configurar_cloudinary().destroy(clave, resource_type="image", invalidate=True)
        except Exception:  # noqa: BLE001 — ver el docstring
            pass
        return

    # Local: la clave es la ruta relativa dentro de media_root.
    try:
        (Path(settings.media_root) / clave).unlink(missing_ok=True)
    except OSError:
        pass
