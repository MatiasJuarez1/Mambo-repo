# Mapa de funcionalidades — Mambo como plataforma para inmobiliarias

**Estado:** aprobado como hoja de ruta. Cada bloque baja a su propio spec de diseño antes de implementarse.
**Bloque 1 terminado** (rama `feat/crm-en-el-panel`): [CRM en el panel](2026-09-11-crm-en-el-panel-design.md).
**Bloque 2 terminado** (2a, 2b y 2c): [Contratos y ajustes](2026-09-16-alquileres-contratos-design.md), [Cobros, recibos y liquidaciones](2026-09-17-alquileres-cobros-design.md), [Recordatorios](2026-09-18-alquileres-recordatorios-design.md).
**Bloque 4 terminado:** [Comisiones y estadísticas](2026-09-20-comisiones-estadisticas-design.md).
**Bloque 3 terminado:** [Contratos y documentos](2026-09-21-contratos-documentos-design.md) (21/09/2026; migración `0009` aplicada en Supabase).
**Siguiente:** Bloque 5 — Actividades y agenda (5a aprobado, spec: [Actividades y agenda](2026-09-21-actividades-agenda-design.md); 5b y 5c ahora son los Bloques 7 y 11).
**Pendiente sin bloque asignado (acordado el 22/09/2026):** rediseño estético del panel de admin, transversal a todos los módulos. Necesita su propio spec, con mockups antes de tocar pantallas.
**Orden de lo que sigue (decidido el 18/09/2026, extendido el 25/09/2026):** 4 → 3 → 5a → 6 → 7 → 8 → 9 → 10 → 11.
**Bloques 6-11 agregados el 25/09/2026** a partir de una nota de priorización de Matías: promueven ítems que estaban en "Después, solo si aparece la demanda" (la demanda apareció) más 5b/5c, que dejan de ser sub-bloques de 5 y pasan a numeración propia porque ya no dependen de que 5a esté implementado. Orden y motivo de cada uno en la sección 4.

## 1. Punto de partida

Lo que pidió el cliente (Bauti Ramallo, 25/08/2026), textual:

> cargar propiedades para venta · para alquiler · propiedades alquiladas con fecha y recordatorio de cobro · recordatorio de aumento de alquiler · contrato · datos comprador/vendedor · inquilino y dueño · estadísticas de ventas y de comisiones

Lo que ya existe en el repo al 11/09/2026:

| Área | Backend | Panel admin |
|---|---|---|
| Propiedades venta / alquiler / temporal, fotos con variantes | ✅ | ✅ |
| Publicaciones (avisos) | ✅ | ✅ desde el 22/09/2026 — la pantalla era un placeholder hasta [su spec](2026-09-22-publicaciones-panel-design.md) |
| Sitio público (listado, ficha, nosotros, servicios) | ✅ | — |
| Login de staff (JWT en cookie httponly, roles) | ✅ | ✅ |
| Personas y contactos | ✅ `people` | ❌ |
| Actividades (llamadas, visitas, tareas) | ✅ `activities` | ❌ |
| Reservas / señas | ✅ `reservations` | ❌ |
| Pipeline de operaciones (deals, etapas, partes) | ✅ `deals` | ❌ |
| Notas y auditoría | stubs | ❌ |
| Contratos de alquiler, cobros, ajustes, liquidaciones | ❌ | ❌ |
| Comisiones y estadísticas | ❌ | ❌ |

## 2. Qué hace el mercado

Referencias relevadas: Tokko Broker (CRM comercial dominante en Argentina), Rentaloop, FORUX, Ubiquo e Inmosoft (administración de alquileres).

**Administración de alquileres** — lo que se repite en todos:
- Contrato con partes (inquilino, propietario, garantes), inmueble, plazo, monto, moneda, día de vencimiento; el PDF firmado adjunto.
- Ajuste por índice (ICL, IPC, UVA, Casa Propia) calculado automáticamente, con aviso previo al aumento. Es la función más valorada.
- Cobros mensuales generados solos; registro del pago; recibo PDF con logo enviado por WhatsApp o email.
- Liquidación al propietario: cobrado − honorarios − gastos (expensas, reparaciones) = a transferir.
- Morosidad y punitorios; alerta de vencimiento de contrato a 60-90 días.
- Portal para propietario e inquilino (estado de cuenta, recibos).
- Link de pago Mercado Pago con conciliación; factura electrónica ARCA de honorarios.

**Lado comercial** (Tokko): difusión a portales (Zonaprop, Argenprop, Mercado Libre), leads con asignación automática, cruce demanda-vs-cartera, tasaciones, reservas.

**Reportes**: cobrado vs. esperado, comisiones por operación y por agente, auditoría de quién hizo qué.

**Lo que dicen los usuarios**: la queja principal contra el líder es el soporte, no las funciones. Nadie se diferencia por tener más features sino por ser simple y responder. Eso justifica el criterio YAGNI de este mapa: cada bloque entra cuando alguien lo necesita, no antes.

## 3. Decisiones de producto tomadas

1. **Alcance de alquileres: administración completa.** Algunas inmobiliarias cobran el alquiler y le liquidan al dueño; otras solo intermedian. El sistema soporta las dos: la administración se activa **por contrato**, no globalmente.
2. **Una inmobiliaria, con la puerta abierta.** Se diseña para una sola (Mambo Groups), pero la configuración de la inmobiliaria (nombre, logo, datos fiscales, honorarios por defecto) vive en una tabla, no en código. Convertirlo en multi-inmobiliaria después es agregar un `inmobiliaria_id`, no rehacer módulos.
3. **El rol de una persona se deriva de sus relaciones**, no se elige al cargarla: es dueña porque figura como propietaria de una propiedad, compradora porque cerró una operación como tal. Se suma una etiqueta libre para lo que todavía no tiene relación ("inversor", "busca depto zona norte").
4. **Dos pipelines: Venta y Alquiler.** El contrato de alquiler (bloque 2) nace de un deal de Alquiler ganado; la comisión (bloque 4) sale de cualquier deal ganado.
5. **El estado de la propiedad se guarda y lo actualizan reservas y deals** (no se deriva): conserva el estado manual (`baja`, ventas por afuera) y no toca el sitio público.

## 4. Bloques y orden

### Bloque 1 — CRM en el panel  ← terminado
Pantallas para lo que el backend ya tiene, más las reglas que faltaban.
- Personas: lista, ficha con vínculos, contactos, etiquetas, roles derivados.
- Propietario en la propiedad.
- Reservas: alta desde la propiedad, cancelar/vencer/convertir; la propiedad pasa a `reservada` sola.
- Operaciones: tablero Venta y Alquiler, ficha con partes; ganar cierra la propiedad.
- Configuración de la inmobiliaria.
- Infraestructura: CRM bajo `/api/v1` (hoy 404 en producción por el proxy), FKs que faltaban.

Spec: [2026-09-11-crm-en-el-panel-design.md](2026-09-11-crm-en-el-panel-design.md).

### Bloque 2 — Administración de alquileres  ← terminado
El módulo grande. Nace del deal de Alquiler ganado. Se implementa en tres partes: **2a** contratos y ajustes ([spec](2026-09-16-alquileres-contratos-design.md)), **2b** cobros, recibos y liquidaciones ([spec](2026-09-17-alquileres-cobros-design.md)), **2c** recordatorios ([spec](2026-09-18-alquileres-recordatorios-design.md)).
- **Contrato**: partes (inquilino, propietario, garantes), propiedad, inicio/fin, monto y moneda, día de vencimiento, índice y frecuencia de ajuste, ¿administrado? (sí/no), honorarios %, PDF adjunto en R2.
- **Calendario de ajustes**: fechas calculadas desde el contrato; valor del índice (ICL/IPC/UVA/Casa Propia) cargado a mano o importado; nuevo monto propuesto; aviso previo configurable (p. ej. 30 días).
- **Cobros** (solo contratos administrados): un cobro esperado por período generado solo; registro de pago parcial o total; punitorio configurable; estado al día / vencido / moroso.
- **Recibos PDF** con logo de la inmobiliaria; envío por email; link de WhatsApp prearmado.
- **Liquidación al propietario**: cobrado − honorarios − gastos cargados (expensas, reparaciones, impuestos) = a transferir; comprobante PDF.
- **Recordatorios**: bandeja en el panel de "próximos 30 días" (cobros que vencen, ajustes, contratos que terminan) y email diario al staff. Sin WhatsApp automático en primera versión (requiere API paga).
- **Vencimiento de contrato**: alerta a 90/60/30 días; renovar crea un contrato nuevo enlazado.

Fuera de la primera versión: portal de inquilino/propietario, Mercado Pago, facturación ARCA. Entran cuando una inmobiliaria los pida.

### Bloque 3 — Contratos y documentos  ← terminado
Adjuntos en R2 colgados de propiedad, persona, deal o contrato: boleto, reserva firmada, DNI, informe de dominio, anexo fotográfico. Tipo de documento, fecha, quién lo subió. Reusa `app.storage` tal cual.

Spec: [2026-09-21-contratos-documentos-design.md](2026-09-21-contratos-documentos-design.md).

### Bloque 4 — Comisiones y estadísticas  ← terminado
- Al ganar un deal: monto de la operación, % o monto de comisión (por defecto el de la inmobiliaria), reparto entre agentes, cobrada sí/no y fecha.
- Reportes por período: operaciones cerradas, monto total, comisiones generadas y cobradas, por tipo (venta/alquiler) y por agente; tasa de conversión por etapa; tiempo promedio en cada etapa.
- Alquileres administrados: cobrado vs. esperado del mes, morosidad, honorarios de administración.
- Exportación a CSV. Gráficos simples en el dashboard.

### Bloque 5 — Actividades y agenda
"Mis tareas" y agenda de visitas por agente, con vencimientos; el backend ya existe.

Spec de 5a: [2026-09-21-actividades-agenda-design.md](2026-09-21-actividades-agenda-design.md). Notas por entidad y auditoría eran 5b/5c y se renumeran como Bloques 7 y 11 (ver más abajo): no dependen de que 5a esté implementado y entran en un orden distinto al que tenían como sub-bloques de 5.

### Bloque 6 — Formulario de consulta en el sitio
Hoy el CRM (`people`, `activities`, `deals`) no tiene ninguna puerta de entrada de datos reales; todo se carga a mano. Sin esto, cada día arranca con el CRM vacío y el equipo sigue gestionando consultas por WhatsApp/mail fuera del sistema, que es exactamente lo que un CRM tiene que evitar. Primero de los seis porque los otros cinco (notas, matching, feed, calendario, auditoría) operan sobre datos que hoy no entran solos.

### Bloque 7 — Notas polimórficas
Hoy no hay dónde registrar "llamé y no atendió" o "quiere ver el depto el sábado" salvo en la `description` de una `Activity` puntual. Sin notas hay actividad (qué se hizo) pero no contexto acumulado (por qué, qué se dijo) — la diferencia entre un log de tareas y un historial de relación con el cliente. Era el sub-bloque 5b.

### Bloque 8 — Búsqueda/demanda + matching
Hoy inventario y personas son dos islas: quien busca una propiedad no está modelado, solo quien ya es parte de un `Deal`. Sin esto no se puede avisar automáticamente "entró una propiedad que matchea lo que este interesado buscaba" — el motor de venta proactiva que distingue un CRM inmobiliario de un simple registro de contactos. Depende del Bloque 6 (las búsquedas se cargan por consulta entrante o a mano, pero el formulario es la fuente de volumen).

### Bloque 9 — Feed XML a portales
Hoy la carga a Zonaprop/Argenprop es manual y duplicada (se carga en Mambo y de nuevo en el portal). El feed elimina ese doble trabajo y evita que el inventario quede desactualizado en un portal porque alguien se olvidó de replicar el cambio.

### Bloque 10 — Calendario + ICL/UVA automático
El calendario es barato (los datos de `Activity` ya existen, es una vista) y da visibilidad diaria real del equipo. El ajuste automático de alquileres evita el error manual de aplicar mal un índice — impacta directo en plata cobrada de más o de menos a un inquilino. Depende del Bloque 2 (contratos y ajustes), ya terminado.

### Bloque 11 — Auditoría + filtros públicos + responsive
Auditoría es trazabilidad (quién cambió qué), hoy un TODO vacío en `audit/service.py` — importa cuando haya más de una persona operando el CRM y algo salga mal. Era el sub-bloque 5c. Filtros públicos y responsive son experiencia de uso (el panel funciona pero se vuelve más usable para el día a día del equipo, no agregan capacidad nueva) — por eso van último y probablemente se fusionen con el rediseño estético pendiente (ver nota de arriba) en vez de spec propio.

### Después, solo si aparece la demanda
Tasaciones, portal de inquilino/propietario, Mercado Pago, facturación electrónica, WhatsApp automático, multi-inmobiliaria.

## 5. Dependencias

```text
Bloque 1 (CRM) ──► Bloque 2 (Alquileres) ──► Bloque 4 (Estadísticas: cobrado vs. esperado)
      │                    │                        │
      │                    │                        └──► Bloque 10 (Calendario + ICL/UVA)
      │                    └──► Bloque 3 (Documentos: PDF del contrato)
      ├──► Bloque 4 (Comisiones: salen del deal ganado)
      ├──► Bloque 5 (Actividades: vinculadas a persona y deal) ──► Bloque 10 (calendario, vista de Activity)
      ├──► Bloque 6 (Formulario de consulta: crea Person + Activity) ──► Bloque 8 (Matching: necesita demanda cargada)
      ├──► Bloque 7 (Notas: cuelgan de persona/propiedad/deal, ex 5b)
      ├──► Bloque 9 (Feed XML: expone el inventario que ya carga el Bloque 1)
      └──► Bloque 11 (Auditoría + filtros públicos + responsive, ex 5c)
```

El bloque 1 es prerrequisito de todo lo demás: sin personas cargadas no hay contrato ni comisión.
