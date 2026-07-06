import enum
from datetime import datetime

from sqlalchemy import Column, BigInteger, String, Text, Numeric, DateTime, ForeignKey
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import relationship

from app.database import Base


class EstadoPublicacion(str, enum.Enum):
    activa = "activa"
    pausada = "pausada"
    eliminada = "eliminada"


class Publicacion(Base):
    __tablename__ = "publicaciones"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    propiedad_id = Column(
        BigInteger, ForeignKey("propiedades.id", ondelete="CASCADE"), nullable=False
    )
    titulo = Column(String(255), nullable=False)
    descripcion = Column(Text, nullable=True)
    estado = Column(
        SAEnum(EstadoPublicacion, name="estado_publicacion", create_type=False),
        nullable=False,
        default=EstadoPublicacion.activa,
    )
    # Precio público (puede diferir del precio interno de la propiedad)
    precio_publicado = Column(Numeric(14, 2), nullable=True)
    moneda_publicada = Column(String(3), nullable=False, default="ARS")
    # Slug para URLs amigables
    slug = Column(String(300), nullable=True, unique=True)
    publicada_en = Column(DateTime, nullable=True)
    creado_por_usuario_id = Column(BigInteger, ForeignKey("usuarios.id"), nullable=True)
    creado_en = Column(DateTime, nullable=False, default=datetime.utcnow)
    actualizado_en = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    eliminado_en = Column(DateTime, nullable=True)

    propiedad = relationship("Propiedad", back_populates="publicaciones")
