from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.modules.propiedades.models import (
    EstadoComercial,
    Propiedad,
    PropiedadCaracteristica,
    PropiedadMedio,
    PropiedadUbicacion,
    TipoOperacion,
    TipoPropiedad,
)
from app.modules.propiedades.schemas import (
    CaracteristicaCreate,
    MedioCreate,
    PropiedadCreate,
    PropiedadUpdate,
)


def listar_propiedades(
    db: Session,
    tipo_propiedad: Optional[TipoPropiedad] = None,
    tipo_operacion: Optional[TipoOperacion] = None,
    estado_comercial: Optional[EstadoComercial] = None,
    ciudad: Optional[str] = None,
    precio_min: Optional[Decimal] = None,
    precio_max: Optional[Decimal] = None,
    skip: int = 0,
    limit: int = 20,
) -> List[Propiedad]:
    query = db.query(Propiedad).filter(Propiedad.eliminado_en.is_(None))

    if tipo_propiedad:
        query = query.filter(Propiedad.tipo_propiedad == tipo_propiedad)
    if tipo_operacion:
        query = query.filter(Propiedad.tipo_operacion == tipo_operacion)
    if estado_comercial:
        query = query.filter(Propiedad.estado_comercial == estado_comercial)
    if precio_min is not None:
        query = query.filter(Propiedad.precio >= precio_min)
    if precio_max is not None:
        query = query.filter(Propiedad.precio <= precio_max)
    if ciudad:
        query = query.join(PropiedadUbicacion).filter(
            PropiedadUbicacion.ciudad.ilike(f"%{ciudad}%")
        )

    return query.offset(skip).limit(limit).all()


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


def eliminar_medio(db: Session, propiedad_id: int, medio_id: int) -> None:
    obtener_propiedad(db, propiedad_id)
    medio = db.query(PropiedadMedio).filter(
        PropiedadMedio.id == medio_id,
        PropiedadMedio.propiedad_id == propiedad_id,
    ).first()
    if not medio:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medio no encontrado")
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
