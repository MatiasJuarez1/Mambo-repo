# Administración de alquileres · 2b: Cobros, recibos y liquidaciones — Diseño

**Bloque 2b** del [mapa de funcionalidades](2026-09-11-mapa-de-funcionalidades.md). Construye sobre el [2a](2026-09-16-alquileres-contratos-design.md). Estado: aprobado.

> **Regla de trabajo para quien implemente esto (humano o agente):** no hacer `git commit` ni `git push` de nada. Se deja todo en el working tree y Matías se encarga de commitear y pushear. Vale para el spec, el plan y cada tarea de implementación.

## 1. Objetivo

Que la inmobiliaria sepa, sin mirar la cuenta bancaria, qué alquileres administrados cobró este mes, cuáles están vencidos y cuánto le debe a cada propietario. Cada cobro esperado existe de antemano; cada pago registrado emite un recibo PDF numerado que se manda por email o WhatsApp; cada mes se liquida al propietario lo cobrado menos honorarios y gastos, con comprobante PDF.

Deja listo para el 2c: los listados `cobros?vence_en_dias=N` y `cobros?estado=vencido`, y el módulo `app/email.py`.

## 2. Alcance

**Entra**
1. Cobros esperados materializados por período para cada contrato `administrado`. Migración `0006`.
2. Pagos totales o parciales contra un cobro, con punitorio sugerido y editable. Anulación de pagos.
3. Recibo PDF por pago, numerado correlativo global, guardado en R2.
4. Gastos por contrato (expensas, reparaciones, impuestos, otros) con comprobante opcional.
5. Liquidación mensual al propietario con comprobante PDF numerado.
6. Envío por email (SMTP) de recibos y liquidaciones; link de WhatsApp prearmado.
7. Panel: bloques de cobros, gastos y liquidaciones en la ficha del contrato; lista transversal de cobros; tres tiles en el dashboard; campos nuevos en la configuración de la inmobiliaria.

**No entra**
- Recordatorios (bandeja, email diario) — 2c.
- Anular una liquidación emitida. Si está mal, se corrige en la siguiente (un gasto de más se compensa cargándolo; un gasto de menos, cargándolo después).
- Acreditar el sobrante de un pago a otro período.
- Facturación ARCA, Mercado Pago, portal de inquilino/propietario, WhatsApp automático.
- Umbral de morosidad configurable (es fijo, ver 4.3).

## 3. Decisiones

1. **Cobros materializados.** Al crear un contrato `administrado` se insertan todas las filas de `alquileres_cobros`, una por mes, igual que los ajustes. No hay cron en Render free, y así "vencidos" y "vence esta semana" son SQL directo y cada período es editable (mes bonificado, vencimiento corrido).
2. **Vencido y moroso no se guardan.** `estado` solo refleja pagos (`pendiente`/`parcial`/`pagado`/`anulado`); el atraso se deriva de `fecha_vencimiento < hoy` en la consulta. Nunca hay que "marcar vencidos".
3. **Un pago = un recibo.** El pago parcial emite recibo por lo pagado. El recibo se genera y sube en la misma transacción que el pago: no existe pago sin recibo.
4. **Numeración global correlativa** con fila contadora en `inmobiliaria` (`UPDATE … SET ultimo_recibo = ultimo_recibo + 1 RETURNING`), que Postgres serializa. No se reusan números: un pago anulado conserva el suyo. Formato `0001-00000047`; el `0001` es un punto de venta fijo para que, si un día entra ARCA, el número ya tenga la forma esperada.
5. **Punitorio sugerido, no impuesto.** El backend calcula `saldo × pct/100 × días de atraso` (menos días de gracia) y lo devuelve; el staff lo acepta, lo cambia o lo pone en 0.
6. **Liquidación por mes calendario de pago.** Entra lo que se cobró en ese mes (por `fecha_pago`), no lo que correspondía a ese período. Los totales se guardan como snapshot; el PDF y los números no cambian aunque después se toque un gasto.
7. **SMTP con la stdlib**, sin proveedor ni dependencia. Cinco variables opcionales; a medias es error de arranque. Envío en `BackgroundTask` de FastAPI.
8. **PDF con `fpdf2`**, pura Python, con DejaVu Sans embebida para tildes y `ñ`. Leyenda fija "Documento no válido como factura".
9. **WhatsApp no pasa por el backend**: la respuesta trae la `whatsapp_url` armada y el panel la abre.

## 4. Backend

### 4.1 Módulo y montaje

Sigue en `src/app/platform/alquileres/`. Para que `service.py` no siga creciendo, la lógica nueva va en submódulos del mismo paquete: `cobros.py` (generación, pagos, punitorio), `gastos.py`, `liquidaciones.py`, `recibos.py` (armado de PDFs y textos). `router.py` sigue siendo uno solo. `models.py` y `schemas.py` se extienden.

Módulos compartidos nuevos: `src/app/pdf.py` (helper de `fpdf2`) y `src/app/email.py` (SMTP). Fuente en `src/app/assets/fonts/DejaVuSans.ttf` (y `-Bold`), incluida en el paquete (`[tool.setuptools.package-data]`).

Dependencia nueva en `pyproject.toml`: `fpdf2>=2.7`.

Todos los endpoints con `SOLO_STAFF`, montados bajo `/api/v1/alquileres`.

### 4.2 Modelos (migración `0006_alquileres_cobros`)

**`alquileres_cobros`** — un período esperado por mes.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | int PK | |
| `contrato_id` | FK `alquileres_contratos.id`, cascade | |
| `periodo` | date, not null | Primer día del mes. Unique `(contrato_id, periodo)`. |
| `fecha_vencimiento` | date, not null, index | Día `dia_vencimiento` de ese mes; editable. |
| `monto` | Numeric(14,2), not null | Snapshot del monto vigente a la fecha del período. Editable si no tiene pagos. |
| `estado` | enum `estado_cobro` | `pendiente`, `parcial`, `pagado`, `anulado`. Lo recalcula el service; nunca por fecha. |
| `notas` | Text, nullable | |
| `created_at`, `updated_at` | datetime tz | |

Índices: `(contrato_id, periodo)` unique, `(estado, fecha_vencimiento)`.

Propiedades calculadas (no columnas): `pagado` (suma de pagos no anulados), `saldo` (`monto − pagado`), `dias_atraso` (`max(0, hoy − fecha_vencimiento)` si `saldo > 0`, si no 0), `vencido` (`saldo > 0 and fecha_vencimiento < hoy`).

**`alquileres_pagos`** — cada pago registrado.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | int PK | |
| `cobro_id` | FK cascade | |
| `fecha_pago` | date, not null | |
| `monto` | Numeric(14,2), not null | `> 0`. Solo alquiler; el punitorio va aparte. |
| `punitorio` | Numeric(14,2), not null, default 0 | |
| `medio` | enum `medio_pago` | `efectivo`, `transferencia`, `otro`. |
| `referencia` | String(100), nullable | Número de transferencia, etc. |
| `recibo_numero` | int, not null, unique | Correlativo global. |
| `recibo_pdf_url`, `recibo_pdf_key` | String(1024) / String(512), not null | |
| `enviado_email_at` | datetime tz, nullable | |
| `anulado_at`, `motivo_anulacion` | datetime tz / Text, nullable | |
| `liquidacion_id` | FK `alquileres_liquidaciones.id`, nullable, `SET NULL` | Se llena al liquidar. |
| `notas` | Text, nullable | |
| `registrado_por_user_id` | FK `users.id`, not null | |
| `created_at` | datetime tz | |

Índices: `(cobro_id)`, `(fecha_pago)`, `(liquidacion_id)`.

**`alquileres_gastos`** — se descuentan al propietario.

`id`, `contrato_id` (FK cascade), `fecha` (date), `tipo` enum `tipo_gasto` (`expensas`, `reparacion`, `impuesto`, `otro`), `concepto` String(150), `monto` Numeric(14,2) `> 0`, `comprobante_url`/`comprobante_key` nullable, `liquidacion_id` FK nullable `SET NULL`, `created_by_user_id` FK, `created_at`. Índices `(contrato_id, fecha)`, `(liquidacion_id)`.

**`alquileres_liquidaciones`** — una por contrato y mes.

`id`, `contrato_id` (FK, `RESTRICT`), `periodo` date (primer día del mes; unique `(contrato_id, periodo)`), `numero` int unique (correlativo global, contador propio), `total_cobrado`, `total_punitorios`, `honorarios_pct` Numeric(5,2), `honorarios_monto`, `total_gastos`, `total_a_transferir` — todos Numeric(14,2) not null, snapshot; `estado` enum `estado_liquidacion` (`emitida`, `pagada`); `fecha_pago` date nullable; `comprobante_pdf_url`/`comprobante_pdf_key` not null; `enviado_email_at` nullable; `notas`; `created_by_user_id`; `created_at`.

Relaciones: `Contrato.cobros` (por `periodo`), `Contrato.gastos`, `Contrato.liquidaciones`; `Cobro.pagos` (por `fecha_pago`, `id`); `Liquidacion.pagos`, `Liquidacion.gastos`.

**`inmobiliaria`** suma: `punitorio_diario_pct` Numeric(5,3) nullable (`0.100` = 0,1 % por día), `dias_gracia` int not null default 0, `ultimo_recibo` int not null default 0, `ultima_liquidacion` int not null default 0.

**`alquileres_contratos`** suma: `punitorio_diario_pct` Numeric(5,3) nullable (override; null → el de la inmobiliaria).

**`Settings`** suma: `smtp_host`, `smtp_port` (default 587), `smtp_user`, `smtp_password`, `email_from` (todas opcionales). Un `model_validator` exige las cinco o ninguna, como con R2. `email_configurado` es una propiedad.

### 4.3 Reglas de negocio

Todas las funciones reciben `Session` primero y hacen su propio commit, salvo las que se indican como parte de la transacción de otra.

**`generar_cobros(contrato) -> list[Cobro]`** (pura, en `cobros.py`)
- Si no `administrado` → `[]`.
- Un período por mes desde el mes de `fecha_inicio` hasta el mes de `fecha_fin`, inclusive ambos.
- `fecha_vencimiento` = `periodo.replace(day=dia_vencimiento)`. Excepción: en el primer mes, si esa fecha es anterior a `fecha_inicio`, vence en `fecha_inicio`.
- `monto` = `monto_vigente_a(contrato, periodo)`: `monto_nuevo` del ajuste `aplicado` con mayor `fecha_prevista <= periodo`, o `monto_inicial`. (Función nueva junto a `monto_vigente`.)
- Estado `pendiente`.

**Cuándo se (re)generan** — dentro de la transacción del contrato:
- `crear_contrato` y `renovar_contrato`: después de insertar el contrato.
- `actualizar_contrato`: si `administrado` pasa de false a true, genera; de true a false, borra los cobros sin pagos y 409 si alguno los tiene ("El contrato tiene cobros registrados; no puede dejar de ser administrado"). Si cambian `fecha_fin` o `dia_vencimiento`: los cobros `pendiente` sin pagos se borran y se regeneran; los que tienen pagos no se tocan; los períodos que ya no entran en el nuevo plazo y tienen pagos → 409.
- `aplicar_ajuste`: los cobros con `periodo >= fecha_prevista` del ajuste, no `anulado` y sin pagos pasan a `monto = monto_nuevo`. Los que tienen pagos quedan como están. `ContratoDetalle` devuelve `cobros_no_actualizados: n` en la respuesta de esa acción para que el panel lo avise.
- `finalizar_contrato` y `rescindir_contrato`: cobros `pendiente` sin pagos con `periodo` posterior al mes de corte (`fecha_fin` o `fecha_rescision`) → `anulado` con nota "Contrato finalizado" / "Contrato rescindido". El mes de corte se deja `pendiente` (puede haber prorrateo a mano vía PATCH del monto).

**`calcular_punitorio(cobro, fecha_pago, inmobiliaria) -> PunitorioSugerido`** (pura)
- `pct` = `contrato.punitorio_diario_pct` si no es null, si no `inmobiliaria.punitorio_diario_pct`, si no 0.
- `dias` = `max(0, (fecha_pago − fecha_vencimiento).days − inmobiliaria.dias_gracia)`.
- `monto` = `saldo × pct / 100 × dias`, redondeado a 2 decimales `ROUND_HALF_UP`.
- Devuelve `{monto, dias_atraso, pct}`. Se expone en `GET .../cobros/{id}/punitorio?fecha_pago=` para que el modal lo precargue.

**`registrar_pago(db, contrato_id, cobro_id, datos, user)`**
- Contrato `vigente` (409). Cobro del contrato (404), no `anulado` ni `pagado` (409).
- `datos`: `fecha_pago`, `monto > 0`, `punitorio >= 0` opcional, `medio`, `referencia?`, `notas?`. `monto <= saldo` (422: "El monto supera el saldo del período").
- `punitorio` ausente → `calcular_punitorio(...).monto`.
- En una transacción: incrementa `inmobiliaria.ultimo_recibo` y toma el número; inserta el pago; recalcula `estado` del cobro (`pagado` si `saldo == 0`, si no `parcial`); genera el PDF (`recibos.generar_recibo_pdf`), lo sube con `storage.guardar_pdf(contenido, f"recibos/{contrato_id}/{numero}.pdf")` y guarda url/key; commit. Si la subida falla, rollback: no queda pago ni número consumido (el contador se revierte con la transacción).
- Devuelve `CobroDetalle`.

**`anular_pago(db, contrato_id, cobro_id, pago_id, datos)`**
- 409 si ya `anulado_at` o si `liquidacion_id` no es null ("El pago está en la liquidación N° …").
- `datos.motivo` obligatorio. Marca `anulado_at`, `motivo_anulacion`; recalcula estado del cobro. El PDF y el número se conservan.

**`actualizar_cobro(db, contrato_id, cobro_id, datos)`** — `monto`, `fecha_vencimiento`, `notas`. `monto` y `fecha_vencimiento` solo sin pagos no anulados (409). Solo cobros no `anulado`.

**`anular_cobro(db, contrato_id, cobro_id, datos)`** — mes que no se cobra. Sin pagos no anulados (409). `datos.motivo` → `notas`. Estado `anulado`. No se des-anula ni hay alta manual de cobros en v1; por eso el modal pide confirmación.

**Gastos** — `crear_gasto`, `actualizar_gasto`, `borrar_gasto`, `subir_comprobante`, `quitar_comprobante`. Editar, borrar o tocar el comprobante solo si `liquidacion_id` es null (409: "El gasto ya fue liquidado"). Comprobante: imagen (`image/jpeg`, `image/png`, `image/heic`) o `application/pdf`, ≤ 10 MB, clave `gastos/{contrato_id}/{gasto_id}.{ext}`; al reemplazar se borra el anterior. Sin restricción por estado del contrato: después de finalizar puede llegar la última expensa.

**`calcular_liquidacion(db, contrato, periodo) -> LiquidacionPreview`** (no escribe)
- `pagos`: no anulados, `liquidacion_id` null, `fecha_pago` dentro del mes `periodo`.
- `gastos`: `liquidacion_id` null, `fecha <= último día del mes` (arrastra los atrasados).
- `total_cobrado = Σ pago.monto`; `total_punitorios = Σ pago.punitorio`; `honorarios_pct = contrato.honorarios_pct or 0`; `honorarios_monto = round(total_cobrado × honorarios_pct / 100)`; `total_gastos = Σ gasto.monto`; `total_a_transferir = total_cobrado + total_punitorios − honorarios_monto − total_gastos`. Los punitorios van al propietario íntegros (decisión simple para v1; se documenta en el PDF como línea aparte).
- Devuelve el desglose con las filas.

**`emitir_liquidacion(db, contrato_id, datos, user)`**
- `datos`: `periodo` (mes), `notas?`. 409 si ya existe para ese `(contrato, periodo)`; 409 si no hay pagos ni gastos ("No hay nada que liquidar en ese período"). `total_a_transferir` puede ser negativo (gastos mayores al cobro): se emite igual y el PDF lo muestra como "Saldo a favor de la inmobiliaria".
- Transacción: contador `ultima_liquidacion`; inserta la liquidación con los totales; marca `liquidacion_id` en pagos y gastos; genera y sube el PDF a `liquidaciones/{contrato_id}/{numero}.pdf`; commit.

**`pagar_liquidacion(db, contrato_id, liq_id, datos)`** — `fecha_pago`; 409 si ya `pagada`.

**Envío** — `enviar_recibo(db, ..., pago_id, email?, background)` y `enviar_liquidacion(...)`:
- 409 si `not settings.email_configurado` ("Email no configurado"), si el pago está anulado, o si no hay destinatario: `email` del body, o el contacto `type == "email"` primario (si no hay primario, el primero) del inquilino (recibo) / propietario (liquidación) del contrato.
- Responde 202 con el detalle y encola `BackgroundTask(_enviar_y_marcar, tabla, id, destinatario, asunto, cuerpo, pdf_key)`. El task abre `SessionLocal()` propia, hace `leer_archivo(pdf_key)`, `enviar_email(...)`, y setea `enviado_email_at`. Si falla, `logger.exception` y no marca.

**`whatsapp_url`** (propiedad calculada en `PagoDetalle` y `LiquidacionDetalle`): `https://wa.me/{telefono}?text={quote(texto)}` con el teléfono del contacto `type in ("whatsapp", "telefono", "celular")` primario del inquilino/propietario, normalizado a dígitos con prefijo `54` si no lo tiene. `null` si no hay teléfono. El texto es el mismo cuerpo del email más el link al PDF.

**Listados**
- `listar_cobros(db, filtros)`: `estado` (`pendiente`, `parcial`, `pagado`, `anulado`, y el virtual `vencido` = `pendiente`/`parcial` con `fecha_vencimiento < hoy`), `vence_en_dias` (saldo > 0 y `fecha_vencimiento` entre hoy y hoy + N), `contrato_id`, `property_id`, `q` (título de propiedad, nombre del inquilino). Solo contratos `vigente` salvo que venga `contrato_id`. Orden `fecha_vencimiento`. Paginado con `total`.
- `listar_liquidaciones(db, filtros)`: `estado`, `periodo`, `contrato_id`. Orden `periodo desc`.
- `resumen(db, periodo=hoy.mes) -> {esperado, cobrado, vencido_monto, vencidos_cantidad, morosos, liquidaciones_sin_emitir}`: `esperado` = Σ `monto` de cobros no anulados con `periodo` = mes; `cobrado` = Σ pagos no anulados con `fecha_pago` en el mes; `vencido_*` sobre todos los cobros vencidos de contratos vigentes; `morosos` = contratos vigentes con ≥ 2 cobros vencidos o alguno vencido hace > 30 días; `liquidaciones_sin_emitir` = contratos vigentes administrados con pagos no liquidados con `fecha_pago` en meses anteriores al actual.

### 4.4 Cambios en módulos existentes

- **`inmobiliaria`**: `GET`/`PATCH` suman `punitorio_diario_pct`, `dias_gracia`; `GET` suma `email_configurado: bool` (solo lectura). `ultimo_recibo`/`ultima_liquidacion` no se exponen.
- **`alquileres` (2a)**: `ContratoCrear`/`ContratoActualizar` aceptan `punitorio_diario_pct`. `ContratoDetalle` suma `punitorio_diario_pct`, `resumen_cobros: {vencidos: n, saldo_vencido, proximo_vencimiento: date | null} | null` (null si no administrado) y, solo en la respuesta de `aplicar`, `cobros_no_actualizados: n`. `ContratoEnLista` suma `vencidos: n`. `listar_contratos` suma el filtro `sin_liquidar` (vigentes administrados con pagos no liquidados de meses anteriores al actual, el mismo criterio que `resumen.liquidaciones_sin_emitir`).
- **`storage`**: `guardar_pdf_contrato` se generaliza a `guardar_pdf(contenido, clave)` y `guardar_comprobante(contenido, clave, extension)`; la de contratos pasa a llamar a la genérica con su prefijo.
- **`config`**: variables SMTP y validador.

### 4.5 Endpoints

Prefijo `/api/v1/alquileres`.

| Método | Ruta | Cuerpo / query | Respuesta |
|---|---|---|---|
| `GET` | `/cobros` | filtros de 4.3 | `Paginado[CobroEnLista]` |
| `GET` | `/liquidaciones` | filtros | `Paginado[LiquidacionEnLista]` |
| `GET` | `/resumen` | `periodo?=YYYY-MM` | `Resumen` |
| `GET` | `/contratos/{id}/cobros/{cobro_id}` | | `CobroDetalle` |
| `PATCH` | `/contratos/{id}/cobros/{cobro_id}` | `{monto?, fecha_vencimiento?, notas?}` | `CobroDetalle` |
| `POST` | `/contratos/{id}/cobros/{cobro_id}/anular` | `{motivo}` | `CobroDetalle` |
| `GET` | `/contratos/{id}/cobros/{cobro_id}/punitorio` | `fecha_pago=` | `PunitorioSugerido` |
| `POST` | `/contratos/{id}/cobros/{cobro_id}/pagos` | `PagoCrear` | `CobroDetalle` 201 |
| `POST` | `/contratos/{id}/cobros/{cobro_id}/pagos/{pago_id}/anular` | `{motivo}` | `CobroDetalle` |
| `POST` | `/contratos/{id}/cobros/{cobro_id}/pagos/{pago_id}/enviar` | `{email?}` | `PagoDetalle` 202 |
| `GET` | `/contratos/{id}/gastos` | | `[GastoDetalle]` |
| `POST` | `/contratos/{id}/gastos` | `GastoCrear` | `GastoDetalle` 201 |
| `PATCH` | `/contratos/{id}/gastos/{gasto_id}` | `GastoActualizar` | `GastoDetalle` |
| `DELETE` | `/contratos/{id}/gastos/{gasto_id}` | | 204 |
| `PUT` | `/contratos/{id}/gastos/{gasto_id}/comprobante` | multipart `archivo` | `GastoDetalle` |
| `DELETE` | `/contratos/{id}/gastos/{gasto_id}/comprobante` | | `GastoDetalle` |
| `GET` | `/contratos/{id}/liquidaciones` | | `[LiquidacionDetalle]` |
| `GET` | `/contratos/{id}/liquidaciones/preview` | `periodo=YYYY-MM` | `LiquidacionPreview` |
| `POST` | `/contratos/{id}/liquidaciones` | `{periodo, notas?}` | `LiquidacionDetalle` 201 |
| `POST` | `/contratos/{id}/liquidaciones/{liq_id}/pagar` | `{fecha_pago}` | `LiquidacionDetalle` |
| `POST` | `/contratos/{id}/liquidaciones/{liq_id}/enviar` | `{email?}` | `LiquidacionDetalle` 202 |

`ContratoDetalle` (2a) suma `cobros: [CobroDetalle]` (con sus pagos), `gastos: [GastoDetalle]`, `liquidaciones: [LiquidacionEnLista]` para que la ficha cargue con una sola llamada; los endpoints de cobro/pago devuelven `CobroDetalle` y el panel reemplaza esa fila.

`CobroDetalle` = columnas + `pagado`, `saldo`, `dias_atraso`, `vencido`, `pagos: [PagoDetalle]`. `PagoDetalle` = columnas + `recibo_numero_formateado` (`0001-00000047`) + `whatsapp_url` + `registrado_por: {id, name}`. `LiquidacionDetalle` = columnas + `numero_formateado` + `whatsapp_url` + `pagos` + `gastos`.

## 5. PDFs y email

### 5.1 `app/pdf.py`

`class DocumentoMambo(FPDF)` con la fuente DejaVu registrada en el constructor y:
- `encabezado(inmobiliaria)`: logo a la izquierda si hay `logo_storage_key` (bytes vía `leer_archivo`; si falla, sigue sin logo), nombre en negrita, CUIT, dirección, teléfono y email.
- `titulo(texto, numero_formateado, fecha)`.
- `parrafo(texto)`, `tabla(encabezados, filas, alineacion_derecha=[índices])`, `total(etiqueta, monto_formateado, destacado=True)`.
- `pie()`: "Documento no válido como factura" en gris y chico.
- `bytes()`: `self.output()`.

`formato_moneda(monto: Decimal, moneda: str) -> str` en `app/formato.py` (nuevo, compartido): `$ 1.234.567,89` / `US$ 1.500,00`. `monto_en_letras(monto) -> str` ("un millón doscientos treinta y cuatro mil quinientos sesenta y siete con 89/100") — implementación propia en el mismo archivo, sin dependencia.

### 5.2 Recibo — `recibos.generar_recibo_pdf(pago, cobro, contrato, inmobiliaria) -> bytes`

Encabezado; título `RECIBO N° 0001-00000047` con `fecha_pago`; "Recibí de **{inquilinos separados por «y»}** (DNI …)"; propiedad: título y dirección; período: `Octubre 2026`; tabla: `Alquiler período Octubre 2026` → `monto`; si `punitorio > 0`, `Punitorio por {dias} días de atraso` → `punitorio`; total en número y en letras; "Medio de pago: Transferencia · Ref. …"; si el cobro queda `parcial`: "Saldo pendiente del período: …"; "Registrado por {user.name}"; pie.

### 5.3 Liquidación — `liquidaciones.generar_liquidacion_pdf(liq, contrato, inmobiliaria) -> bytes`

Encabezado; `LIQUIDACIÓN N° 0001-00000012` con fecha de emisión; "Propietario: **{propietarios}**"; propiedad; "Período: Octubre 2026"; tabla "Cobros" (fecha, recibo N°, período del alquiler, alquiler, punitorio) con subtotal; línea "Honorarios de administración {pct} %" en negativo; tabla "Gastos" (fecha, tipo, concepto, monto) con subtotal en negativo; **Total a transferir** (o "Saldo a favor de la inmobiliaria" si es negativo); notas; pie.

### 5.4 `app/email.py`

- `email_configurado() -> bool`.
- `enviar_email(destinatario: str, asunto: str, cuerpo: str, adjuntos: list[Adjunto] = ())`, `Adjunto = NamedTuple(nombre, contenido: bytes, mime: str)`. `EmailMessage` de la stdlib, `From = EMAIL_FROM`; `smtplib.SMTP_SSL` si `SMTP_PORT == 465`, si no `SMTP` + `starttls()`; `login` solo si hay usuario. Lanza `EmailNoEnviado` (excepción propia) envolviendo cualquier `smtplib` error.
- Texto plano, sin HTML.

### 5.5 Textos

- Recibo — asunto: `Recibo N° {n} · {propiedad} · {período}`. Cuerpo:
  ```
  Hola {nombre del inquilino},
  Te enviamos el recibo N° {n} por el alquiler de {propiedad}, período {período}: {total}.
  {si parcial: Queda un saldo pendiente de {saldo}.}
  Adjuntamos el recibo en PDF. {En WhatsApp: en lugar de "Adjuntamos…", el link al PDF.}
  {nombre de la inmobiliaria} · {teléfono} · {email}
  ```
- Liquidación — asunto: `Liquidación {período} · {propiedad}`. Cuerpo análogo con `total_a_transferir`.

### 5.6 Tests del envío

Fixture `emails_enviados` en `conftest.py`: monkeypatchea `app.email.enviar_email` por una función que acumula `(destinatario, asunto, cuerpo, adjuntos)`; fixture `smtp_configurado` que setea las cinco variables en `Settings` (limpiando el `lru_cache` de `get_settings`). `TestClient` ejecuta los `BackgroundTask` al terminar la request, así que el test puede afirmar sobre `enviado_email_at` en el mismo flujo.

## 6. Frontend

Patrón del 2a: se extienden `client/src/types/alquileres.ts` y `client/src/api/alquileres.ts`; componentes nuevos bajo `client/src/components/crm/<Nombre>/`; helpers de formato en `client/src/lib/alquileres.ts` (`numeroRecibo`, `etiquetaEstadoCobro`, `nombreMes`).

### 6.1 Ficha del contrato (`/admin/alquileres/:id`)

Si `administrado`, tres bloques nuevos debajo de la línea de ajustes (si no, un aviso "Contrato no administrado: sin cobros ni liquidaciones" con link a editar).

- **`TablaCobros`**: fila por período — período, vence, monto, pagado, saldo, chip de estado: `al día` (pendiente sin vencer), `vence en N días` (≤ 7), `vencido N días`, `parcial`, `pagado`, `anulado`. Acciones: "Registrar pago" (pendiente/parcial y contrato vigente), "Editar" (sin pagos), "Anular mes" (sin pagos, con confirmación). Fila con pagos expandible: fecha, recibo N° formateado, alquiler + punitorio, medio y referencia, botones **Ver PDF** (abre `recibo_pdf_url`), **Enviar por email** (deshabilitado con tooltip si `!email_configurado` o sin email; muestra "Enviado el …" cuando `enviado_email_at` existe, con "Reenviar"), **WhatsApp** (abre `whatsapp_url` en pestaña nueva; oculto si null), **Anular** (oculto si liquidado; muestra "Liquidado en N° …"). Pagos anulados en gris tachado con el motivo.
- **`ModalRegistrarPago`**: `fecha_pago` (default hoy), `monto` (default saldo), `punitorio` (al abrir y al cambiar la fecha pide `GET …/punitorio?fecha_pago=` y precarga; leyenda "N días de atraso × X % diario"; editable), `medio` (default transferencia), `referencia`, `notas`. Muestra "Total: alquiler + punitorio" en vivo. Envía; el 409/422 se muestra en el modal.
- **`TablaGastos`** con alta inline (**`FormularioGasto`**: fecha, tipo, concepto, monto, comprobante opcional). Filas: fecha, tipo, concepto, monto, comprobante (link), "Liquidado en N° …" o Editar/Borrar.
- **`BloqueLiquidaciones`**: lista (período, N°, total a transferir, estado, Ver PDF, Enviar/Enviado, "Marcar pagada" con fecha) y botón "Liquidar período" → **`ModalLiquidar`**: selector de mes (default: mes anterior), pide el `preview` y muestra el desglose completo (filas de cobros, honorarios, filas de gastos, total); "No hay nada que liquidar" si viene vacío; confirmar → `POST`.
- Al aplicar un ajuste, si la respuesta trae `cobros_no_actualizados > 0`, aviso "N períodos con pagos no se actualizaron".

### 6.2 Lista de cobros (`/admin/alquileres/cobros`)

Tabla transversal, filtros en la query string: `estado` (default `vencido`; opciones pendiente/parcial/pagado/todos), `vence_en_dias`, `q`. Columnas: propiedad, inquilino, período, vence, saldo, días de atraso, estado; la fila linkea a la ficha del contrato. A 400px, tarjetas.

### 6.3 Configuración de la inmobiliaria

Campos `punitorio_diario_pct` ("% diario de punitorio") y `dias_gracia`. Indicador "Envío de emails: configurado / no configurado (definir SMTP_* en el servidor)".

### 6.4 `FormularioContrato`

Campo `punitorio_diario_pct` junto a `honorarios_pct`, visible solo con `administrado`, placeholder "Usa el de la inmobiliaria (X %)".

### 6.5 Dashboard y menú

Tres tiles desde `GET /alquileres/resumen`: "Cobros vencidos" (`vencidos_cantidad` y `vencido_monto`) → `/admin/alquileres/cobros?estado=vencido`; "Cobrado este mes" (`cobrado` / `esperado`) → `/admin/alquileres/cobros?estado=pagado`; "Liquidaciones sin emitir" → `/admin/alquileres?sin_liquidar=1` (la lista de contratos suma ese filtro y la columna `vencidos`). El menú "Alquileres" tiene dos entradas: "Contratos" y "Cobros".

## 7. Manejo de errores

- 404: contrato, cobro, pago, gasto o liquidación inexistentes o de otro contrato.
- 409: contrato no vigente para registrar pago; cobro pagado o anulado; pago ya anulado o liquidado; editar/anular cobro con pagos; gasto liquidado; liquidación duplicada o vacía; liquidación ya pagada; dejar de administrar con cobros pagados; acortar el contrato dejando afuera períodos con pagos; email no configurado; sin destinatario.
- 422: monto ≤ 0 o > saldo; punitorio negativo; comprobante de tipo o tamaño inválido; `periodo` mal formado; `fecha_pago` futura.
- Mensajes en castellano; el panel muestra el `detail` en el modal o arriba del bloque, como en el 2a.

## 8. Tests

### Backend (`src/tests/`)
- `test_alquileres_cobros.py`: `generar_cobros` (12 meses inclusive; primer mes con inicio después del `dia_vencimiento`; no administrado → `[]`; monto por período sigue a los ajustes aplicados por fecha); crear contrato administrado inserta cobros; `aplicar_ajuste` actualiza solo períodos sin pagos y devuelve `cobros_no_actualizados`; PATCH `administrado` false→true genera, true→false borra o 409; PATCH `fecha_fin`/`dia_vencimiento` regenera pendientes y 409 si deja afuera pagados; rescindir anula los posteriores y deja el mes de corte; PATCH `monto` con pagos (409); anular cobro con pagos (409).
- `test_alquileres_pagos.py`: pago total → `pagado`; parcial → `parcial` y luego total; `monto > saldo` (422); sobre `pagado`/`anulado`/contrato no vigente (409); punitorio sugerido con y sin gracia, con override del contrato, 0 sin configuración, y respetado si viene en el body; numeración correlativa en pagos consecutivos y sin reuso tras anular; recibo subido (bytes empiezan con `%PDF`, clave esperada); rollback completo si la subida falla (monkeypatch de `guardar_pdf` que lanza); anular pago liquidado (409); `whatsapp_url` con teléfono con y sin `54`, y null sin teléfono.
- `test_alquileres_gastos.py`: alta, edición, borrado; comprobante subir/reemplazar (borra el anterior)/quitar; tipo o tamaño inválido (422); editar/borrar liquidado (409).
- `test_alquileres_liquidaciones.py`: preview con pagos de dos meses distintos (solo entra el del mes); gastos atrasados entran; totales exactos con `Decimal` y honorarios snapshot; total negativo se emite; período duplicado (409); vacío (409); pagos y gastos marcados; numeración propia; pagar y pagar de nuevo (409); PDF subido.
- `test_alquileres_envio.py`: con `smtp_configurado` y email primario → 202, `emails_enviados` tiene destinatario, asunto, adjunto PDF, y `enviado_email_at` seteado; `email` explícito en el body gana; sin email (409); SMTP no configurado (409); pago anulado (409); fallo de SMTP no marca `enviado_email_at`; `Settings` rechaza SMTP a medias.
- `test_pdf.py`: `DocumentoMambo` con y sin logo; `formato_moneda` y `monto_en_letras` (casos: 0, 1, 21, 100, 1.000, 1.234.567,89).
- `test_alquileres_listados.py`: `/cobros` con cada filtro (incluido `vencido` virtual y `vence_en_dias`), `/liquidaciones`, `/resumen` (esperado, cobrado, vencidos, morosos por ambos criterios, sin emitir).
- `test_inmobiliaria.py`: PATCH de los campos nuevos; `email_configurado` en el GET.
- `alembic check` limpio tras la `0006`.

### Frontend (`client/`, `--pool=threads`)
- `TablaCobros`: chip por estado y fecha; acciones según estado y pagos; fila expandida con pagos; botones de envío según `email_configurado`/`enviado_email_at`/`whatsapp_url`.
- `ModalRegistrarPago`: defaults; precarga del punitorio al cambiar la fecha; total en vivo; 422/409 mostrados.
- `TablaGastos` / `FormularioGasto`: alta, comprobante, bloqueo si liquidado.
- `ModalLiquidar`: pide preview, muestra desglose, vacío, confirma.
- Lista de cobros: filtros en URL, filas, tarjetas a 400px.
- Dashboard: tres tiles con los valores de `resumen` y sus links.
- Configuración: campos nuevos e indicador de email.
- Ficha con contrato no administrado: aviso y sin bloques.

## 9. Verificación antes de dar por terminado

1. `cd src && python -m pytest tests/ -q && ruff check app tests && alembic check` (con `DATABASE_URL` apuntando a una base local migrada a `head`).
2. `cd client && npm test && npx tsc --noEmit && npm run build`.
3. A mano, backend y frontend levantados, con `SMTP_*` apuntando a una cuenta de Gmail de prueba: crear un contrato administrado → ver los cobros generados → registrar un pago parcial y luego el total (con atraso, ver el punitorio sugerido) → abrir el recibo PDF (logo, tildes, total en letras) → enviarlo por email y por WhatsApp → cargar un gasto con comprobante → liquidar el mes, ver el desglose y el PDF → marcar pagada → intentar anular un pago liquidado (409) → aplicar un ajuste y ver que los períodos futuros cambian.
4. Panel a 400px: tabla de cobros en tarjetas, modales usables.
5. `docs/despliegue.md`: nota de la migración `0006` y de las cinco variables `SMTP_*` en Render (opcionales; sin ellas los botones de envío quedan deshabilitados).
6. **No commitear ni pushear**: dejar los cambios en el working tree y avisar a Matías qué archivos se tocaron.
