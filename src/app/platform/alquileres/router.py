"""Router alquileres: contratos de alquiler bajo /api/v1/alquileres."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.platform.alquileres import cobros, gastos, liquidaciones, recordatorios, service
from app.platform.alquileres.models import EstadoContrato
from app.platform.alquileres.schemas import (
    AnularIn,
    AnularLiquidacionIn,
    AplicarAjusteIn,
    CobroActualizar,
    CobroDetalle,
    CobroEnLista,
    ContratoActualizar,
    ContratoCrear,
    ContratoDetalle,
    ContratoEnLista,
    ContratoRenovar,
    EnviarIn,
    EnvioRecordatorios,
    FiltroEstadoCobro,
    FiltroEstadoLiquidacion,
    GastoActualizar,
    GastoCrear,
    GastoOut,
    LiquidacionDetalle,
    LiquidacionEmitir,
    LiquidacionEnLista,
    LiquidacionPreview,
    OmitirAjusteIn,
    PagarLiquidacionIn,
    PaginadoCobros,
    PaginadoContratos,
    PaginadoLiquidaciones,
    PagoCrear,
    PagoOut,
    PunitorioSugerido,
    Recordatorios,
    RescindirIn,
    Resumen,
)
from app.platform.auth.dependencies import (
    get_current_user,
    require_role,
    require_token_recordatorios,
)
from app.platform.auth.models import User
from app.platform.inmobiliaria import service as inmobiliaria_service

router = APIRouter(prefix="/alquileres", tags=["alquileres"])

# Por endpoint y no en el APIRouter, siguiendo el criterio del resto de los módulos.
SOLO_STAFF = [Depends(require_role("staff", "admin"))]


@router.post(
    "/contratos",
    response_model=ContratoDetalle,
    status_code=status.HTTP_201_CREATED,
    dependencies=SOLO_STAFF,
)
def crear_contrato(
    datos: ContratoCrear,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
) -> ContratoDetalle:
    contrato = service.crear_contrato(db, datos, user_id=usuario.id)
    return ContratoDetalle.model_validate(contrato)


# La ruta fija va antes que la paramétrica: si no, "/contratos" nunca matchea.
@router.get("/contratos", response_model=PaginadoContratos, dependencies=SOLO_STAFF)
def listar_contratos(
    estado: EstadoContrato | None = Query(default=None),
    property_id: int | None = Query(default=None),
    person_id: int | None = Query(default=None),
    vence_en_dias: int | None = Query(default=None, ge=0),
    ajuste_en_dias: int | None = Query(default=None, ge=0),
    sin_liquidar: bool = Query(default=False),
    q: str | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
) -> PaginadoContratos:
    total, items = service.listar_contratos(
        db,
        estado=estado,
        property_id=property_id,
        person_id=person_id,
        vence_en_dias=vence_en_dias,
        ajuste_en_dias=ajuste_en_dias,
        sin_liquidar=sin_liquidar,
        q=q,
        skip=skip,
        limit=limit,
    )
    return PaginadoContratos(total=total, items=[ContratoEnLista.model_validate(c) for c in items])


# --- Lista transversal de cobros, liquidaciones y resumen ---


@router.get("/cobros", response_model=PaginadoCobros, dependencies=SOLO_STAFF)
def listar_cobros(
    estado: FiltroEstadoCobro | None = Query(default=None),
    vence_en_dias: int | None = Query(default=None, ge=0),
    contrato_id: int | None = Query(default=None),
    property_id: int | None = Query(default=None),
    q: str | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
) -> PaginadoCobros:
    total, items = cobros.listar_cobros(
        db,
        estado=estado,
        vence_en_dias=vence_en_dias,
        contrato_id=contrato_id,
        property_id=property_id,
        q=q,
        skip=skip,
        limit=limit,
    )
    return PaginadoCobros(total=total, items=[CobroEnLista.model_validate(c) for c in items])


@router.get("/liquidaciones", response_model=PaginadoLiquidaciones, dependencies=SOLO_STAFF)
def listar_liquidaciones(
    estado: FiltroEstadoLiquidacion | None = Query(default=None),
    periodo: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    contrato_id: int | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
) -> PaginadoLiquidaciones:
    total, items = liquidaciones.listar(
        db,
        estado=estado,
        periodo=liquidaciones.periodo_desde(periodo) if periodo else None,
        contrato_id=contrato_id,
        skip=skip,
        limit=limit,
    )
    return PaginadoLiquidaciones(
        total=total, items=[LiquidacionEnLista.model_validate(x) for x in items]
    )


@router.get("/resumen", response_model=Resumen, dependencies=SOLO_STAFF)
def resumen(
    periodo: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
) -> Resumen:
    return cobros.resumen(db, liquidaciones.periodo_desde(periodo) if periodo else None)


@router.get("/recordatorios", response_model=Recordatorios, dependencies=SOLO_STAFF)
def listar_recordatorios(
    dias: int | None = Query(default=None, ge=1, le=365),
    db: Session = Depends(get_db),
) -> Recordatorios:
    """Qué hay que atender en los próximos `dias` (default: el de la inmobiliaria)."""
    if dias is None:
        dias = inmobiliaria_service.obtener(db).dias_aviso_recordatorios
    return recordatorios.listar(db, date.today(), dias)


@router.post(
    "/recordatorios/enviar",
    response_model=EnvioRecordatorios,
    dependencies=[Depends(require_token_recordatorios)],
)
def enviar_recordatorios(db: Session = Depends(get_db)) -> EnvioRecordatorios:
    """Lo dispara el cron externo (GitHub Actions) una vez al día."""
    return recordatorios.enviar(db)


@router.get("/contratos/{contrato_id}", response_model=ContratoDetalle, dependencies=SOLO_STAFF)
def obtener_contrato(contrato_id: int, db: Session = Depends(get_db)) -> ContratoDetalle:
    return ContratoDetalle.model_validate(service.obtener_contrato(db, contrato_id))


@router.patch("/contratos/{contrato_id}", response_model=ContratoDetalle, dependencies=SOLO_STAFF)
def actualizar_contrato(
    contrato_id: int,
    datos: ContratoActualizar,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
) -> ContratoDetalle:
    contrato = service.actualizar_contrato(db, contrato_id, datos, user_id=usuario.id)
    return ContratoDetalle.model_validate(contrato)


@router.post(
    "/contratos/{contrato_id}/finalizar", response_model=ContratoDetalle, dependencies=SOLO_STAFF
)
def finalizar_contrato(
    contrato_id: int,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
) -> ContratoDetalle:
    contrato = service.finalizar_contrato(db, contrato_id, user_id=usuario.id)
    return ContratoDetalle.model_validate(contrato)


@router.post(
    "/contratos/{contrato_id}/rescindir", response_model=ContratoDetalle, dependencies=SOLO_STAFF
)
def rescindir_contrato(
    contrato_id: int,
    datos: RescindirIn,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
) -> ContratoDetalle:
    contrato = service.rescindir_contrato(db, contrato_id, datos, user_id=usuario.id)
    return ContratoDetalle.model_validate(contrato)


@router.post(
    "/contratos/{contrato_id}/renovar",
    response_model=ContratoDetalle,
    status_code=status.HTTP_201_CREATED,
    dependencies=SOLO_STAFF,
)
def renovar_contrato(
    contrato_id: int,
    datos: ContratoRenovar,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
) -> ContratoDetalle:
    """Devuelve el contrato **nuevo**; el anterior queda finalizado y enlazado."""
    contrato = service.renovar_contrato(db, contrato_id, datos, user_id=usuario.id)
    return ContratoDetalle.model_validate(contrato)


@router.post(
    "/contratos/{contrato_id}/ajustes/{ajuste_id}/aplicar",
    response_model=ContratoDetalle,
    dependencies=SOLO_STAFF,
)
def aplicar_ajuste(
    contrato_id: int,
    ajuste_id: int,
    datos: AplicarAjusteIn,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
) -> ContratoDetalle:
    contrato = service.aplicar_ajuste(db, contrato_id, ajuste_id, datos, user_id=usuario.id)
    return ContratoDetalle.model_validate(contrato)


@router.post(
    "/contratos/{contrato_id}/ajustes/{ajuste_id}/omitir",
    response_model=ContratoDetalle,
    dependencies=SOLO_STAFF,
)
def omitir_ajuste(
    contrato_id: int,
    ajuste_id: int,
    datos: OmitirAjusteIn,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
) -> ContratoDetalle:
    contrato = service.omitir_ajuste(db, contrato_id, ajuste_id, datos, user_id=usuario.id)
    return ContratoDetalle.model_validate(contrato)


# --- Gastos ---

# --- Cobros y pagos ---

_COBRO = "/contratos/{contrato_id}/cobros/{cobro_id}"


@router.get(_COBRO, response_model=CobroDetalle, dependencies=SOLO_STAFF)
def obtener_cobro(contrato_id: int, cobro_id: int, db: Session = Depends(get_db)) -> CobroDetalle:
    return CobroDetalle.model_validate(cobros.obtener_cobro(db, contrato_id, cobro_id))


@router.patch(_COBRO, response_model=CobroDetalle, dependencies=SOLO_STAFF)
def actualizar_cobro(
    contrato_id: int, cobro_id: int, datos: CobroActualizar, db: Session = Depends(get_db)
) -> CobroDetalle:
    return CobroDetalle.model_validate(cobros.actualizar_cobro(db, contrato_id, cobro_id, datos))


@router.post(f"{_COBRO}/anular", response_model=CobroDetalle, dependencies=SOLO_STAFF)
def anular_cobro(
    contrato_id: int, cobro_id: int, datos: AnularIn, db: Session = Depends(get_db)
) -> CobroDetalle:
    return CobroDetalle.model_validate(cobros.anular_cobro(db, contrato_id, cobro_id, datos))


@router.get(f"{_COBRO}/punitorio", response_model=PunitorioSugerido, dependencies=SOLO_STAFF)
def punitorio_sugerido(
    contrato_id: int, cobro_id: int, fecha_pago: date = Query(...), db: Session = Depends(get_db)
) -> PunitorioSugerido:
    cobro = cobros.obtener_cobro(db, contrato_id, cobro_id)
    return cobros.calcular_punitorio(cobro, fecha_pago, inmobiliaria_service.obtener(db))


@router.post(
    f"{_COBRO}/pagos",
    response_model=CobroDetalle,
    status_code=status.HTTP_201_CREATED,
    dependencies=SOLO_STAFF,
)
def registrar_pago(
    contrato_id: int,
    cobro_id: int,
    datos: PagoCrear,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
) -> CobroDetalle:
    return CobroDetalle.model_validate(
        cobros.registrar_pago(db, contrato_id, cobro_id, datos, user_id=usuario.id)
    )


@router.post(
    f"{_COBRO}/pagos/{{pago_id}}/anular", response_model=CobroDetalle, dependencies=SOLO_STAFF
)
def anular_pago(
    contrato_id: int, cobro_id: int, pago_id: int, datos: AnularIn, db: Session = Depends(get_db)
) -> CobroDetalle:
    return CobroDetalle.model_validate(
        cobros.anular_pago(db, contrato_id, cobro_id, pago_id, datos)
    )


@router.post(
    f"{_COBRO}/pagos/{{pago_id}}/enviar",
    response_model=PagoOut,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=SOLO_STAFF,
)
def enviar_recibo(
    contrato_id: int,
    cobro_id: int,
    pago_id: int,
    background: BackgroundTasks,
    datos: EnviarIn | None = None,
    db: Session = Depends(get_db),
) -> PagoOut:
    """202: el email sale después de la respuesta; `enviado_email_at` se marca al salir."""
    pago = cobros.enviar_recibo(
        db, contrato_id, cobro_id, pago_id, datos.email if datos else None, background
    )
    return PagoOut.model_validate(pago)


# --- Gastos ---

_GASTOS = "/contratos/{contrato_id}/gastos"


@router.get(_GASTOS, response_model=list[GastoOut], dependencies=SOLO_STAFF)
def listar_gastos(contrato_id: int, db: Session = Depends(get_db)) -> list[GastoOut]:
    return [GastoOut.model_validate(g) for g in gastos.listar(db, contrato_id)]


@router.post(
    _GASTOS, response_model=GastoOut, status_code=status.HTTP_201_CREATED, dependencies=SOLO_STAFF
)
def crear_gasto(
    contrato_id: int,
    datos: GastoCrear,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
) -> GastoOut:
    return GastoOut.model_validate(gastos.crear(db, contrato_id, datos, user_id=usuario.id))


@router.patch(f"{_GASTOS}/{{gasto_id}}", response_model=GastoOut, dependencies=SOLO_STAFF)
def actualizar_gasto(
    contrato_id: int, gasto_id: int, datos: GastoActualizar, db: Session = Depends(get_db)
) -> GastoOut:
    return GastoOut.model_validate(gastos.actualizar(db, contrato_id, gasto_id, datos))


@router.delete(
    f"{_GASTOS}/{{gasto_id}}", status_code=status.HTTP_204_NO_CONTENT, dependencies=SOLO_STAFF
)
def borrar_gasto(contrato_id: int, gasto_id: int, db: Session = Depends(get_db)) -> None:
    gastos.borrar(db, contrato_id, gasto_id)


@router.put(f"{_GASTOS}/{{gasto_id}}/comprobante", response_model=GastoOut, dependencies=SOLO_STAFF)
def subir_comprobante(
    contrato_id: int, gasto_id: int, archivo: UploadFile = File(...), db: Session = Depends(get_db)
) -> GastoOut:
    return GastoOut.model_validate(gastos.subir_comprobante(db, contrato_id, gasto_id, archivo))


@router.delete(
    f"{_GASTOS}/{{gasto_id}}/comprobante", response_model=GastoOut, dependencies=SOLO_STAFF
)
def quitar_comprobante(contrato_id: int, gasto_id: int, db: Session = Depends(get_db)) -> GastoOut:
    return GastoOut.model_validate(gastos.quitar_comprobante(db, contrato_id, gasto_id))


# --- Liquidaciones ---

_LIQ = "/contratos/{contrato_id}/liquidaciones"


@router.get(_LIQ, response_model=list[LiquidacionDetalle], dependencies=SOLO_STAFF)
def listar_liquidaciones_del_contrato(contrato_id: int, db: Session = Depends(get_db)):
    return [
        LiquidacionDetalle.model_validate(x)
        for x in liquidaciones.listar_de_contrato(db, contrato_id)
    ]


# `/preview` va antes que `/{liq_id}/pagar`; como "preview" no es entero no hay ambigüedad.
@router.get(f"{_LIQ}/preview", response_model=LiquidacionPreview, dependencies=SOLO_STAFF)
def preview_liquidacion(
    contrato_id: int, periodo: str = Query(...), db: Session = Depends(get_db)
) -> LiquidacionPreview:
    contrato = service.obtener_contrato(db, contrato_id)
    return liquidaciones.calcular(db, contrato, liquidaciones.periodo_desde(periodo))


# El borrador no consume número ni escribe nada: se puede pedir las veces que haga falta.
@router.get(f"{_LIQ}/preview.pdf", dependencies=SOLO_STAFF)
def preview_liquidacion_pdf(
    contrato_id: int, periodo: str = Query(...), db: Session = Depends(get_db)
) -> Response:
    contenido = liquidaciones.borrador_pdf(db, contrato_id, liquidaciones.periodo_desde(periodo))
    return Response(
        content=contenido,
        media_type="application/pdf",
        # `inline` para que se abra en la pestaña en vez de bajarse: es para mirarlo.
        headers={"Content-Disposition": f'inline; filename="liquidacion-borrador-{periodo}.pdf"'},
    )


@router.post(
    _LIQ,
    response_model=LiquidacionDetalle,
    status_code=status.HTTP_201_CREATED,
    dependencies=SOLO_STAFF,
)
def emitir_liquidacion(
    contrato_id: int,
    datos: LiquidacionEmitir,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
) -> LiquidacionDetalle:
    return LiquidacionDetalle.model_validate(
        liquidaciones.emitir(db, contrato_id, datos, user_id=usuario.id)
    )


@router.post(f"{_LIQ}/{{liq_id}}/pagar", response_model=LiquidacionDetalle, dependencies=SOLO_STAFF)
def pagar_liquidacion(
    contrato_id: int, liq_id: int, datos: PagarLiquidacionIn, db: Session = Depends(get_db)
) -> LiquidacionDetalle:
    return LiquidacionDetalle.model_validate(liquidaciones.pagar(db, contrato_id, liq_id, datos))


@router.post(
    f"{_LIQ}/{{liq_id}}/anular", response_model=LiquidacionDetalle, dependencies=SOLO_STAFF
)
def anular_liquidacion(
    contrato_id: int, liq_id: int, datos: AnularLiquidacionIn, db: Session = Depends(get_db)
) -> LiquidacionDetalle:
    return LiquidacionDetalle.model_validate(liquidaciones.anular(db, contrato_id, liq_id, datos))


@router.post(
    f"{_LIQ}/{{liq_id}}/enviar",
    response_model=LiquidacionDetalle,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=SOLO_STAFF,
)
def enviar_liquidacion(
    contrato_id: int,
    liq_id: int,
    background: BackgroundTasks,
    datos: EnviarIn | None = None,
    db: Session = Depends(get_db),
) -> LiquidacionDetalle:
    liq = liquidaciones.enviar(db, contrato_id, liq_id, datos.email if datos else None, background)
    return LiquidacionDetalle.model_validate(liq)


# --- PDF ---


@router.put("/contratos/{contrato_id}/pdf", response_model=ContratoDetalle, dependencies=SOLO_STAFF)
def subir_pdf(
    contrato_id: int,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> ContratoDetalle:
    return ContratoDetalle.model_validate(service.subir_pdf(db, contrato_id, archivo))


@router.delete(
    "/contratos/{contrato_id}/pdf", response_model=ContratoDetalle, dependencies=SOLO_STAFF
)
def quitar_pdf(contrato_id: int, db: Session = Depends(get_db)) -> ContratoDetalle:
    return ContratoDetalle.model_validate(service.quitar_pdf(db, contrato_id))
