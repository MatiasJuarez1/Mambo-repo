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

## Variantes

Cada foto se guarda además en varios anchos (ver `ANCHOS_VARIANTES` en
`modules/propiedades/service.py`, que es quien genera los bytes). Sus claves no
se guardan en la base: se **derivan** de la del original con
`clave_de_variante()`, que le agrega el ancho como sufijo. Una sola fuente de
verdad —el `storage_key`— en vez de una lista de claves que podría quedar
desincronizada del archivo real.
"""

import mimetypes
import uuid
from collections.abc import Iterable
from pathlib import Path, PurePosixPath
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
            "STORAGE_BACKEND=r2 pero boto3 no está instalado. Instalalo con: pip install boto3"
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


def clave_de_variante(clave: str, ancho: int | str) -> str:
    """Deriva la clave de una variante a partir de la del original.

    `propiedades/<hex>.jpg` → `propiedades/<hex>_800.jpg`.

    Es una convención, no un dato guardado: las claves de las variantes **no**
    van a la base. Guardarlas sería una segunda fuente de verdad que puede
    quedar desincronizada del archivo que realmente existe en el bucket.
    """
    ruta = PurePosixPath(clave)
    return str(ruta.with_name(f"{ruta.stem}_{ancho}{ruta.suffix}"))


def _escribir_local(contenido: bytes, clave: str) -> str:
    """Escribe el archivo en `media_root` y devuelve su URL pública (relativa)."""
    settings = get_settings()
    destino = Path(settings.media_root) / clave
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(contenido)
    return f"{settings.media_url_prefix}/{clave}"


def _subir_r2(contenido: bytes, clave: str) -> str:
    """Sube el objeto a R2 y devuelve su URL pública (absoluta)."""
    settings = get_settings()

    # Sin ContentType, R2 entrega los archivos como application/octet-stream y el
    # navegador los ofrece para descargar en vez de mostrarlos: las fotos
    # aparecen rotas aunque estén perfectamente subidas.
    extension = PurePosixPath(clave).suffix
    tipo_mime = mimetypes.types_map.get(extension, "application/octet-stream")

    _cliente_r2().put_object(
        Bucket=settings.r2_bucket,
        Key=clave,
        Body=contenido,
        ContentType=tipo_mime,
        # Sin ACL a propósito: R2 no soporta permisos por objeto. Que el bucket
        # sea legible se configura una sola vez en Cloudflare, habilitando el
        # subdominio r2.dev o conectándole un dominio propio.
        CacheControl="public, max-age=31536000, immutable",
    )

    base = settings.r2_public_base_url.rstrip("/")
    return f"{base}/{clave}"


def _guardar(contenido: bytes, clave: str) -> str:
    """Escribe los bytes bajo esa clave en el backend activo y devuelve la URL."""
    if get_settings().storage_backend == "r2":
        return _subir_r2(contenido, clave)
    return _escribir_local(contenido, clave)


def guardar_imagen(contenido: bytes, extension: str) -> ArchivoGuardado:
    """Guarda los bytes de una imagen ya validada y devuelve dónde quedó."""
    clave = f"{CARPETA_PROPIEDADES}/{uuid.uuid4().hex}{extension}"
    return ArchivoGuardado(url=_guardar(contenido, clave), clave=clave)


def guardar_variante(contenido: bytes, clave_original: str, ancho: int) -> str:
    """Guarda una copia reducida junto al original y devuelve su URL pública.

    Los bytes ya vienen redimensionados desde `modules/propiedades/service.py`:
    acá no se procesa ninguna imagen, solo se la escribe bajo la clave que le
    corresponde por convención.
    """
    clave = clave_de_variante(clave_original, ancho)
    return _guardar(contenido, clave)


def _leer_local(clave: str) -> bytes:
    """Lee el archivo desde `media_root`. La clave es la ruta relativa adentro."""
    return (Path(get_settings().media_root) / clave).read_bytes()


def _bajar_r2(clave: str) -> bytes:
    """Baja el objeto de R2 por la API S3 (firmado), no por su URL pública."""
    settings = get_settings()
    respuesta = _cliente_r2().get_object(Bucket=settings.r2_bucket, Key=clave)
    return respuesta["Body"].read()


def leer_archivo(clave: str) -> bytes:
    """Devuelve los bytes de un archivo ya guardado, por su clave.

    Se lee **por la clave y no por la URL pública** aunque en R2 esa URL también
    sirva el archivo: la clave es el identificador real y estable (ver el
    encabezado de este módulo), mientras que la URL pasa por el dominio público,
    que puede estar detrás de un CDN con caché vieja, mudarse a un dominio propio
    o directamente no ser legible si el bucket todavía no se expuso. Además
    evita traer una dependencia HTTP nueva: boto3 ya está para subir.

    A diferencia de `borrar_imagen`, acá los errores **no** se tragan. Al borrar,
    un archivo que ya no está es el resultado buscado; al leer, no poder traerlo
    significa que no hay original con qué trabajar, y quien llame tiene que
    enterarse para decidir (el backfill, por ejemplo, anota la falla y sigue con
    la foto siguiente).
    """
    if get_settings().storage_backend == "r2":
        return _bajar_r2(clave)
    return _leer_local(clave)


def _borrar_clave(clave: str) -> None:
    """Borra un único objeto/archivo, tragándose los errores. Ver `borrar_imagen`."""
    settings = get_settings()

    if settings.storage_backend == "r2":
        try:
            _cliente_r2().delete_object(Bucket=settings.r2_bucket, Key=clave)
        except Exception:  # noqa: BLE001 — ver el docstring de borrar_imagen
            pass
        return

    # Local: la clave es la ruta relativa dentro de media_root.
    try:
        (Path(settings.media_root) / clave).unlink(missing_ok=True)
    except OSError:
        pass


def borrar_imagen(
    url: str, clave: str | None, anchos_variantes: Iterable[int | str] | None = None
) -> None:
    """Borra el archivo del almacenamiento, con sus variantes. No falla si ya no está.

    Borrar el archivo es siempre secundario respecto de borrar la fila: un
    archivo huérfano en el bucket es basura barata, pero una fila que no se pudo
    borrar deja una foto rota en la web. Por eso los errores del proveedor se
    tragan.

    Las filas sin `clave` (las del seed, que apuntan a URLs de terceros) no
    tienen nada que borrar: el archivo no es nuestro.

    `anchos_variantes` son los anchos que realmente se generaron, es decir las
    claves de la columna `variantes` del medio (un `dict` se puede pasar tal
    cual: iterarlo da sus claves). Con `None` —las filas viejas, anteriores a la
    columna— no se intenta borrar ninguna variante: no existen. Se pasan los
    anchos en vez de asumir `ANCHOS_VARIANTES` porque una foto chica genera
    menos variantes que una grande, y pedirle a R2 que borre objetos que nunca
    existieron es una request por archivo inventado.
    """
    if not clave:
        return

    _borrar_clave(clave)

    for ancho in anchos_variantes or ():
        _borrar_clave(clave_de_variante(clave, ancho))
