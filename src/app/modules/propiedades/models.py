from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import relationship

from app.database import Base


# Los enums heredan de StrEnum: en la base cada columna es un ENUM cuyos valores
# coinciden exactamente con el nombre de cada miembro, y StrEnum mantiene esa
# equivalencia (`TipoPropiedad.casa == "casa"`) sin el `str(...)` ambiguo que
# tenía la forma vieja `(str, enum.Enum)`.
#
# Van sin `create_type=False`. Ese flag es de PostgreSQL y significa "el tipo ENUM
# ya existe en la base, no lo crees": era cierto cuando el esquema se creaba a mano
# por fuera del repo, pero contra una base nueva —la de Supabase— hace que las
# tablas referencien tipos que nadie creó y la migración muere con
# `type "tipo_propiedad" does not exist`.
class TipoPropiedad(StrEnum):
    casa = "casa"
    depto = "depto"
    local = "local"
    terreno = "terreno"
    oficina = "oficina"
    otro = "otro"


class TipoOperacion(StrEnum):
    venta = "venta"
    alquiler = "alquiler"
    temporal = "temporal"


class EstadoComercial(StrEnum):
    disponible = "disponible"
    reservada = "reservada"
    cerrada = "cerrada"
    baja = "baja"


class TipoMedio(StrEnum):
    imagen = "imagen"
    video = "video"
    documento = "documento"
    otro = "otro"


class Propiedad(Base):
    __tablename__ = "propiedades"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    # Sin FK: la tabla de personas (people) usa BIGINT UNSIGNED. Referencia lógica.
    propietario_persona_id = Column(BigInteger, nullable=True)
    titulo = Column(String(255), nullable=False)
    descripcion = Column(Text, nullable=True)
    tipo_propiedad = Column(
        SAEnum(TipoPropiedad, name="tipo_propiedad"),
        nullable=False,
        default=TipoPropiedad.otro,
    )
    tipo_operacion = Column(
        SAEnum(TipoOperacion, name="tipo_operacion"),
        nullable=False,
        default=TipoOperacion.venta,
    )
    estado_comercial = Column(
        SAEnum(EstadoComercial, name="estado_comercial"),
        nullable=False,
        default=EstadoComercial.disponible,
    )
    moneda = Column(String(3), nullable=False, default="ARS")
    precio = Column(Numeric(14, 2), nullable=True)
    dormitorios = Column(Integer, nullable=True)
    banos = Column(Integer, nullable=True)
    m2_cubiertos = Column(Numeric(10, 2), nullable=True)
    m2_totales = Column(Numeric(10, 2), nullable=True)
    # Sin FK: la tabla de usuarios (users) usa BIGINT UNSIGNED y MySQL no permite
    # FK entre tipos signed/unsigned. Se deja como referencia lógica nullable.
    creado_por_usuario_id = Column(BigInteger, nullable=True)
    creado_en = Column(DateTime, nullable=False, default=datetime.utcnow)
    actualizado_en = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    eliminado_en = Column(DateTime, nullable=True)

    ubicacion = relationship(
        "PropiedadUbicacion",
        back_populates="propiedad",
        uselist=False,
        cascade="all, delete-orphan",
    )
    medios = relationship(
        "PropiedadMedio",
        back_populates="propiedad",
        cascade="all, delete-orphan",
        order_by="PropiedadMedio.orden",
    )
    caracteristicas = relationship(
        "PropiedadCaracteristica", back_populates="propiedad", cascade="all, delete-orphan"
    )
    publicaciones = relationship("Publicacion", back_populates="propiedad")


class PropiedadUbicacion(Base):
    __tablename__ = "propiedades_ubicaciones"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    propiedad_id = Column(
        BigInteger, ForeignKey("propiedades.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    direccion = Column(String(255), nullable=True)
    ciudad = Column(String(120), nullable=True)
    provincia = Column(String(120), nullable=True)
    pais = Column(String(120), nullable=True, default="AR")
    codigo_postal = Column(String(20), nullable=True)
    lat = Column(Numeric(10, 7), nullable=True)
    lng = Column(Numeric(10, 7), nullable=True)
    creado_en = Column(DateTime, nullable=False, default=datetime.utcnow)

    propiedad = relationship("Propiedad", back_populates="ubicacion")


class PropiedadMedio(Base):
    __tablename__ = "propiedades_medios"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    propiedad_id = Column(
        BigInteger, ForeignKey("propiedades.id", ondelete="CASCADE"), nullable=False
    )
    tipo_medio = Column(
        SAEnum(TipoMedio, name="tipo_medio"),
        nullable=False,
        default=TipoMedio.imagen,
    )
    url = Column(String(1024), nullable=False)
    # Identificador del archivo en el almacenamiento, para poder borrarlo: la ruta
    # relativa en local, la key del objeto en R2. Va aparte de `url` porque la
    # URL es lo que ve el navegador y puede cambiar de forma (versión, dominio
    # propio, transformaciones) sin que cambie el identificador real.
    # Nulo en los medios que apuntan a una URL de un tercero (p. ej. el seed): esos
    # archivos no son nuestros y no hay nada que borrar.
    storage_key = Column(String(512), nullable=True)
    # Copias reducidas de la misma foto: {"400": "https://…", "800": "…"}. La clave
    # es el ancho real en píxeles (string, porque JSON no tiene otras) y el valor,
    # la URL pública, con la misma forma que `url`.
    #
    # `JSON` genérico de SQLAlchemy y no el `JSONB` de PostgreSQL: se compila al
    # tipo nativo de cada motor, así que la suite en memoria (SQLite) lo cubre sin
    # adaptaciones. Acá no se consulta por adentro del documento, que es lo único
    # que justificaría atarse a JSONB.
    #
    # Nulo a propósito en las filas anteriores a esta columna y en las que no
    # generaron ninguna variante (una foto de 300px ya es más chica que la más
    # chica): el frontend cae al `url` de siempre y nunca queda una foto rota.
    # Las claves de almacenamiento de las variantes NO se guardan acá: se derivan
    # de `storage_key` (ver `app.storage.clave_de_variante`).
    variantes = Column(JSON, nullable=True)
    descripcion = Column(String(255), nullable=True)
    orden = Column(Integer, nullable=False, default=0)
    es_principal = Column(Boolean, nullable=False, default=False)
    creado_en = Column(DateTime, nullable=False, default=datetime.utcnow)

    propiedad = relationship("Propiedad", back_populates="medios")


class PropiedadCaracteristica(Base):
    __tablename__ = "propiedades_caracteristicas"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    propiedad_id = Column(
        BigInteger, ForeignKey("propiedades.id", ondelete="CASCADE"), nullable=False
    )
    clave = Column(String(80), nullable=False)
    valor = Column(String(255), nullable=False)
    creado_en = Column(DateTime, nullable=False, default=datetime.utcnow)

    propiedad = relationship("Propiedad", back_populates="caracteristicas")
