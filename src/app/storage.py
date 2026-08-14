"""Almacenamiento de los archivos subidos (fotos de propiedades).

Dos backends detrás de la misma interfaz, elegidos por `STORAGE_BACKEND`:

- **local** — escribe en `media_root/` y sirve por `/media` con `StaticFiles`. Es
  el modo de desarrollo: no necesita credenciales ni red.
- **r2** — sube a Cloudflare R2 (API compatible con S3). Es el modo de
  producción, y no es una preferencia sino un requisito: el disco de Render es
  efímero y se borra entero en cada deploy, así que un archivo escrito
  localmente desaparece con la próxima subida de código.

Cada backend devuelve `ArchivoGuardado(url, clave)`. La `clave` es el
identificador con el que después se borra el archivo —la ruta relativa en local,
la key del objeto en R2— y se guarda en la columna `storage_key` del medio. Se
guarda en vez de deducirla de la URL porque la URL es lo que se le muestra al
navegador y puede cambiar de forma (dominio propio, CDN delante) sin que el
identificador real cambie.

## Los dos dominios de R2

R2 tiene dos URLs distintas y confundirlas es el error clásico:

- El **endpoint S3** (`<account_id>.r2cloudflarestorage.com`) es por donde se
  *sube*. Es privado: cada request va firmada con SigV4 y nunca se le muestra al
  navegador.
- La **URL pública** (`R2_PUBLIC_BASE_URL`) es por donde se *lee*: el subdominio
  `r2.dev` del bucket o un dominio propio conectado a él. Es la que se guarda en
  la base.

Guardar el endpoint S3 en la base da fotos rotas con 401 en toda la web, porque
el navegador no firma nada.
"""

import mimetypes
import uuid
from pathlib import Path
from typing import NamedTuple

from app.config import get_settings

# Subcarpeta (local) / prefijo de la key (R2) donde viven las fotos.
CARPETA_PROPIEDADES = "propiedades"


class ArchivoGuardado(NamedTuple):
    """Resultado de guardar un archivo."""

    url: str
    """URL pública: relativa (`/media/...`) en local, absoluta en R2."""

    clave: str | None
    """Identificador para borrarlo después. `None` si el backend no lo necesita."""


def _cliente_r2():
    """Devuelve un cliente boto3 apuntado al bucket de R2.

    La importación es perezosa a propósito: en desarrollo y en los tests el
    backend es local y boto3 puede no estar instalado. Que falte solo debería
    romper a quien realmente vaya a subir algo a la nube.
    """
    try:
        import boto3
        from botocore.config import Config
    except ModuleNotFoundError as exc:  # pragma: no cover - depende del entorno
        raise RuntimeError(
            "STORAGE_BACKEND=r2 pero boto3 no está instalado. "
            "Instalalo con: pip install boto3"
        ) from exc

    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint_url,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        # R2 exige `auto` como región y firma v4. Con la región por defecto de
        # boto3 (us-east-1) la firma no valida y todo responde 401.
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


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


def _guardar_r2(contenido: bytes, extension: str) -> ArchivoGuardado:
    settings = get_settings()
    key = f"{CARPETA_PROPIEDADES}/{uuid.uuid4().hex}{extension}"

    # Sin ContentType, R2 entrega los archivos como application/octet-stream y el
    # navegador los ofrece para descargar en vez de mostrarlos: las fotos
    # aparecen rotas aunque estén perfectamente subidas.
    tipo_mime = mimetypes.types_map.get(extension, "application/octet-stream")

    _cliente_r2().put_object(
        Bucket=settings.r2_bucket,
        Key=key,
        Body=contenido,
        ContentType=tipo_mime,
        # Sin ACL a propósito: R2 no soporta permisos por objeto. Que el bucket
        # sea legible se configura una sola vez en Cloudflare, habilitando el
        # subdominio r2.dev o conectándole un dominio propio.
        CacheControl="public, max-age=31536000, immutable",
    )

    base = settings.r2_public_base_url.rstrip("/")
    return ArchivoGuardado(url=f"{base}/{key}", clave=key)


def guardar_imagen(contenido: bytes, extension: str) -> ArchivoGuardado:
    """Guarda los bytes de una imagen ya validada y devuelve dónde quedó."""
    if get_settings().storage_backend == "r2":
        return _guardar_r2(contenido, extension)
    return _guardar_local(contenido, extension)


def borrar_imagen(url: str, clave: str | None) -> None:
    """Borra el archivo del almacenamiento. No falla si ya no está.

    Borrar el archivo es siempre secundario respecto de borrar la fila: un
    archivo huérfano en el bucket es basura barata, pero una fila que no se pudo
    borrar deja una foto rota en la web. Por eso los errores del proveedor se
    tragan.

    Las filas sin `clave` (las del seed, que apuntan a URLs de terceros) no
    tienen nada que borrar: el archivo no es nuestro.
    """
    if not clave:
        return

    settings = get_settings()

    if settings.storage_backend == "r2":
        try:
            _cliente_r2().delete_object(Bucket=settings.r2_bucket, Key=clave)
        except Exception:  # noqa: BLE001 — ver el docstring
            pass
        return

    # Local: la clave es la ruta relativa dentro de media_root.
    try:
        (Path(settings.media_root) / clave).unlink(missing_ok=True)
    except OSError:
        pass
