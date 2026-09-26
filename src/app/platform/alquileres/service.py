"""Contratos de alquiler: alta, calendario de ajustes, ciclo de vida y PDF.

Las funciones reciben la `Session` primero y hacen su propio commit. Las que
mueven la propiedad llaman a `aplicar_evento_de_operacion` dentro de la misma
transacción: contrato y propiedad cambian juntos o no cambia nada.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from dateutil.relativedelta import relativedelta
from fastapi import HTTPException, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, selectinload

from app.modules.propiedades.models import Propiedad
from app.modules.propiedades.service import (
    EventoOperacion,
    aplicar_evento_de_operacion,
    obtener_propiedad,
)
from app.platform.alquileres import cobros as cobros_service
from app.platform.alquileres.models import (
    Ajuste,
    Cobro,
    Contrato,
    ContratoParte,
    EstadoAjuste,
    EstadoContrato,
    IndiceAjuste,
)
from app.platform.alquileres.schemas import (
    AplicarAjusteIn,
    ContratoActualizar,
    ContratoCrear,
    ContratoRenovar,
    OmitirAjusteIn,
    ParteIn,
    RescindirIn,
    validar_coherencia_ajuste,
)
from app.platform.deals.models import Deal
from app.platform.people.models import Person
from app.storage import borrar_imagen, guardar_pdf_contrato

# ---------------------------------------------------------------------------
# Calendario de ajustes
# ---------------------------------------------------------------------------


def fechas_de_ajuste(
    fecha_inicio: date,
    fecha_fin: date,
    indice: IndiceAjuste,
    frecuencia_meses: int | None,
    desde: date | None = None,
) -> list[date]:
    """`inicio + k·frecuencia` para k ≥ 1, estrictamente antes de `fecha_fin`.

    Con `desde` (regeneración tras editar el contrato) devuelve solo las
    posteriores a esa fecha: las anteriores ya están resueltas y no se tocan.
    """
    if indice == IndiceAjuste.sin_ajuste or not frecuencia_meses:
        return []
    fechas: list[date] = []
    k = 1
    while True:
        fecha = fecha_inicio + relativedelta(months=frecuencia_meses * k)
        if fecha >= fecha_fin:
            return fechas
        if desde is None or fecha > desde:
            fechas.append(fecha)
        k += 1


def generar_ajustes(contrato: Contrato, desde: date | None = None) -> list[Ajuste]:
    return [
        Ajuste(fecha_prevista=fecha, estado=EstadoAjuste.pendiente)
        for fecha in fechas_de_ajuste(
            contrato.fecha_inicio,
            contrato.fecha_fin,
            contrato.indice,
            contrato.frecuencia_meses,
            desde,
        )
    ]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _conflicto(detalle: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detalle)


def obtener_contrato(db: Session, contrato_id: int) -> Contrato:
    contrato = db.get(Contrato, contrato_id)
    if contrato is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contrato no encontrado")
    return contrato


# --- Listado ---


def listar_contratos(
    db: Session,
    *,
    estado: EstadoContrato | None = None,
    property_id: int | None = None,
    person_id: int | None = None,
    vence_en_dias: int | None = None,
    ajuste_en_dias: int | None = None,
    sin_liquidar: bool = False,
    q: str | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[int, list[Contrato]]:
    """Contratos filtrados y paginados, ordenados por `fecha_fin` (el que vence antes
    primero) y luego por id.

    `vence_en_dias` y `ajuste_en_dias` miran solo contratos vigentes: un contrato
    finalizado no "vence" ni tiene ajustes que aplicar. Los filtros que cruzan
    partes o ajustes usan `any()` / `has()` (EXISTS) en vez de joins, así una
    persona repetida en varias partes no duplica filas ni infla el `total`.
    `sin_liquidar` usa el mismo criterio que `resumen.liquidaciones_sin_emitir`.
    """
    hoy = date.today()
    consulta = db.query(Contrato)

    if estado is not None:
        consulta = consulta.filter(Contrato.estado == estado)
    if property_id is not None:
        consulta = consulta.filter(Contrato.property_id == property_id)
    if person_id is not None:
        consulta = consulta.filter(Contrato.partes.any(ContratoParte.person_id == person_id))
    if vence_en_dias is not None:
        consulta = consulta.filter(
            Contrato.estado == EstadoContrato.vigente,
            Contrato.fecha_fin <= hoy + timedelta(days=vence_en_dias),
        )
    if ajuste_en_dias is not None:
        consulta = consulta.filter(
            Contrato.estado == EstadoContrato.vigente,
            Contrato.ajustes.any(
                and_(
                    Ajuste.estado == EstadoAjuste.pendiente,
                    Ajuste.fecha_prevista <= hoy + timedelta(days=ajuste_en_dias),
                )
            ),
        )
    if sin_liquidar:
        consulta = consulta.filter(cobros_service.criterio_sin_liquidar(hoy))
    if q and q.strip():
        patron = f"%{q.strip()}%"
        nombre_completo = Person.first_name + " " + Person.last_name
        consulta = consulta.filter(
            or_(
                Contrato.propiedad.has(Propiedad.titulo.ilike(patron)),
                Contrato.partes.any(ContratoParte.person.has(nombre_completo.ilike(patron))),
            )
        )

    total = consulta.count()
    items = (
        consulta.options(selectinload(Contrato.cobros).selectinload(Cobro.pagos))
        .order_by(Contrato.fecha_fin.asc(), Contrato.id.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return total, items


def _verificar_personas(db: Session, partes: list[ParteIn]) -> None:
    """404 con la primera persona que no exista (o esté eliminada)."""
    ids = sorted({p.person_id for p in partes})
    existentes = {
        fila[0]
        for fila in db.query(Person.id)
        .filter(Person.id.in_(ids), Person.deleted_at.is_(None))
        .all()
    }
    for person_id in ids:
        if person_id not in existentes:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Persona {person_id} no encontrada",
            )


def _partes_desde(partes: list[ParteIn]) -> list[ContratoParte]:
    return [ContratoParte(person_id=p.person_id, rol=p.rol) for p in partes]


def _contrato_vigente_de(
    db: Session, property_id: int, excluir_id: int | None = None
) -> Contrato | None:
    q = db.query(Contrato).filter(
        Contrato.property_id == property_id, Contrato.estado == EstadoContrato.vigente
    )
    if excluir_id is not None:
        q = q.filter(Contrato.id != excluir_id)
    return q.first()


def _mover_propiedad(db: Session, property_id: int, evento: EventoOperacion) -> None:
    """Aplica el evento a la propiedad; si la transición es inválida deshace todo lo
    pendiente en la sesión (el contrato ya flusheado incluido) y re-lanza el 409."""
    try:
        aplicar_evento_de_operacion(db, property_id, evento)
    except HTTPException:
        db.rollback()
        raise


def _verificar_deal(db: Session, deal_id: int, property_id: int) -> Deal:
    """El deal del que nace el contrato: de Alquiler, ganado, sin contrato previo y de
    la misma propiedad (un deal sin propiedad se acepta: la aporta el contrato)."""
    deal = db.query(Deal).filter(Deal.id == deal_id, Deal.deleted_at.is_(None)).first()
    if deal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal no encontrado")
    if deal.pipeline.name != "Alquiler":
        raise _conflicto("El deal no es del pipeline Alquiler")
    if not deal.is_won:
        raise _conflicto("El deal no está ganado")
    if deal.contrato is not None:
        raise _conflicto("El deal ya tiene un contrato")
    if deal.property_id is not None and deal.property_id != property_id:
        raise _conflicto("El deal es de otra propiedad")
    return deal


# ---------------------------------------------------------------------------
# Alta
# ---------------------------------------------------------------------------


def crear_contrato(
    db: Session,
    datos: ContratoCrear,
    user_id: int,
    contrato_anterior_id: int | None = None,
) -> Contrato:
    """Da de alta un contrato vigente y deja la propiedad `cerrada`.

    `contrato_anterior_id` lo usa la renovación para encadenar el nuevo con el
    que termina; el alta directa lo deja en None.
    """
    obtener_propiedad(db, datos.property_id)
    if _contrato_vigente_de(db, datos.property_id) is not None:
        raise _conflicto("La propiedad ya tiene un contrato vigente")
    if datos.deal_id is not None:
        _verificar_deal(db, datos.deal_id, datos.property_id)
    _verificar_personas(db, datos.partes)

    contrato = Contrato(
        **datos.model_dump(exclude={"partes"}),
        created_by_user_id=user_id,
        contrato_anterior_id=contrato_anterior_id,
    )
    contrato.partes = _partes_desde(datos.partes)
    contrato.ajustes = generar_ajustes(contrato)
    contrato.cobros = cobros_service.generar_cobros(contrato)
    db.add(contrato)
    db.flush()

    _mover_propiedad(db, datos.property_id, EventoOperacion.contrato_activado)

    db.commit()
    db.refresh(contrato)
    return contrato


# ---------------------------------------------------------------------------
# Edición
# ---------------------------------------------------------------------------

# Campos que definen el calendario: si cambia alguno, se regeneran los pendientes.
_CAMPOS_CALENDARIO = {"fecha_inicio", "fecha_fin", "indice", "frecuencia_meses", "porcentaje_fijo"}
# Campos congelados una vez que hay un ajuste aplicado: el historial parte de ellos.
_CAMPOS_CONGELADOS = {"monto_inicial", "fecha_inicio", "property_id"}


def _reemplazar_partes(db: Session, contrato: Contrato, partes: list[ParteIn]) -> None:
    """Borra las partes actuales y carga el conjunto nuevo (el PATCH manda la lista completa)."""
    for parte in list(contrato.partes):
        db.delete(parte)
    db.flush()
    db.expire(contrato, ["partes"])
    contrato.partes = _partes_desde(partes)


def _regenerar_pendientes(db: Session, contrato: Contrato) -> None:
    """Rehace el calendario desde el último ajuste resuelto; los resueltos no se tocan."""
    resueltos = [a for a in contrato.ajustes if a.estado != EstadoAjuste.pendiente]
    for ajuste in contrato.ajustes:
        if ajuste.estado == EstadoAjuste.pendiente:
            db.delete(ajuste)
    db.flush()
    db.expire(contrato, ["ajustes"])
    desde = max((a.fecha_prevista for a in resueltos), default=None)
    contrato.ajustes.extend(generar_ajustes(contrato, desde))


def actualizar_contrato(
    db: Session, contrato_id: int, datos: ContratoActualizar, user_id: int
) -> Contrato:
    """PATCH parcial de un contrato vigente.

    La coherencia índice / frecuencia / porcentaje y el orden de fechas se validan
    sobre el resultado del merge, porque el schema no conoce los valores actuales.
    """
    contrato = obtener_contrato(db, contrato_id)
    if contrato.estado != EstadoContrato.vigente:
        raise _conflicto("Solo se puede editar un contrato vigente")

    entrada = datos.model_dump(exclude_unset=True)
    partes_nuevas: list[ParteIn] | None = None
    if "partes" in entrada:
        entrada.pop("partes")
        actuales = [(p.person_id, p.rol) for p in contrato.partes]
        if [(p.person_id, p.rol) for p in datos.partes] != actuales:
            partes_nuevas = datos.partes
    cambios = {k: v for k, v in entrada.items() if getattr(contrato, k, None) != v}

    hay_aplicados = any(a.estado == EstadoAjuste.aplicado for a in contrato.ajustes)
    if hay_aplicados and cambios.keys() & _CAMPOS_CONGELADOS:
        raise _conflicto(
            "No se puede cambiar monto inicial, fecha de inicio ni propiedad con ajustes aplicados"
        )

    def final(campo: str):
        return cambios[campo] if campo in cambios else getattr(contrato, campo)

    try:
        validar_coherencia_ajuste(
            final("indice"), final("frecuencia_meses"), final("porcentaje_fijo")
        )
        if final("fecha_fin") <= final("fecha_inicio"):
            raise ValueError("fecha_fin debe ser posterior a fecha_inicio")
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    if "property_id" in cambios:
        nuevo_id = cambios["property_id"]
        obtener_propiedad(db, nuevo_id)
        if _contrato_vigente_de(db, nuevo_id, excluir_id=contrato.id) is not None:
            raise _conflicto("La propiedad ya tiene un contrato vigente")

    if partes_nuevas is not None:
        _verificar_personas(db, partes_nuevas)
        _reemplazar_partes(db, contrato, partes_nuevas)

    era_administrado = contrato.administrado
    propiedad_anterior_id = contrato.property_id
    for campo, valor in cambios.items():
        setattr(contrato, campo, valor)
    db.flush()

    if "property_id" in cambios:
        _mover_propiedad(db, propiedad_anterior_id, EventoOperacion.contrato_terminado)
        _mover_propiedad(db, contrato.property_id, EventoOperacion.contrato_activado)

    if cambios.keys() & _CAMPOS_CALENDARIO:
        _regenerar_pendientes(db, contrato)

    cobros_service.sincronizar_cobros(db, contrato, set(cambios), era_administrado)

    db.commit()
    db.refresh(contrato)
    return contrato


# ---------------------------------------------------------------------------
# --- Ciclo de vida ---
# ---------------------------------------------------------------------------


def _vigente_o_409(contrato: Contrato) -> None:
    if contrato.estado != EstadoContrato.vigente:
        raise _conflicto("El contrato no está vigente")


def _terminar(
    db: Session,
    contrato: Contrato,
    estado: EstadoContrato,
    nota: str,
    corte: date,
    liberar_propiedad: bool = True,
) -> None:
    """Cierra el contrato en `estado`, omite los ajustes pendientes y anula los cobros
    posteriores al mes de `corte` (fecha de fin o de rescisión).

    No hace commit: lo usa también la renovación dentro de su propia transacción.
    Con `liberar_propiedad` aplica `contrato_terminado`, que solo suelta la propiedad
    si sigue `cerrada` (si el staff ya la movió a mano, se respeta).
    """
    contrato.estado = estado
    for ajuste in contrato.ajustes:
        if ajuste.estado == EstadoAjuste.pendiente:
            ajuste.estado = EstadoAjuste.omitido
            ajuste.notas = nota
    cobros_service.anular_posteriores(contrato, corte, nota)
    db.flush()
    if liberar_propiedad:
        _mover_propiedad(db, contrato.property_id, EventoOperacion.contrato_terminado)


def finalizar_contrato(db: Session, contrato_id: int, user_id: int) -> Contrato:
    """Termina un contrato vigente que ya llegó a su `fecha_fin`."""
    contrato = obtener_contrato(db, contrato_id)
    _vigente_o_409(contrato)
    if date.today() < contrato.fecha_fin:
        raise _conflicto("El contrato todavía no venció; para terminarlo antes usá rescindir")

    _terminar(db, contrato, EstadoContrato.finalizado, "Contrato finalizado", contrato.fecha_fin)

    db.commit()
    db.refresh(contrato)
    return contrato


def rescindir_contrato(db: Session, contrato_id: int, datos: RescindirIn, user_id: int) -> Contrato:
    """Termina un contrato vigente antes de tiempo, dejando fecha y motivo."""
    contrato = obtener_contrato(db, contrato_id)
    _vigente_o_409(contrato)
    if not contrato.fecha_inicio <= datos.fecha_rescision <= contrato.fecha_fin:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La fecha de rescisión debe estar entre el inicio y el fin del contrato",
        )

    contrato.fecha_rescision = datos.fecha_rescision
    contrato.motivo_rescision = datos.motivo
    _terminar(db, contrato, EstadoContrato.rescindido, "Contrato rescindido", datos.fecha_rescision)

    db.commit()
    db.refresh(contrato)
    return contrato


# --- Renovación ---


def _base_de_renovacion(anterior: Contrato) -> dict:
    """Los campos de `ContratoCrear` copiados del contrato que termina.

    El monto arranca del vigente (no del inicial): la renovación continúa el
    historial de ajustes. `deal_id` no se copia: un deal tiene a lo sumo un
    contrato y el nuevo no nace del pipeline.
    """
    return {
        "property_id": anterior.property_id,
        "partes": [{"person_id": p.person_id, "rol": p.rol} for p in anterior.partes],
        "fecha_inicio": anterior.fecha_fin + timedelta(days=1),
        "dia_vencimiento": anterior.dia_vencimiento,
        "monto_inicial": anterior.monto_vigente,
        "moneda": anterior.moneda,
        "indice": anterior.indice,
        "frecuencia_meses": anterior.frecuencia_meses,
        "porcentaje_fijo": anterior.porcentaje_fijo,
        "administrado": anterior.administrado,
        "honorarios_pct": anterior.honorarios_pct,
        "punitorio_diario_pct": anterior.punitorio_diario_pct,
        "notas": anterior.notas,
    }


def renovar_contrato(
    db: Session, contrato_id: int, datos: ContratoRenovar, user_id: int
) -> Contrato:
    """Da de alta el contrato que continúa a `contrato_id` y finaliza el anterior.

    Lo que no venga en `datos` se copia del anterior; `fecha_inicio` por defecto
    es el día siguiente a su `fecha_fin`. El anterior queda `finalizado` con sus
    pendientes omitidos, pero **sin liberar la propiedad**: sigue `cerrada` con el
    contrato nuevo. Todo va en una sola transacción: si el alta falla, el
    anterior vuelve a como estaba.
    """
    anterior = obtener_contrato(db, contrato_id)
    if anterior.estado == EstadoContrato.rescindido:
        raise _conflicto("No se puede renovar un contrato rescindido")
    if anterior.renovacion is not None:
        raise _conflicto("El contrato ya fue renovado")

    base = _base_de_renovacion(anterior)
    base.update(datos.model_dump(exclude_unset=True))
    try:
        nuevo_datos = ContratoCrear.model_validate(base)
    except ValidationError as exc:
        mensajes = [e["msg"].removeprefix("Value error, ") for e in exc.errors()]
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="; ".join(mensajes)
        ) from exc

    # Antes del alta y sin commit: `crear_contrato` rechaza la propiedad con un
    # contrato vigente, y si el alta falla el rollback deshace también esto.
    if anterior.estado == EstadoContrato.vigente:
        _terminar(
            db,
            anterior,
            EstadoContrato.finalizado,
            "Renovado",
            anterior.fecha_fin,
            liberar_propiedad=False,
        )

    try:
        return crear_contrato(db, nuevo_datos, user_id, contrato_anterior_id=anterior.id)
    except HTTPException:
        db.rollback()
        raise


# ---------------------------------------------------------------------------
# Ajustes
# ---------------------------------------------------------------------------


def _ajuste_pendiente(contrato: Contrato, ajuste_id: int) -> Ajuste:
    """El ajuste `ajuste_id` de este contrato, que además tiene que estar pendiente."""
    ajuste = next((a for a in contrato.ajustes if a.id == ajuste_id), None)
    if ajuste is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ajuste no encontrado")
    if ajuste.estado != EstadoAjuste.pendiente:
        raise _conflicto("El ajuste ya fue resuelto")
    return ajuste


def _resolver(contrato: Contrato, ajuste: Ajuste) -> None:
    """Reglas comunes a aplicar y omitir: contrato vigente y sin pendientes anteriores.

    Los ajustes se resuelven en orden porque cada uno parte del monto que dejó el
    anterior; saltear uno dejaría el historial inconsistente.
    """
    if contrato.estado != EstadoContrato.vigente:
        raise _conflicto("El contrato no está vigente")
    hay_anterior = any(
        a.estado == EstadoAjuste.pendiente and a.fecha_prevista < ajuste.fecha_prevista
        for a in contrato.ajustes
    )
    if hay_anterior:
        raise _conflicto("Hay un ajuste anterior sin resolver")


def aplicar_ajuste(
    db: Session, contrato_id: int, ajuste_id: int, datos: AplicarAjusteIn, user_id: int
) -> Contrato:
    """Aplica el coeficiente sobre el monto vigente y deja el ajuste `aplicado`."""
    contrato = obtener_contrato(db, contrato_id)
    ajuste = _ajuste_pendiente(contrato, ajuste_id)
    _resolver(contrato, ajuste)

    monto_anterior = contrato.monto_vigente
    coeficiente = datos.coeficiente_efectivo()
    ajuste.coeficiente = coeficiente
    ajuste.monto_anterior = monto_anterior
    ajuste.monto_nuevo = (monto_anterior * coeficiente).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    ajuste.estado = EstadoAjuste.aplicado
    ajuste.aplicado_at = datetime.now(UTC)
    ajuste.aplicado_por_user_id = user_id
    ajuste.notas = datos.notas
    # Atributo transitorio (no mapeado): `ContratoDetalle` lo lee si está presente.
    contrato.cobros_no_actualizados = cobros_service.reflejar_ajuste(contrato, ajuste)

    db.commit()
    db.refresh(contrato)
    return contrato


def omitir_ajuste(
    db: Session, contrato_id: int, ajuste_id: int, datos: OmitirAjusteIn, user_id: int
) -> Contrato:
    """Marca el ajuste `omitido`: el monto vigente no cambia y el calendario avanza."""
    contrato = obtener_contrato(db, contrato_id)
    ajuste = _ajuste_pendiente(contrato, ajuste_id)
    _resolver(contrato, ajuste)

    ajuste.estado = EstadoAjuste.omitido
    ajuste.aplicado_at = datetime.now(UTC)
    ajuste.aplicado_por_user_id = user_id
    ajuste.notas = datos.notas

    db.commit()
    db.refresh(contrato)
    return contrato


# --- PDF ---

MAX_BYTES_PDF = 10 * 1024 * 1024
# Los PDF empiezan siempre con esta firma; alcanza para descartar un archivo
# renombrado a `.pdf` sin abrir el contenido completo.
_FIRMA_PDF = b"%PDF"


def subir_pdf(db: Session, contrato_id: int, archivo: UploadFile) -> Contrato:
    """Adjunta (o reemplaza) el PDF firmado del contrato.

    No exige que el contrato esté vigente: el escaneo firmado puede llegar
    después de que el contrato terminó. Se valida el `content_type` declarado y
    además la firma `%PDF` de los primeros bytes, porque el primero lo pone el
    navegador según la extensión y no prueba nada.
    """
    contrato = obtener_contrato(db, contrato_id)
    contenido = archivo.file.read()
    if archivo.content_type != "application/pdf" or not contenido.startswith(_FIRMA_PDF):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El archivo debe ser un PDF",
        )
    if len(contenido) > MAX_BYTES_PDF:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="El PDF supera los 10 MB",
        )

    guardado = guardar_pdf_contrato(contenido)
    # Sin variantes (no es una imagen), así que no hay anchos que borrar.
    if contrato.pdf_storage_key:
        borrar_imagen(contrato.pdf_url, contrato.pdf_storage_key)
    contrato.pdf_url = guardado.url
    contrato.pdf_storage_key = guardado.clave
    db.commit()
    db.refresh(contrato)
    return contrato


def quitar_pdf(db: Session, contrato_id: int) -> Contrato:
    """Borra el PDF del almacenamiento y limpia ambos campos. 404 si no había."""
    contrato = obtener_contrato(db, contrato_id)
    if not contrato.pdf_url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="El contrato no tiene PDF"
        )
    borrar_imagen(contrato.pdf_url, contrato.pdf_storage_key)
    contrato.pdf_url = None
    contrato.pdf_storage_key = None
    db.commit()
    db.refresh(contrato)
    return contrato
