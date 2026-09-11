# Mapa de funcionalidades — Mambo como plataforma para inmobiliarias

**Estado:** aprobado como hoja de ruta. Cada bloque baja a su propio spec de diseño antes de implementarse.
**Primer bloque en curso:** [CRM en el panel](2026-09-11-crm-en-el-panel-design.md).

## 1. Punto de partida

Lo que pidió el cliente (Bauti Ramallo, 25/08/2026), textual:

> cargar propiedades para venta · para alquiler · propiedades alquiladas con fecha y recordatorio de cobro · recordatorio de aumento de alquiler · contrato · datos comprador/vendedor · inquilino y dueño · estadísticas de ventas y de comisiones

Lo que ya existe en el repo al 11/09/2026:

| Área | Backend | Panel admin |
|---|---|---|
| Propiedades venta / alquiler / temporal, fotos con variantes, publicaciones | ✅ | ✅ |
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

### Bloque 1 — CRM en el panel  ← en curso
Pantallas para lo que el backend ya tiene, más las reglas que faltaban.
- Personas: lista, ficha con vínculos, contactos, etiquetas, roles derivados.
- Propietario en la propiedad.
- Reservas: alta desde la propiedad, cancelar/vencer/convertir; la propiedad pasa a `reservada` sola.
- Operaciones: tablero Venta y Alquiler, ficha con partes; ganar cierra la propiedad.
- Configuración de la inmobiliaria.
- Infraestructura: CRM bajo `/api/v1` (hoy 404 en producción por el proxy), FKs que faltaban.

Spec: [2026-09-11-crm-en-el-panel-design.md](2026-09-11-crm-en-el-panel-design.md).

### Bloque 2 — Administración de alquileres
El módulo grande. Nace del deal de Alquiler ganado.
- **Contrato**: partes (inquilino, propietario, garantes), propiedad, inicio/fin, monto y moneda, día de vencimiento, índice y frecuencia de ajuste, ¿administrado? (sí/no), honorarios %, PDF adjunto en R2.
- **Calendario de ajustes**: fechas calculadas desde el contrato; valor del índice (ICL/IPC/UVA/Casa Propia) cargado a mano o importado; nuevo monto propuesto; aviso previo configurable (p. ej. 30 días).
- **Cobros** (solo contratos administrados): un cobro esperado por período generado solo; registro de pago parcial o total; punitorio configurable; estado al día / vencido / moroso.
- **Recibos PDF** con logo de la inmobiliaria; envío por email; link de WhatsApp prearmado.
- **Liquidación al propietario**: cobrado − honorarios − gastos cargados (expensas, reparaciones, impuestos) = a transferir; comprobante PDF.
- **Recordatorios**: bandeja en el panel de "próximos 30 días" (cobros que vencen, ajustes, contratos que terminan) y email diario al staff. Sin WhatsApp automático en primera versión (requiere API paga).
- **Vencimiento de contrato**: alerta a 90/60/30 días; renovar crea un contrato nuevo enlazado.

Fuera de la primera versión: portal de inquilino/propietario, Mercado Pago, facturación ARCA. Entran cuando una inmobiliaria los pida.

### Bloque 3 — Contratos y documentos
Adjuntos en R2 colgados de propiedad, persona, deal o contrato: boleto, reserva firmada, DNI, informe de dominio, anexo fotográfico. Tipo de documento, fecha, quién lo subió. Reusa `app.storage` tal cual. Puede ir en paralelo con el bloque 2 o adelantarse si lo piden.

### Bloque 4 — Comisiones y estadísticas
- Al ganar un deal: monto de la operación, % o monto de comisión (por defecto el de la inmobiliaria), reparto entre agentes, cobrada sí/no y fecha.
- Reportes por período: operaciones cerradas, monto total, comisiones generadas y cobradas, por tipo (venta/alquiler) y por agente; tasa de conversión por etapa; tiempo promedio en cada etapa.
- Alquileres administrados: cobrado vs. esperado del mes, morosidad, honorarios de administración.
- Exportación a CSV. Gráficos simples en el dashboard.

### Bloque 5 — Actividades y agenda
"Mis tareas" y agenda de visitas por agente, con vencimientos; el backend ya existe. Notas por entidad y pantalla de auditoría.

### Después, solo si aparece la demanda
Difusión a portales (Zonaprop, Argenprop, ML), captura de leads desde el sitio público con asignación automática, cruce demanda-vs-cartera, tasaciones, portal de inquilino/propietario, Mercado Pago, facturación electrónica, WhatsApp automático, multi-inmobiliaria.

## 5. Dependencias

```text
Bloque 1 (CRM) ──► Bloque 2 (Alquileres) ──► Bloque 4 (Estadísticas: cobrado vs. esperado)
      │                    │
      │                    └──► Bloque 3 (Documentos: PDF del contrato)
      ├──► Bloque 4 (Comisiones: salen del deal ganado)
      └──► Bloque 5 (Actividades: vinculadas a persona y deal)
```

El bloque 1 es prerrequisito de todo lo demás: sin personas cargadas no hay contrato ni comisión.
