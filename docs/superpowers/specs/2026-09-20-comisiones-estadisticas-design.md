# Comisiones y estadísticas — Diseño

**Bloque 4** del [mapa de funcionalidades](2026-09-11-mapa-de-funcionalidades.md). Construye sobre el [Bloque 1](2026-09-11-crm-en-el-panel-design.md) (operaciones, etapas, partes) y sobre el [2b](2026-09-17-alquileres-cobros-design.md) (cobros y liquidaciones). Estado: aprobado con las decisiones por defecto del plan de desarrollo del 18/09/2026.

> **Regla de trabajo para quien implemente esto (humano o agente):** no hacer `git commit` ni `git push` de nada. Se deja todo en el working tree y Matías se encarga de commitear y pushear. Vale para el spec, el plan y cada tarea de implementación.

## 1. Objetivo

Que al ganar una operación quede registrada la comisión (cuánto, a qué porcentaje, cómo se reparte entre los agentes, si ya se cobró) y que la inmobiliaria pueda ver, por período, cuánto vendió y alquiló, cuánto generó y cobró en comisiones, por tipo y por agente, cómo rinde su embudo y cómo viene la administración de alquileres. Es lo que el cliente pidió textualmente como "estadísticas de ventas y de comisiones".

## 2. Alcance

**Entra**
1. **Comisión por operación ganada**: tabla `comisiones` (1:1 con `deals`) y `comisiones_reparto` (N agentes con porcentaje). Se crea sola al ganar el deal con los defaults de la inmobiliaria; se edita desde la ficha de la operación.
2. **Historial de etapas**: tabla `deal_stage_history` alimentada por `create_deal` y `move_stage`, con backfill de lo existente en la migración. Es lo que hace posible el embudo.
3. **Reportes de solo lectura** en un módulo nuevo `platform/reportes/`: `operaciones`, `comisiones`, `embudo`, `alquileres`. Filtros por período, pipeline y agente. Cada uno exporta CSV con `?formato=csv`.
4. **Panel**: bloque "Comisión" en la ficha de la operación con modal de edición; página `/admin/reportes` con los cuatro reportes, filtros, tabla, gráfico y botón de exportar; en el dashboard un gráfico de operaciones ganadas por mes y un tile "Comisiones a cobrar".
5. Migración `0008_comisiones`.

**No entra**
- Facturación de honorarios (ARCA), IVA, retenciones. La comisión es el monto acordado, bruto.
- Conversión entre monedas. Todo se agrupa **por moneda**; nunca se suma ARS con USD.
- Comisión sobre los honorarios mensuales de administración de alquileres: ya existen como `liquidaciones.honorarios_monto` (2b) y entran al reporte de alquileres, no a `comisiones`.
- Metas/objetivos por agente, ranking, gamificación.
- Edición del historial de etapas a mano.
- Reportes en PDF; gráficos con librería externa (alcanza SVG inline).
- Permisos finos (que un agente vea solo sus comisiones). Es una inmobiliaria chica: todo el staff ve todo.

## 3. Decisiones

1. **Tabla propia, no columnas en `deals`.** El reparto es N (dos agentes que comparten una venta) y la comisión tiene su propio ciclo (generada → cobrada) independiente del deal. Meterlo en `deals` obligaría a una tabla de reparto igual, con la mitad de la información en otro lado.
2. **Se crea al ganar, con defaults, y se corrige después.** En `move_stage` (y en `create_deal` directo en etapa ganada) se inserta la comisión con `monto_operacion = deal.amount` (0 si es `None`), `pct` = `honorarios_venta_pct` si el pipeline se llama "Venta", `honorarios_alquiler_pct` si "Alquiler", `None` en cualquier otro; `monto = redondeo(monto_operacion × pct / 100)` o 0 si no hay `pct`. Reparto inicial: 100 % al `assigned_to_user_id` si lo hay, ninguno si no. Ganar sin monto no falla: queda en 0 y la ficha lo marca como "Sin monto". La alternativa (pedir la comisión en el momento de ganar) traba el flujo del tablero por un dato que casi siempre se completa después.
3. **`PUT` completo, no `PATCH` ni sub-recurso para el reparto.** `PUT /api/v1/deals/{id}/comision` recibe la comisión entera con la lista de reparto y la reemplaza. Es una entidad chica que se edita en un solo modal; un CRUD de reparto por fila sería tres endpoints más para lo mismo. El `PUT` **crea si no existe**, así cubre los deals ganados antes de este bloque sin backfill de datos que nadie cargó.
4. **Reabrir una operación ganada borra la comisión si no se cobró y se rechaza (409) si se cobró.** Mismo criterio que el contrato de alquiler: lo que ya produjo efecto contable no se deshace por arrastrar una tarjeta. Mover de "Ganada" a "Perdida" sigue la misma regla.
5. **`pct` y `monto` conviven; manda `monto`.** El cliente carga a veces un porcentaje y a veces una cifra pactada. Si en el `PUT` viene `pct` y no `monto`, el backend calcula `monto`; si viene `monto`, se guarda tal cual y `pct` queda como referencia (puede ser `None`). Redondeo `ROUND_HALF_UP` a 2 decimales, como en cobros.
6. **El reparto es un porcentaje de la comisión, no un monto.** Si la comisión cambia, el reparto sigue valiendo. La suma puede ser **menor** a 100 (el resto queda para la inmobiliaria), nunca mayor. Cada agente una sola vez. El monto por agente es derivado (`monto × pct / 100`) y se expone en la respuesta.
7. **Historial de etapas como tabla append-only.** Sin ella, "tiempo promedio en cada etapa" y "conversión por etapa" son incalculables: `stage_changed_at` solo sabe de la etapa actual. Una fila por estadía (`entered_at`, `left_at` null mientras dura). La migración crea una fila por deal existente con su etapa actual y `entered_at = stage_changed_at`: el embudo arranca con lo que se sabe y se completa solo.
8. **Reportes calculados en Python sobre filas filtradas, no con `date_trunc` en SQL.** El volumen es de cientos de operaciones y decenas de contratos: traer las filas del período y agrupar en Python es trivial, se testea con SQLite igual que Postgres y no obliga a `func` específicas de dialecto. Los filtros de fecha sí van en SQL.
9. **Todo agrupado por `moneda`.** Las filas de los reportes son `(mes, moneda)` o `(agente, moneda)`. El frontend muestra una moneda por vez (selector, default la que más filas tiene) y el CSV lleva la columna.
10. **CSV para Excel en español**: separador `;`, decimales con coma, UTF-8 con BOM, `Content-Disposition: attachment`. Se descarga con un `<a href>` al mismo endpoint: la cookie viaja porque es first-party.
11. **Gráficos como SVG inline propio.** Barras verticales por mes y barras horizontales para el embudo. Sin dependencia nueva: son dos componentes de 60 líneas.
12. **Ubicación.** Comisiones e historial son parte del dominio del deal: modelos en `deals/models.py`, lógica en `deals/comisiones.py` e `deals/historial.py`, endpoints en `deals/router.py`. Los reportes cruzan módulos (deals, alquileres, users): módulo propio `platform/reportes/` con `router.py`, `service.py`, `schemas.py`, `exportar.py`; sin `models.py`.

## 4. Backend

### 4.1 Modelos (migración `0008_comisiones`)

```python
class Comision(Base):
    __tablename__ = "comisiones"
    id: int
    deal_id: int                 # FK deals.id ondelete CASCADE, unique
    monto_operacion: Decimal     # Numeric(14,2) not null (0 si el deal no tenía amount)
    moneda: str                  # String(3) not null, copiada de deal.currency
    pct: Decimal | None          # Numeric(5,2)
    monto: Decimal               # Numeric(14,2) not null
    cobrada: bool                # not null default False
    fecha_cobro: date | None
    notas: str | None            # Text
    created_at, updated_at       # DateTime(timezone=True)

    deal: Deal                   # back_populates="comision", uselist=False
    reparto: list[ComisionReparto]  # cascade all, delete-orphan, order_by pct desc


class ComisionReparto(Base):
    __tablename__ = "comisiones_reparto"
    __table_args__ = (UniqueConstraint("comision_id", "user_id", name="uq_comision_reparto"),)
    id: int
    comision_id: int             # FK comisiones.id ondelete CASCADE
    user_id: int                 # FK users.id ondelete RESTRICT
    pct: Decimal                 # Numeric(5,2) not null, 0 < pct <= 100

    @property
    def monto(self) -> Decimal   # redondeo(comision.monto * pct / 100)


class DealStageHistory(Base):
    __tablename__ = "deal_stage_history"
    id: int
    deal_id: int                 # FK deals.id ondelete CASCADE, index
    stage_id: int                # FK pipeline_stages.id ondelete RESTRICT, index
    entered_at: datetime         # not null
    left_at: datetime | None     # null = etapa actual
```

`Deal` suma `comision: Mapped[Comision | None]` (`uselist=False`) y `stage_history: Mapped[list[DealStageHistory]]` (`order_by="DealStageHistory.entered_at"`).

La migración crea las tres tablas y hace el **backfill del historial**: `INSERT INTO deal_stage_history (deal_id, stage_id, entered_at) SELECT id, stage_id, stage_changed_at FROM deals WHERE deleted_at IS NULL`. El `downgrade` borra las tres tablas. No hay backfill de comisiones (decisión 3).

### 4.2 Contrato de interfaz — comisiones (`deals/schemas.py`)

```python
class RepartoIn(BaseModel):
    user_id: int
    pct: Decimal = Field(gt=0, le=100, decimal_places=2)


class ComisionIn(BaseModel):
    monto_operacion: Decimal = Field(ge=0, decimal_places=2)
    pct: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=2)
    monto: Decimal | None = Field(default=None, ge=0, decimal_places=2)   # si falta, se calcula de pct
    cobrada: bool = False
    fecha_cobro: date | None = None      # solo si cobrada; si cobrada y falta → hoy
    notas: str | None = None
    reparto: list[RepartoIn] = []        # suma <= 100, user_id sin repetir

    # model_validator: si pct is None and monto is None → "Indicá porcentaje o monto";
    #                  suma de reparto > 100 → "El reparto supera el 100 %";
    #                  user_id repetido → "Un agente aparece dos veces en el reparto";
    #                  fecha_cobro sin cobrada → "La fecha de cobro requiere marcar la comisión como cobrada".


class RepartoOut(BaseModel):
    user_id: int
    nombre: str                          # users.name
    pct: Decimal
    monto: Decimal


class ComisionOut(BaseModel):
    deal_id: int
    monto_operacion: Decimal
    moneda: str
    pct: Decimal | None
    monto: Decimal
    cobrada: bool
    fecha_cobro: date | None
    notas: str | None
    reparto: list[RepartoOut]
    sin_monto: bool                      # monto_operacion == 0: la ficha lo resalta
    updated_at: datetime
```

Endpoints en `deals/router.py`, ambos con `SOLO_STAFF`:

| Método | Ruta | Respuesta | Errores |
|---|---|---|---|
| `GET` | `/api/v1/deals/{deal_id}/comision` | `ComisionOut` | 404 deal; 404 "La operación no tiene comisión cargada" |
| `PUT` | `/api/v1/deals/{deal_id}/comision` | `ComisionOut` | 404 deal; 409 "La operación no está ganada"; 404 "Usuario {id} no encontrado" en el reparto; 422 validaciones |

### 4.3 Reglas de negocio (`deals/comisiones.py`, `deals/historial.py`)

**`comisiones.crear_por_defecto(db, deal) -> Comision`** — sin commit. `pct` según el nombre del pipeline (decisión 2); `moneda = deal.currency`; reparto 100 % al asignado si lo hay. Se llama desde `_aplicar_cierre` cuando `stage.is_won` y el deal aún no tiene comisión (idempotente: un deal ganado que ya la tiene no la pisa).

**Cambio en `_aplicar_cierre`**: hoy retorna temprano si `property_id is None`. Pasa a ejecutar **siempre** la parte de comisiones (crear al ganar, `al_reabrir` al salir de ganado) y a saltar solo la parte de la propiedad y la reserva cuando no hay propiedad. El `rollback` ante 409 se mantiene y cubre también el 409 de la comisión cobrada.

**`comisiones.guardar(db, deal_id, data: ComisionIn) -> Comision`** — crea o reemplaza. 409 si `not deal.is_won`. Calcula `monto` si falta. Reemplaza el reparto entero (borra y vuelve a insertar). Si `cobrada` y sin `fecha_cobro` → `date.today()`; si `not cobrada` → `fecha_cobro = None`. Commit.

**`comisiones.al_reabrir(db, deal)`** — se llama cuando el deal sale de una etapa ganada (a una abierta o a perdida) y tiene comisión: si `comision.cobrada` → 409 "La comisión ya fue cobrada; desmarcala antes de reabrir la operación"; si no, `db.delete(comision)`. Sin commit. Va **antes** de la verificación del contrato de alquiler, que sigue igual.

**`historial.registrar_entrada(db, deal, stage_id, ahora)`** — cierra la fila abierta (`left_at = ahora`) si la hay y abre una nueva. Sin commit. Se llama en `create_deal` (solo abre) y en `move_stage` **solo si `data.stage_id != deal.stage_id`** (mover a la misma etapa no genera estadía nueva).

### 4.4 Contrato de interfaz — reportes (`reportes/schemas.py`)

Filtros comunes (query): `desde: date | None`, `hasta: date | None` (ambas inclusivas; default `desde` = primer día del mes de hace 11 meses, `hasta` = hoy → 12 meses), `formato: Literal["json", "csv"] = "json"`. `hasta < desde` → 422. `mes` siempre `"YYYY-MM"`.

```python
class FilaOperaciones(BaseModel):
    mes: str
    moneda: str
    ganadas: int
    perdidas: int
    monto_ganado: Decimal            # suma de deal.amount de las ganadas
    comisiones: Decimal              # suma de comision.monto (0 si el deal ganado no tiene comisión)
    comisiones_cobradas: Decimal

class ReporteOperaciones(BaseModel):
    desde: date; hasta: date
    pipeline_id: int | None; agente_id: int | None
    filas: list[FilaOperaciones]     # orden: mes asc, moneda asc; todos los meses del rango
    totales: list[FilaOperaciones]   # una por moneda, mes = "total"


class FilaComision(BaseModel):
    deal_id: int; titulo: str; pipeline: str; closed_at: date
    moneda: str; monto_operacion: Decimal; pct: Decimal | None; monto: Decimal
    cobrada: bool; fecha_cobro: date | None
    reparto: list[RepartoOut]

class FilaAgente(BaseModel):
    user_id: int | None; nombre: str      # None / "Sin asignar" = parte no repartida (queda para la inmobiliaria)
    moneda: str; operaciones: int; comision: Decimal; cobrada: Decimal

class ReporteComisiones(BaseModel):
    desde: date; hasta: date; agente_id: int | None; cobrada: bool | None
    filas: list[FilaComision]        # orden: closed_at desc
    por_agente: list[FilaAgente]     # orden: comision desc


class FilaEmbudo(BaseModel):
    stage_id: int; nombre: str; position: int; is_won: bool; is_lost: bool
    ingresaron: int                  # deals con al menos una estadía en la etapa (entered_at en el período)
    actuales: int                    # deals abiertos hoy en esa etapa
    dias_promedio: Decimal | None    # promedio de (left_at - entered_at) de las estadías cerradas; None si no hay
    conversion_pct: Decimal | None   # % de `ingresaron` que después entró a una etapa de position mayor no perdida; None en terminales

class ReporteEmbudo(BaseModel):
    desde: date; hasta: date; pipeline_id: int; pipeline: str
    etapas: list[FilaEmbudo]         # orden: position
    ganadas: int; perdidas: int
    tasa_cierre_pct: Decimal | None  # ganadas / (ganadas + perdidas)
    dias_promedio_cierre: Decimal | None   # promedio de (closed_at - created_at) de las ganadas del período


class FilaAlquileres(BaseModel):
    mes: str; moneda: str
    esperado: Decimal                # cobros.monto con periodo = mes, no anulados
    cobrado: Decimal                 # pagos no anulados con fecha_pago en el mes
    pendiente: Decimal               # saldo hoy de los cobros del mes (pendiente + parcial)
    honorarios: Decimal              # liquidaciones.honorarios_monto con periodo = mes, no anuladas
    contratos_vigentes: int          # contratos con fecha_inicio <= fin de mes y (fecha_fin >= inicio de mes) y estado != rescindido antes del mes

class ReporteAlquileres(BaseModel):
    desde: date; hasta: date
    filas: list[FilaAlquileres]      # orden: mes asc, moneda asc; todos los meses del rango aunque estén en 0
    totales: list[FilaAlquileres]
```

Endpoints (`reportes/router.py`, prefijo `/api/v1/reportes`, todos con `SOLO_STAFF`):

| Ruta | Filtros extra | Fuente |
|---|---|---|
| `GET /operaciones` | `pipeline_id`, `agente_id` | deals cerrados (`closed_at` en el período, `deleted_at is null`) + su comisión |
| `GET /comisiones` | `agente_id` (deals con ese agente en el reparto **o** asignado), `cobrada` | comisiones de deals ganados con `closed_at` en el período |
| `GET /embudo` | `pipeline_id` (**requerido**) | `deal_stage_history` con `entered_at` en el período, deals no eliminados |
| `GET /alquileres` | — | cobros, pagos, liquidaciones, contratos |

Con `formato=csv` la respuesta es `text/csv; charset=utf-8`, y el cuerpo son las `filas` (en `embudo`, las `etapas`; en `comisiones`, las `filas` con el reparto aplanado como `"Ana 60 % · Juan 40 %"`). Nombre de archivo: `{reporte}_{desde}_{hasta}.csv`.

**`reportes/exportar.py`**: `csv_response(nombre: str, columnas: list[str], filas: Iterable[Sequence]) -> Response` — `csv.writer(delimiter=";")`, `Decimal` → `str` con coma decimal, `date` → `dd/mm/yyyy`, `bool` → `Sí`/`No`, `None` → vacío, BOM al inicio.

Definiciones que conviene fijar para que tests y frontend coincidan:
- **Mes de una operación** = mes de `closed_at` (convertido a fecha; se guarda en UTC y se toma tal cual, sin zona: el error de un día a medianoche es aceptable).
- **Mes de una comisión cobrada** = mes de `closed_at` de su deal (no de `fecha_cobro`): así `comisiones` y `comisiones_cobradas` de una misma fila hablan del mismo conjunto de operaciones. `fecha_cobro` queda como dato de la fila del detalle.
- **Agente de una operación** en `/operaciones?agente_id=` = `deal.assigned_to_user_id`. En `/comisiones?agente_id=` = aparece en el reparto o está asignado; en `por_agente` cada agente suma **su parte** (`reparto.monto`), y la parte no repartida va a la fila `user_id=None`.
- **Período del embudo** filtra por `entered_at` de la estadía; `actuales` no depende del período.
- **`operaciones` y `alquileres` incluyen todos los meses del rango**, con ceros donde no hubo movimiento, una fila por cada moneda que aparezca en el período (si no aparece ninguna, filas en ARS). La serie del gráfico necesita los ceros y es más simple armarlos en un solo lugar que en cada frontend.

### 4.5 Errores

| Caso | Código y mensaje |
|---|---|
| `GET /comision` de deal sin comisión | 404 "La operación no tiene comisión cargada" |
| `PUT /comision` de deal no ganado | 409 "La operación no está ganada" |
| Reparto con `user_id` inexistente o eliminado | 404 "Usuario {id} no encontrado" |
| Reabrir / perder un deal con comisión cobrada | 409 "La comisión ya fue cobrada; desmarcala antes de reabrir la operación" |
| `hasta < desde` | 422 "El período termina antes de empezar" |
| `/embudo` sin `pipeline_id` | 422 (FastAPI) |
| `/embudo` con pipeline inexistente | 404 "Pipeline no encontrado" |

## 5. Frontend

### 5.1 Ficha de operación (`pages/admin/operaciones/Ficha.tsx`)

Sección nueva **"Comisión"** debajo de "Estado", solo si `op.is_won`. Carga `operacionesApi.comision(id)`:
- 404 → texto "Sin comisión cargada" y botón **"Cargar comisión"**.
- Con datos: monto de la operación, `%` (o "—"), monto de la comisión, badge `Cobrada dd/mm/yyyy` (verde) / `A cobrar` (espera), lista del reparto ("Ana Pérez · 60 % · ARS 720.000") y línea "Inmobiliaria · 40 % · …" si la suma es menor a 100; si `sin_monto`, aviso "La operación no tiene monto: cargalo para calcular la comisión". Botón **"Editar"**.

**`components/crm/ModalComision/`**: formulario con `monto_operacion`, `pct`, `monto` (al escribir `pct` recalcula `monto`; al escribir `monto` deja `pct` como está), `cobrada` (checkbox) + `fecha_cobro` (habilitado solo si cobrada), `notas`, y el reparto como filas `agente (select de usuariosApi.listar()) · pct` con "Agregar agente", "Quitar" y la suma visible ("Repartido 100 % · Inmobiliaria 0 %"); deshabilita guardar si la suma supera 100 o hay agente repetido. Guarda con `operacionesApi.guardarComision(id, body)` y refresca la sección. Mismo patrón que `ModalRegistrarPago`.

### 5.2 Página Reportes (`pages/admin/reportes/Reportes.tsx`, ruta `/admin/reportes`)

Entrada **"Reportes"** en el menú del `AdminLayout` (después de "Alquileres"). Barra de filtros común: `desde`, `hasta` (inputs `date`, default últimos 12 meses), y según el reporte: `pipeline` (select de `operacionesApi.pipelines()`), `agente` (select de usuarios), `moneda` (select armado con las monedas presentes en la respuesta; default la más frecuente), `cobrada` (todas / sí / no). Los filtros viven en la query string (como `dias` en Recordatorios) para poder linkear.

Cuatro pestañas (`role="tablist"`), una por reporte:
- **Operaciones**: gráfico de barras por mes (ganadas; segunda serie: comisiones de la moneda elegida) + tabla `mes · ganadas · perdidas · monto · comisiones · cobradas` con fila de totales.
- **Comisiones**: tabla `por_agente` arriba (agente · operaciones · comisión · cobrada) y detalle por operación abajo (link a la ficha; badge cobrada/a cobrar; reparto aplanado).
- **Embudo**: barras horizontales por etapa (`ingresaron`), con `conversion_pct` y `dias_promedio` en cada fila; debajo "Ganadas N · Perdidas M · Tasa de cierre X % · Días promedio de cierre Y".
- **Alquileres**: barras por mes con `esperado` vs `cobrado` (dos series) + tabla `mes · esperado · cobrado · pendiente · honorarios · contratos vigentes` con totales.

Botón **"Exportar CSV"** en cada pestaña: `<a href={reportesApi.urlCsv(...)} download>` a la URL del endpoint con `formato=csv` y los filtros vigentes.

### 5.3 Dashboard

- Tile nuevo **"Comisiones a cobrar"** con la cantidad de comisiones `cobrada=false` del último año (`reportesApi.comisiones({cobrada:false})` → `filas.length`), linkea a `/admin/reportes?tab=comisiones&cobrada=false`.
- Bloque **"Últimos 6 meses"** con el gráfico de barras de operaciones ganadas por mes (`reportesApi.operaciones({desde: hace 5 meses})`, moneda más frecuente), con link "Ver reportes". Va debajo del bloque "Próximos N días" del 2c.

### 5.4 Gráficos (`components/graficos/`)

- **`GraficoBarras`**: props `{ categorias: string[]; series: { nombre: string; valores: number[]; color?: string }[]; formatear?: (v: number) => string; alto?: number }`. SVG con `viewBox`, barras agrupadas, eje X con etiquetas de mes cortas (`sep 26`), tooltip nativo con `<title>`, `role="img"` y `aria-label` que resume la serie. Sin animaciones.
- **`GraficoEmbudo`**: props `{ etapas: { nombre: string; valor: number; detalle?: string }[] }`. Barras horizontales proporcionales al máximo, nombre a la izquierda, valor y detalle a la derecha.
- Ambos con test que verifique cantidad de barras, etiquetas y que 0 valores no divide por cero.

### 5.5 Tipos y API

- `types/comision.ts`: `RepartoIn`, `ComisionIn`, `RepartoOut`, `ComisionOut`.
- `types/reportes.ts`: los DTOs del 4.4 (`Decimal` → `string`, `date` → `string`).
- `api/operaciones.ts`: `comision(id)`, `guardarComision(id, body)`.
- `api/reportes.ts`: `operaciones(f)`, `comisiones(f)`, `embudo(f)`, `alquileres(f)`, `urlCsv(reporte, f)`; usa `construirQuery`.
- `lib/formato.ts`: `etiquetaMes('2026-09') → 'sep 2026'` y `etiquetaMesCorta → 'sep 26'` si no existen ya; `formatearPorcentaje(pct)`.

## 6. Tests

Backend (`src/tests/`):
- `test_deals_comisiones.py`: al ganar un deal de Venta con `amount` y asignado → comisión con `pct` de la inmobiliaria, `monto` redondeado y reparto 100 % al asignado; sin `amount` → `monto_operacion=0`, `sin_monto=True`; pipeline Alquiler usa el otro `pct`; pipeline sin default → `pct=None`, `monto=0`; ganar dos veces (mover a otra etapa y volver) no duplica; `PUT` en deal no ganado → 409; `PUT` con `pct` calcula `monto`; con `monto` lo respeta; reparto > 100 → 422; agente repetido → 422; usuario inexistente → 404; `cobrada` sin fecha → hoy; reabrir con comisión no cobrada la borra; reabrir cobrada → 409 y el deal sigue ganado; `GET` sin comisión → 404; deal sin propiedad también recibe comisión.
- `test_deals_historial.py`: `create_deal` abre una estadía; `move_stage` cierra la anterior y abre otra; mover a la misma etapa no agrega; soft delete no toca el historial.
- `test_reportes.py`: escenario con dos meses, dos monedas, dos agentes, un deal perdido, un deal ganado sin comisión: `operaciones` agrupa por mes y moneda, incluye meses en 0, `totales` por moneda, filtra por `pipeline_id` y `agente_id`; `comisiones` filtra por `cobrada`, `por_agente` suma la parte de cada uno y la no repartida cae en "Sin asignar"; `embudo` calcula `ingresaron`, `conversion_pct`, `dias_promedio` (con estadías cerradas fabricadas) y `tasa_cierre_pct`, 404 con pipeline inexistente; `alquileres` reutiliza el escenario de `test_alquileres_cobros` (contrato con cobros, un pago, una liquidación) y devuelve esperado/cobrado/pendiente/honorarios por mes; `hasta < desde` → 422; `formato=csv` responde `text/csv`, empieza con BOM, usa `;` y coma decimal, y trae `Content-Disposition`; anónimo → 401.

Frontend (`client/src/`): `ModalComision.test.tsx` (recalcula monto desde pct, bloquea suma > 100, envía el body esperado), `Ficha.comision.test.tsx` (muestra "Sin comisión cargada" con 404 y la sección con datos), `Reportes.test.tsx` (cambia de pestaña, lee filtros de la URL, arma la URL del CSV con los filtros), `GraficoBarras.test.tsx`, `GraficoEmbudo.test.tsx`, y el `Dashboard.test.tsx` existente extendido con el tile y el gráfico.

## 7. Despliegue

Migración `0008_comisiones` (tres tablas + backfill del historial). Se aplica con `alembic upgrade head` contra Supabase **junto con `0006` y `0007`**, que todavía no están aplicadas allá (Supabase está en `0005`). Sin variables nuevas. Nota en `docs/despliegue.md`.

## 8. Después, si aparece la demanda

Exportar el detalle de comisiones a PDF para el contador; comisión por liquidación mensual (honorarios de administración por agente); objetivos por agente; comparación interanual; permisos por agente; cotización de moneda para totales consolidados.
