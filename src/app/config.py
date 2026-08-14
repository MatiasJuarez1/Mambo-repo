from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, computed_field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """Variables desde entorno o desde `.env` en la raíz del repo."""

    model_config = SettingsConfigDict(
        env_file=_REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    postgres_host: str = Field(default="localhost", validation_alias="POSTGRES_HOST")
    postgres_port: int = Field(default=5432, validation_alias="POSTGRES_PORT")
    postgres_user: str = Field(default="postgres", validation_alias="POSTGRES_USER")
    postgres_password: str = Field(default="postgres", validation_alias="POSTGRES_PASSWORD")
    postgres_database: str = Field(default="mamboDB", validation_alias="POSTGRES_DB")

    database_url: str | None = Field(default=None, validation_alias="DATABASE_URL")

    # ── Almacenamiento de archivos (fotos de propiedades) ──
    # `local` escribe en disco y sirve por /media; `r2` sube a Cloudflare R2.
    # En producción tiene que ser `r2`: el disco de Render es efímero y se borra
    # en cada deploy, así que una foto guardada en local dura hasta la próxima
    # subida de código. Ver app/storage.py.
    storage_backend: Literal["local", "r2"] = Field(
        default="local", validation_alias="STORAGE_BACKEND"
    )
    media_root: Path = Field(default=_REPO_ROOT / "media", validation_alias="MEDIA_ROOT")
    media_url_prefix: str = Field(default="/media", validation_alias="MEDIA_URL_PREFIX")

    # ── Cloudflare R2 ──
    # Son DOS dominios distintos y no son intercambiables:
    #
    # - `r2_endpoint_url` es la API S3, por donde se **sube**. Es privada: cada
    #   request va firmada con SigV4 y nunca se le muestra al navegador.
    # - `r2_public_base_url` es por donde se **lee**: el subdominio r2.dev del
    #   bucket o un dominio propio. Es la que se guarda en la base.
    #
    # Confundirlas es el error clásico: guardar el endpoint S3 en la base deja
    # todas las fotos rotas con un 401, porque el navegador no firma nada.
    r2_endpoint_url: str | None = Field(default=None, validation_alias="R2_ENDPOINT_URL")
    r2_bucket: str | None = Field(default=None, validation_alias="R2_BUCKET")
    r2_access_key_id: str | None = Field(default=None, validation_alias="R2_ACCESS_KEY_ID")
    r2_secret_access_key: str | None = Field(
        default=None, validation_alias="R2_SECRET_ACCESS_KEY"
    )
    r2_public_base_url: str | None = Field(
        default=None, validation_alias="R2_PUBLIC_BASE_URL"
    )

    # ── Autenticación (JWT en cookie httponly) ──
    # `jwt_secret` va sin default a propósito: si falta, pydantic-settings hace
    # fallar el arranque. Un default de conveniencia terminaría, tarde o temprano,
    # firmando los tokens de producción con un secreto que está en el repositorio.
    jwt_secret: str = Field(validation_alias="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256", validation_alias="JWT_ALGORITHM")
    jwt_ttl_horas: int = Field(default=8, validation_alias="JWT_TTL_HORAS")

    # Con `cookie_secure=True` el navegador solo manda la cookie por HTTPS. En dev
    # (http://localhost) tiene que quedar en False o directamente no habría login;
    # en producción es obligatorio ponerlo en True, pero recién cuando haya TLS.
    cookie_secure: bool = Field(default=False, validation_alias="COOKIE_SECURE")

    # `lax` sirve mientras el navegador vea al front y a la API en el mismo sitio.
    # En el despliegue eso se logra con el proxy de Vercel (vercel.json manda
    # /api/* a Render), así que `lax` sigue siendo correcto y es lo más seguro.
    # Solo hace falta `none` si algún día el front llamara a la API por su dominio
    # de Render: ahí la cookie pasa a ser de terceros y exige `none` + `secure`
    # —con el costo de que Safari y iOS la bloquean por defecto—.
    cookie_samesite: Literal["lax", "strict", "none"] = Field(
        default="lax", validation_alias="COOKIE_SAMESITE"
    )

    # Dominios de producción habilitados para CORS, separados por coma. En dev no
    # hace falta tocarlo: `main.py` acepta cualquier puerto de localhost por regex.
    cors_origins: str = Field(default="", validation_alias="CORS_ORIGINS")

    @property
    def cors_origins_lista(self) -> list[str]:
        """`CORS_ORIGINS` como lista.

        Se recibe como cadena separada por comas y no como `list[str]` porque
        pydantic-settings exigiría escribir JSON en la variable de entorno, que es
        incómodo de tipear en el panel de un hosting.
        """
        return [origen.strip() for origen in self.cors_origins.split(",") if origen.strip()]

    @model_validator(mode="before")
    @classmethod
    def _recortar_espacios(cls, valores):
        """Le saca los espacios y saltos de línea de los bordes a todo valor de texto.

        No es cosmético. Estas variables se cargan copiando y pegando en el panel
        de un hosting, y ahí es fácil arrastrar un `\\n` final que no se ve en
        ningún lado. Los síntomas que produce apuntan siempre lejos de la causa:

        - en `DATABASE_URL`, el nombre de la base queda al final, así que Postgres
          responde `database "postgres\\n" does not exist`;
        - en `R2_SECRET_ACCESS_KEY`, la firma se calcula sobre otro secreto y todo
          devuelve `SignatureDoesNotMatch`, que parece un problema de permisos.

        Ninguno de estos valores puede empezar ni terminar en espacio de forma
        legítima, así que recortarlos no puede romper una configuración válida.
        """
        if isinstance(valores, dict):
            return {
                clave: (valor.strip() if isinstance(valor, str) else valor)
                for clave, valor in valores.items()
            }
        return valores

    @model_validator(mode="after")
    def _validar_combinaciones(self) -> "Settings":
        """Falla al arrancar ante configuraciones que no funcionarían en runtime.

        Es a propósito que rompa el arranque y no que avise: las dos condiciones
        de acá no dan error en el momento, dan un sitio que parece andar hasta que
        alguien intenta entrar al panel o mira una foto que ya no está.
        """
        # Los navegadores descartan de plano una cookie `SameSite=None` sin
        # `Secure`. Nadie podría iniciar sesión, y sin este chequeo el síntoma
        # sería un login que responde 200 y vuelve a la pantalla de login.
        if self.cookie_samesite == "none" and not self.cookie_secure:
            raise ValueError(
                "COOKIE_SAMESITE=none exige COOKIE_SECURE=True: el navegador "
                "descarta la cookie y nadie puede iniciar sesión."
            )

        # R2 sin configurar sube todo a la nada. Mejor no arrancar que aceptar
        # fotos y perderlas.
        if self.storage_backend == "r2":
            faltantes = [
                nombre
                for nombre, valor in (
                    ("R2_ENDPOINT_URL", self.r2_endpoint_url),
                    ("R2_BUCKET", self.r2_bucket),
                    ("R2_ACCESS_KEY_ID", self.r2_access_key_id),
                    ("R2_SECRET_ACCESS_KEY", self.r2_secret_access_key),
                    ("R2_PUBLIC_BASE_URL", self.r2_public_base_url),
                )
                if not valor
            ]
            if faltantes:
                raise ValueError(
                    f"STORAGE_BACKEND=r2 exige {', '.join(faltantes)}."
                )

            # Atajo al error clásico: poner el endpoint S3 como URL pública. Las
            # fotos se subirían bien y se verían todas rotas con un 401, porque
            # ese dominio exige request firmada y el navegador no firma nada.
            if "r2.cloudflarestorage.com" in (self.r2_public_base_url or ""):
                raise ValueError(
                    "R2_PUBLIC_BASE_URL apunta al endpoint S3, que es privado y "
                    "responde 401 al navegador. Usá el subdominio público del "
                    "bucket (https://pub-<hash>.r2.dev) o tu dominio propio."
                )
        return self

    @computed_field  # type: ignore[prop-decorator]
    @property
    def sqlalchemy_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        from urllib.parse import quote_plus

        user = quote_plus(self.postgres_user)
        password = quote_plus(self.postgres_password)
        host = self.postgres_host
        port = self.postgres_port
        db = self.postgres_database
        return f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{db}"


@lru_cache
def get_settings() -> Settings:
    return Settings()


# Compatibilidad: parte del código (p. ej. alembic/env.py) importa `settings` directo.
settings = get_settings()
