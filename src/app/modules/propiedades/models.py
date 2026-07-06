import enum
from datetime import datetime

from sqlalchemy import Boolean, Column, BigInteger, String, Text, Numeric, Integer, DateTime, ForeignKey
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import relationship

from app.database import Base


class TipoPropiedad(str, enum.Enum):
    casa = "casa"
    depto = "depto"
    local = "local"
    terreno = "terreno"
    oficina = "oficina"
    otro = "otro"


class TipoOperacion(str, enum.Enum):
    venta = "venta"
    alquiler = "alquiler"
    temporal = "temporal"


class EstadoComercial(str, enum.Enum):
    disponible = "disponible"
    reservada = "reservada"
    cerrada = "cerrada"
    baja = "baja"


class TipoMedio(str, enum.Enum):
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
        SAEnum(TipoPropiedad, name="tipo_propiedad", create_type=False),
        nullable=False,
        default=TipoPropiedad.otro,
    )
    tipo_operacion = Column(
        SAEnum(TipoOperacion, name="tipo_operacion", create_type=False),
        nullable=False,
        default=TipoOperacion.venta,
    )
    estado_comercial = Column(
        SAEnum(EstadoComercial, name="estado_comercial", create_type=False),
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
    actualizado_en = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    eliminado_en = Column(DateTime, nullable=True)

    ubicacion = relationship(
        "PropiedadUbicacion", back_populates="propiedad", uselist=False, cascade="all, delete-orphan"
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
        SAEnum(TipoMedio, name="tipo_medio", create_type=False),
        nullable=False,
        default=TipoMedio.imagen,
    )
    url = Column(String(1024), nullable=False)
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
