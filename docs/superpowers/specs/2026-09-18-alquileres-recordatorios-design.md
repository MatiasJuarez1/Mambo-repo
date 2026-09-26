# Administración de alquileres · 2c: Recordatorios — Diseño

**Bloque 2c** del [mapa de funcionalidades](2026-09-11-mapa-de-funcionalidades.md). Cierra el Bloque 2. Construye sobre el [2a](2026-09-16-alquileres-contratos-design.md) y el [2b](2026-09-17-alquileres-cobros-design.md). Estado: aprobado.

> **Regla de trabajo para quien implemente esto (humano o agente):** no hacer `git commit` ni `git push` de nada. Se deja todo en el working tree y Matías se encarga de commitear y pushear. Vale para el spec, el plan y cada tarea de implementación.

## 1. Objetivo

Que el staff vea en un solo lugar qué hay que atender en los próximos días —cobros vencidos y por vencer, ajustes que hay que aplicar, contratos que terminan— y reciba lo mismo por email cada mañana, sin recorrer contrato por contrato. Es lo que el cliente pidió como "recordatorio de cobro" y "recordatorio de aumento de alquiler".

## 2. Alcance

**Entra**
1. Bandeja unificada de recordatorios: `GET /api/v1/alquileres/recordatorios?dias=N`, calculada al vuelo desde lo que ya existe. Sin tabla nueva.
2. Email diario al staff con esa bandeja en texto plano, disparado por un cron externo contra `POST /api/v1/alquileres/recordatorios/enviar`, autenticado con un token propio.
3. Workflow de GitHub Actions (`schedule` + `workflow_dispatch`) que hace el `POST` todos los días.
4. `inmobiliaria.dias_aviso_recordatorios` (default 30) para la ventana por defecto. Migración `0007`.
5. Panel: bloque "Próximos N días" en el dashboard, página `/admin/alquileres/recordatorios` con selector de ventana, entrada en el menú, campo e indicador en Configuración.

**No entra**
- Persistir recordatorios, "marcar como visto", "posponer". Si algo aparece es porque falta hacerlo; desaparece cuando se hace (se registra el pago, se aplica el ajuste, se renueva o finaliza el contrato).
- Recordatorios al inquilino o al propietario (WhatsApp/email automático a terceros). El 2b ya deja el link de WhatsApp prearmado por pago; el envío automático requiere API paga.
- Alertas escalonadas distintas a 90/60/30: es la misma ventana con `dias` distinto.
- Disparar el envío desde el panel. El `workflow_dispatch` cubre la prueba manual.
- Cron propio (Render free no lo tiene) o cola de tareas.

## 3. Decisiones

1. **Una lista heterogénea, no tres.** El staff quiere saber "qué tengo que hacer", no consultar tres pantallas. Cada ítem trae `tipo`, `fecha`, `dias` y lo mínimo para identificarlo y saltar a la ficha del contrato.
2. **Se calcula, no se guarda.** Los cuatro tipos ya son consultas del 2a/2b (`cobros_vencidos`, `vence_en_dias`, `ajuste_en_dias`, `fecha_fin <= hoy + N`). Persistir duplicaría el estado y obligaría a sincronizarlo. Cuesta cuatro queries por request; el volumen (decenas de contratos) lo permite de sobra.
3. **Lo atrasado siempre aparece.** Un cobro vencido hace 40 días, un ajuste con `fecha_prevista` pasada y sin aplicar, o un contrato con `fecha_fin` pasada y todavía `vigente` entran en la bandeja aunque `dias` sea 7: la ventana acota lo futuro, no lo pendiente. `dias` negativo = atrasado.
4. **El email es la bandeja en texto.** Mismo cálculo, mismo orden, agrupado por tipo. Sin HTML, como los recibos. Si la bandeja está vacía **no se manda nada** (`items: 0`, `enviado_a: []`): un email diario que dice "nada" se deja de leer a la semana.
5. **Disparo externo con token propio.** Nueva variable `RECORDATORIOS_TOKEN`, header `X-Recordatorios-Token`, comparado con `hmac.compare_digest`. Sin la variable el endpoint responde **404** (no existe superficie que atacar); con token incorrecto, **401**. No usa la cookie de sesión porque quien llama es un cron, no una persona. Disparador recomendado: GitHub Actions `schedule` a las 11:00 UTC (08:00 Argentina), con `RECORDATORIOS_URL` y `RECORDATORIOS_TOKEN` como secrets del repo. Alternativa documentada: cron-job.org.
6. **Envío sincrónico, no `BackgroundTask`.** A diferencia de recibos y liquidaciones (donde una persona espera la respuesta y el email puede salir después), acá quien llama es un cron que necesita saber si salió: 200 si se mandó, **502** si SMTP falló, así el job de Actions queda rojo y alguien lo ve. Si se dispara dos veces salen dos emails; aceptable.
7. **Destinatarios: el staff.** Usuarios activos, no eliminados, con rol `staff` o `admin`. `users.email` es `not null`, así que siempre hay dirección. Un solo email con todos en `To`. Sin destinatarios → 409.
8. **Ventana configurable por inmobiliaria**, no por usuario ni hardcodeada: `dias_aviso_recordatorios` (1–180, default 30). La usan el email y el default de la bandeja; el panel la puede pisar con `?dias=`.
9. **Ubicación: dentro de `alquileres`**, como submódulo `recordatorios.py`, montado bajo el mismo prefijo. Todo lo que recuerda es de alquileres; cuando el Bloque 5 traiga tareas y visitas se verá si conviene una bandeja general (y esta se convierte en una fuente más).

## 4. Backend

### 4.1 Módulo y montaje

`src/app/platform/alquileres/recordatorios.py`: cálculo puro (`listar`), texto del email (`texto_email`, `asunto_email`), destinatarios (`destinatarios_staff`) y envío (`enviar`). `router.py` suma dos endpoints. `schemas.py` suma los DTOs. Dependencia nueva en `app/platform/auth/dependencies.py`: `require_token_recordatorios`.

### 4.2 Modelos (migración `0007_recordatorios`)

**`inmobiliaria`** suma `dias_aviso_recordatorios` int not null, `server_default="30"`.

**`Settings`** suma `recordatorios_token: str | None` (`RECORDATORIOS_TOKEN`, opcional) y la propiedad `recordatorios_configurado = bool(recordatorios_token) and email_configurado`. No entra en `_validar_combinaciones`: un token sin SMTP no es un error de arranque, es un endpoint que responde 409 con el mensaje de siempre.

### 4.3 Contrato de interfaz

```python
class TipoRecordatorio(StrEnum):
    cobro_vencido = "cobro_vencido"      # pendiente/parcial, fecha_vencimiento < hoy
    cobro_por_vencer = "cobro_por_vencer"  # pendiente/parcial, hoy <= fecha_vencimiento <= hoy+dias
    ajuste = "ajuste"                    # ajuste pendiente, fecha_prevista <= hoy+dias
    fin_contrato = "fin_contrato"        # vigente, fecha_fin <= hoy+dias


class Recordatorio(BaseModel):
    tipo: TipoRecordatorio
    fecha: date                 # vencimiento / fecha_prevista / fecha_fin
    dias: int                   # (fecha - hoy).days; negativo = atrasado
    contrato_id: int
    referencia_id: int          # cobro_id / ajuste_id / contrato_id, para linkear o resaltar
    propiedad: PropiedadBrief
    inquilinos: list[ParteOut]
    moneda: str
    monto: Decimal | None       # saldo del cobro; monto vigente en ajuste y fin_contrato
    detalle: str                # "Octubre 2026", "Ajuste ICL", "Termina el contrato"


class Recordatorios(BaseModel):
    hoy: date
    dias: int
    total: int
    por_tipo: dict[TipoRecordatorio, int]   # las cuatro claves siempre presentes
    items: list[Recordatorio]               # orden: fecha asc, tipo, contrato_id


class EnvioRecordatorios(BaseModel):
    enviado_a: list[str]
    items: int
```

### 4.4 Reglas de negocio

**`listar(db, hoy, dias) -> Recordatorios`** (`recordatorios.py`)
- Solo contratos `vigente`.
- `cobro_vencido`: reusa `cobros.cobros_vencidos(db, hoy)`. `monto = saldo`, `detalle = nombre_periodo(periodo)`.
- `cobro_por_vencer`: cobros `pendiente`/`parcial` con `fecha_vencimiento` entre `hoy` y `hoy + dias` (mismo criterio que `listar_cobros(vence_en_dias=)`). Mismo `monto`/`detalle`.
- `ajuste`: ajustes `pendiente` con `fecha_prevista <= hoy + dias`. `monto = contrato.monto_vigente`, `detalle = f"Ajuste {indice}"` (`ICL`, `IPC`, `UVA`, `Casa Propia`, `Porcentaje fijo`; los contratos `sin_ajuste` no generan ajustes, así que no aparecen). `referencia_id = ajuste.id`.
- `fin_contrato`: contratos con `fecha_fin <= hoy + dias`. `monto = monto_vigente`, `detalle = "Termina el contrato"`; si ya tiene `renovacion`, `"Termina el contrato · renovado"` (sigue apareciendo hasta que se finalice, porque el viejo sigue `vigente`). `referencia_id = contrato.id`.
- Carga `propiedad` y `partes.person` con `selectinload` en cada consulta; `inquilinos` = partes con rol `inquilino`.
- Orden: `(fecha, tipo, contrato_id)`. `por_tipo` con las cuatro claves aunque valgan 0.

**`destinatarios_staff(db) -> list[str]`**: emails de `User` con `is_active`, `deleted_at is None` y algún rol en `("staff", "admin")`, ordenados.

**`asunto_email(recordatorios, inmobiliaria) -> str`**: `Recordatorios {nombre} · {dd/mm/yyyy} · {total} pendientes`.

**`texto_email(recordatorios, inmobiliaria) -> str`**, agrupado por tipo en este orden y omitiendo grupos vacíos:
```
Hola,
Esto es lo que hay que atender en los próximos {dias} días ({total} ítems).

COBROS VENCIDOS ({n})
- {propiedad} · {inquilinos} · {detalle} · saldo {monto} · vencido hace {|dias|} días
COBROS POR VENCER ({n})
- {propiedad} · {inquilinos} · {detalle} · {monto} · vence {hoy | mañana | en N días} ({dd/mm})
AJUSTES ({n})
- {propiedad} · {detalle} · previsto {dd/mm} ({atrasado N días | en N días}) · monto actual {monto}
CONTRATOS QUE TERMINAN ({n})
- {propiedad} · {inquilinos} · termina {dd/mm} ({en N días | hace N días})

Panel: {frontend_url}/admin/alquileres/recordatorios
{firma inmobiliaria}
```
La línea "Panel:" va solo si `settings.cors_origins_lista` tiene un origen (el primero es el del frontend en producción); en dev se omite.

**`enviar(db) -> EnvioRecordatorios`**
- `email_configurado_o_409()` (reusa la de `cobros.py`).
- `dias = inmobiliaria.dias_aviso_recordatorios`; `recordatorios = listar(db, hoy, dias)`.
- Si `total == 0` → `EnvioRecordatorios(enviado_a=[], items=0)`, sin llamar a SMTP.
- `destinatarios = destinatarios_staff(db)`; vacío → 409 "No hay usuarios staff con email".
- `enviar_email(", ".join(destinatarios), asunto, cuerpo)` **sincrónico**. `EmailNoEnviado` → 502 `"No se pudo enviar el email: {detalle}"`.
- Devuelve `EnvioRecordatorios(enviado_a=destinatarios, items=total)`.

**`require_token_recordatorios`** (`auth/dependencies.py`): lee `X-Recordatorios-Token`; si `settings.recordatorios_token` es None → 404 "Not Found" (mismo texto que FastAPI); si falta el header o `compare_digest` falla → 401 "Token inválido".

### 4.5 Endpoints

| Método | Ruta | Auth | Query / header | Respuesta |
|---|---|---|---|---|
| `GET` | `/api/v1/alquileres/recordatorios` | `SOLO_STAFF` | `dias?` (1–365; default `inmobiliaria.dias_aviso_recordatorios`) | `Recordatorios` |
| `POST` | `/api/v1/alquileres/recordatorios/enviar` | `X-Recordatorios-Token` | — | `EnvioRecordatorios` 200 |

Errores: 401 token inválido; 404 sin token configurado; 409 email no configurado / sin destinatarios; 502 SMTP falló.

### 4.6 Cambios en módulos existentes

- **`inmobiliaria`**: `InmobiliariaUpdate` suma `dias_aviso_recordatorios: int | None (ge=1, le=180)`; `InmobiliariaOut` suma `dias_aviso_recordatorios: int` y `recordatorios_configurado: bool` (de `Settings`, como `email_configurado`, en `desde()`).
- **`config`**: `recordatorios_token`, `recordatorios_configurado`.
- **`.env.example`**: `# RECORDATORIOS_TOKEN=` con una línea sobre cómo generarlo (`python -c "import secrets; print(secrets.token_urlsafe(32))"`).

### 4.7 Workflow de GitHub Actions

`.github/workflows/recordatorios.yml`:
```yaml
name: Recordatorios diarios
on:
  schedule:
    - cron: '0 11 * * *'   # 08:00 en Argentina (UTC-3)
  workflow_dispatch: {}
jobs:
  enviar:
    runs-on: ubuntu-latest
    steps:
      - name: POST /recordatorios/enviar
        run: |
          curl --fail-with-body -sS -X POST \
            -H "X-Recordatorios-Token: ${{ secrets.RECORDATORIOS_TOKEN }}" \
            "${{ secrets.RECORDATORIOS_URL }}/api/v1/alquileres/recordatorios/enviar"
```
`RECORDATORIOS_URL` es la URL de Render de la API (sin barra final). El job falla si la API responde 4xx/5xx, que es lo que se quiere ver. Render free duerme el servicio: el primer request puede tardar ~30 s; `curl` espera por defecto, alcanza.

## 5. Frontend

Patrón del 2b: `client/src/types/alquileres.ts`, `client/src/api/alquileres.ts`, `client/src/lib/alquileres.ts`; componente en `client/src/components/crm/BandejaRecordatorios/`; página en `client/src/pages/admin/alquileres/Recordatorios.tsx`.

### 5.1 Tipos y API

`TipoRecordatorio`, `Recordatorio`, `Recordatorios` espejo de 4.3. `alquileresApi.recordatorios(dias?: number) => Recordatorios` → `GET /recordatorios?dias=`.

### 5.2 `lib/alquileres.ts`

- `etiquetaTipoRecordatorio(tipo)`: `Cobros vencidos` / `Cobros por vencer` / `Ajustes` / `Contratos que terminan`.
- `chipRecordatorio(item) -> {texto, color}`: `dias < 0` → `hace N días` (rojo); `0` → `hoy` (naranja); `1` → `mañana`; `≤ 7` → `en N días` (naranja); resto → `en N días` (gris).
- `ORDEN_TIPOS_RECORDATORIO` para agrupar en el mismo orden que el email.

### 5.3 `BandejaRecordatorios`

Props: `datos: Recordatorios`, `compacto?: boolean` (dashboard: máximo 8 ítems y link "Ver los N"). Agrupa por tipo con un subtítulo y el conteo; cada fila: propiedad (link a `/admin/alquileres/:contrato_id`), inquilinos, detalle, fecha, monto (si hay), chip. Para `cobro_*` el link lleva `#cobro-{referencia_id}` para que la ficha pueda resaltar la fila (la ficha ya renderiza `TablaCobros`; se le suma el `id` a la fila, sin más). Vacío: "Nada pendiente en los próximos N días." A 400 px, tarjetas (mismas clases que la lista de cobros).

### 5.4 Dashboard

- Tile `Recordatorios` con `total` y `to="/admin/alquileres/recordatorios"`, tono `espera` si `total > 0`.
- El card "Bienvenido…" se reemplaza por `BandejaRecordatorios` compacta con título "Próximos {dias} días" y link "Ver todos". `dias` sale de la respuesta (el default de la inmobiliaria), no se hardcodea.
- Los tiles existentes de contratos que vencen y ajustes próximos quedan como están.

### 5.5 Página `/admin/alquileres/recordatorios`

`dias` en la query string (`?dias=`), selector 7 / 30 / 60 / 90 con el default de la inmobiliaria marcado. Muestra `BandejaRecordatorios` completa y, arriba, los cuatro conteos de `por_tipo` como chips. Ruta en `App.tsx` dentro de `alquileres`; entrada "Recordatorios" en `AdminLayout.tsx` **antes** de "Cobros" y "Contratos" (el título de la topbar sale del primer prefijo que matchea).

### 5.6 Configuración

Campo `dias_aviso_recordatorios` ("Días de aviso de recordatorios", 1–180) junto a `dias_gracia`. Indicador "Email diario de recordatorios: configurado / no configurado (definir `RECORDATORIOS_TOKEN` y `SMTP_*` en el servidor)" debajo del indicador de email existente, a partir de `recordatorios_configurado`.

## 6. Manejo de errores

- 401 / 404 del token: los ve el cron, no una persona; el texto es fijo.
- 409 email no configurado / sin destinatarios y 502 SMTP: `detail` en castellano; en Actions se lee en el log del job.
- `GET /recordatorios` con `dias` fuera de 1–365 → 422 de FastAPI.
- Panel: error de carga con `role="alert"` arriba de la bandeja, como en la lista de cobros.

## 7. Tests

### Backend (`src/tests/`)
- `test_alquileres_recordatorios.py`:
  - `listar`: contrato con cobro vencido, cobro que vence en 10 días, cobro que vence en 50 días, ajuste pendiente en 20 días, ajuste pendiente atrasado, `fecha_fin` en 25 días → con `dias=30` aparecen 5 ítems (no el de 50 días), con `dias` y `fecha` correctos, ordenados por fecha, `por_tipo` con las cuatro claves.
  - Contrato `finalizado` con cobros vencidos → no aparece. Cobro `anulado` → no aparece. Ajuste `aplicado`/`omitido` → no aparece. Contrato `sin_ajuste` → no genera ítems `ajuste`.
  - Contrato con `renovacion` → `fin_contrato` con detalle "renovado".
  - `GET /recordatorios` sin `dias` usa el de la inmobiliaria (PUT a 60 y comprobar que entra el cobro a 50 días); anónimo → 401.
  - `POST /enviar`: sin `RECORDATORIOS_TOKEN` → 404; token incorrecto → 401; sin header → 401; con token y `smtp_configurado` + `emails_enviados` → 200, `enviado_a` con los emails de staff/admin activos (no el inactivo, no el eliminado, no el sin rol), asunto con el total, cuerpo con los cuatro grupos en orden y el ítem vencido con "hace N días"; bandeja vacía → 200 `items: 0` y `emails_enviados` vacío; SMTP sin configurar → 409; sin usuarios staff → 409; `enviar_email` que lanza `EmailNoEnviado` → 502.
- `test_inmobiliaria.py`: PUT `dias_aviso_recordatorios` (y 422 con 0 o 181); `recordatorios_configurado` en el GET false por defecto y true con token + SMTP parcheados.
- `test_config.py`: `recordatorios_configurado` requiere token **y** SMTP.
- `alembic check` limpio tras la `0007`.

### Frontend (`client/`, `--pool=threads`)
- `lib/alquileres.test.ts`: `chipRecordatorio` para -3, 0, 1, 5, 20; `etiquetaTipoRecordatorio`.
- `BandejaRecordatorios.test.tsx`: agrupa en orden, muestra chip y link a la ficha con `#cobro-id`, compacta corta a 8 con "Ver los N", vacío.
- `Recordatorios.test.tsx`: lee `dias` de la URL, el selector lo cambia y vuelve a pedir, chips de `por_tipo`.
- `Dashboard.test.tsx`: tile "Recordatorios" con `total` y la bandeja compacta con el título "Próximos 30 días".
- `Configuracion.test.tsx`: campo nuevo e indicador según `recordatorios_configurado`.

## 8. Verificación antes de dar por terminado

1. `cd src && python -m pytest tests/ -q && ruff check app tests && ruff format --check app tests && alembic check` (con `DATABASE_URL` a una base local migrada a `head`).
2. `cd client && npm test && npx tsc --noEmit && npm run build`.
3. A mano, API y panel levantados: crear un contrato administrado con `fecha_inicio` hace 3 meses y `fecha_fin` en 20 días, con índice ICL y frecuencia 3 → en el dashboard aparecen cobros vencidos, el próximo por vencer, el ajuste pendiente y el fin del contrato; `/admin/alquileres/recordatorios?dias=7` deja afuera lo que está a más de 7 días pero mantiene lo atrasado; el link de un cobro abre la ficha con la fila resaltada. Con `SMTP_*` y `RECORDATORIOS_TOKEN` en el `.env`: `curl -X POST -H "X-Recordatorios-Token: …" localhost:8000/api/v1/alquileres/recordatorios/enviar` → 200 y el email llega con los cuatro grupos; sin header → 401; sin la variable → 404. Sacar después las `SMTP_*` del `.env`.
4. Panel a 400 px: la bandeja en tarjetas, el selector usable.
5. `docs/despliegue.md`: sección de la migración `0007`, la variable `RECORDATORIOS_TOKEN` en Render, los dos secrets en GitHub y cómo probar el workflow con "Run workflow". Actualizar el mapa: Bloque 2 terminado.
6. **No commitear ni pushear**: dejar los cambios en el working tree y avisar a Matías qué archivos se tocaron.
