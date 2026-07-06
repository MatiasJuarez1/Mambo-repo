# Plataforma, personas y CRM — plan de desarrollo

Este documento es la **guía de trabajo** para quien desarrolla el bloque **Plataforma + Personas + CRM** (backend y frontend). El otro integrante se encarga del **catálogo** (propiedades y publicaciones).

---

## 1. Qué cubrís vos (alcance)

| Módulo | Tablas | Qué es en el producto |
|--------|--------|------------------------|
| **Identidad y acceso** | `users`, `roles`, `user_roles`, `sessions` | Staff que entra al sistema, permisos, sesiones seguras |
| **Personas y contactos** | `people`, `people_contacts` | Clientes, propietarios e interesados **sin** obligar login |
| **Actividades** | `activities` | Llamadas, WhatsApp, visitas, tareas; timeline comercial |
| **Reservas** | `reservations` | Reservas / señas con `person_id` y `property_id` |
| **Ventas y pipeline** | `pipelines`, `pipeline_stages`, `deals`, `deal_parties` | Embudo tipo CRM: oportunidades, etapas, partes |
| **Notas** | `notes` | Comentarios internos por entidad (`person`, `property`, `listing`, etc.) |
| **Auditoría** | `audit_log` | Trazabilidad de acciones con actor y metadata |

**Fuera de tu alcance directo:** inventario y publicaciones (`properties`, `property_locations`, `property_media`, `property_features`, `listings`) — las **consumís por ID** cuando armes actividades, reservas, deals o notas enlazadas a propiedad.

---

## 2. Cómo coordinás con el integrante del catálogo

- **Vos definís** el contrato de autenticación (cookie de sesión, JWT, header `Authorization`, etc.) y el formato de **401/403**.
- Las rutas del catálogo que **crean/editan/borran** deben usar **tu** verificación de “es staff”. No dupliques lógica de login en el otro lado: el front del catálogo solo guarda el token o la cookie que vos entregás.
- Acordá un **`openapi.json`** o `/docs` actualizado cuando cambien DTOs de auth o de `users`.
- **Orden práctico:** entregá **login + “soy staff”** lo antes posible; el catálogo puede seguir con **GET públicos** mientras tanto.

---

## 3. Leyenda de prioridad

| Prioridad | Significado |
|-----------|-------------|
| **P0 — Urgente** | Bloquea al otro integrante o al MVP de “solo staff puede editar”. Hacer primero. |
| **P1 — Alto** | Base del CRM; sin esto el resto del bloque queda flojo. |
| **P2 — Medio** | Valor claro; puede esperar a tener P0+P1 estable. |
| **P3 — Bajo / después** | Mejora continuidad operativa o compliance; no impide demo. |

---

## 4. Plan paso a paso (tareas y dependencias)

### Fase P0 — Urgente: identidad mínima viable

**Objetivo:** un miembro del staff puede entrar, queda autenticado, y el backend puede decir “no autenticado” / “no autorizado” de forma uniforme.

| # | Tarea | Backend | Frontend | Depende de |
|---|--------|---------|----------|------------|
| P0.1 | Modelo de datos y migraciones para `roles`, `users`, `user_roles`, `sessions` (o el subset que uses en v1) | Crear tablas, seeds mínimos (`admin` / `staff`), índices y FK según esquema | — | MySQL disponible + convención de migraciones en el repo |
| P0.2 | Registro de usuario (opcional en v1) o **solo seed** de un usuario admin | Hash de contraseña (bcrypt/argon2), nunca guardar plano | Pantalla solo si habilitás registro; si no, login con usuario seed | P0.1 |
| P0.3 | **Login** + creación de sesión | `POST /auth/login` → valida credenciales, crea fila en `sessions` (o emite JWT si elegís stateless), devuelve cookie o token | Pantalla login, manejo de error (credenciales inválidas) | P0.1 |
| P0.4 | **Logout** y revocación | `POST /auth/logout` → `revoked_at` en sesión o invalidación de token | Botón logout, limpiar estado local | P0.3 |
| P0.5 | **Middleware de autenticación** | Dependencia FastAPI que resuelve `current_user` desde cookie/JWT; rutas protegidas devuelven 401 si falta auth | Cliente HTTP que adjunta credenciales en cada request mutativa | P0.3 |
| P0.6 | **Autorización por rol** | Dependencia `require_role("staff")` (o equivalente) usando `user_roles` + `roles` | Ocultar rutas UI o mostrar 403 si el rol no alcanza | P0.5 |
| P0.7 | **Perfil actual** | `GET /auth/me` o `/users/me` con datos mínimos (id, email, roles) | Layout post-login, mostrar usuario | P0.5 |

**Definición de hecho (P0):** desde el front podés loguearte, refrescar la página sin perder sesión (si usás cookie httpOnly o refresh acordado), llamar a un endpoint protegido de prueba y recibir 401 sin credenciales.

---

### Fase P1 — Alto: personas y contactos

**Objetivo:** ABM de contactos reutilizable por reservas, deals y actividades.

| # | Tarea | Backend | Frontend | Depende de |
|---|--------|---------|----------|------------|
| P1.1 | CRUD `people` | Listar con búsqueda por nombre/documento; crear/editar; soft delete si aplica (`deleted_at`) | Lista + formulario alta/edición + detalle | P0.5 (mutaciones solo staff) |
| P1.2 | CRUD `people_contacts` | Sub-recurso por persona: alta de email/tel/WhatsApp, marcar `is_primary`, validar unicidad `(person_id, type, value)` | UI en ficha de persona: lista de contactos + agregar/quitar | P1.1 |
| P1.3 | Enlace con `users` | Si un `user` tiene `person_id`, exponer en `GET /users/me` el `person_id` para deep-links | — | P0.7 + P1.1 |

**Definición de hecho (P1):** podés crear una persona, agregarle dos contactos, marcar uno como principal y volver a encontrarla por búsqueda.

---

### Fase P2 — Medio: actividades (timeline)

**Objetivo:** registro operativo de interacciones ligadas a persona y/o propiedad/listing.

| # | Tarea | Backend | Frontend | Depende de |
|---|--------|---------|----------|------------|
| P2.1 | CRUD `activities` | Crear con `activity_type`, `due_at`, `assigned_to_user_id`, FKs opcionales a `person_id`, `property_id`, `listing_id` | Formulario “nueva actividad” + lista filtrable | P0.5, P1.1 recomendable |
| P2.2 | Filtros y vistas | Endpoints o query params: por persona, por usuario asignado, por estado `pendiente/hecha` | Vista “Mis tareas” / timeline por persona | P2.1 |
| P2.3 | Cierre de tarea | PATCH marcar `done_at`, `status=hecha` | Botón “completar” en lista | P2.1 |

**Nota:** `property_id` / `listing_id` referencian tablas del otro integrante; **no** implementes lógica de precio ni de publicación: solo validá que el ID exista (FK o check vía API del catálogo si no hay FK en tu entorno dev).

**Definición de hecho (P2):** desde la ficha de una persona podés crear una visita asignada a un usuario y marcarla hecha.

---

### Fase P3 — Medio: reservas

**Objetivo:** reservar un inmueble vinculando `property_id` + `person_id` y estados básicos.

| # | Tarea | Backend | Frontend | Depende de |
|---|--------|---------|----------|------------|
| P3.1 | CRUD `reservations` | Estados `activa/cancelada/vencida/convertida`; validaciones de fechas y `expires_at` si aplica | Lista por propiedad y por persona; formulario alta | P1.1, P0.5 |
| P3.2 | Reglas de negocio mínimas | Evitar dos reservas `activa` sobre la misma propiedad si es política del negocio (definir con el equipo) | Mensajes de error claros | P3.1 |

**Definición de hecho (P3):** crear reserva activa para una persona y una propiedad existente; cancelarla y ver historial.

---

### Fase P4 — Medio / posterior inmediato: deals y pipeline

**Objetivo:** embudo comercial reutilizable para migrar mentalidad CRM.

| # | Tarea | Backend | Frontend | Depende de |
|---|--------|---------|----------|------------|
| P4.1 | CRUD `pipelines` y `pipeline_stages` | Seed inicial (ej. “Venta” + etapas Lead → Visita → Oferta → Cierre) | UI admin de etapas (opcional al inicio) | P0.5 |
| P4.2 | CRUD `deals` | Asociar `pipeline_id`, `stage_id`, `property_id` opcional, `assigned_to_user_id`, montos | Tabla o vista Kanban mínima | P4.1, P1.1 |
| P4.3 | `deal_parties` | Alta de partes con `role` (propietario, interesado, etc.) | Selector de persona + rol en ficha de deal | P4.2, P1.1 |
| P4.4 | Movimiento de etapa | PATCH `stage_id`, reglas `is_won` / `is_lost` | Arrastrar tarjeta o selector de etapa | P4.2 |

**Definición de hecho (P4):** crear deal en etapa inicial, mover de etapa, asociar al menos dos personas con roles distintos.

---

### Fase P5 — Bajo (o paralelo cuando haga falta): notas

**Objetivo:** comentarios internos por entidad sin duplicar pantallas por tabla.

| # | Tarea | Backend | Frontend | Depende de |
|---|--------|---------|----------|------------|
| P5.1 | CRUD `notes` | `entity_type` + `entity_id`; validar que `created_by_user_id` sea el usuario actual | Componente reutilizable “Notas” en ficha persona/deal/propiedad (propiedad: solo lectura si el front catálogo la embebe) | P0.5 |

**Definición de hecho (P5):** agregar nota en una persona y listar ordenado por `created_at` DESC.

---

### Fase P6 — Bajo: auditoría

**Objetivo:** rastro de acciones para soporte y mejora futura.

| # | Tarea | Backend | Frontend | Depende de |
|---|--------|---------|----------|------------|
| P6.1 | Servicio `audit_log` | Registrar `entity_type`, `entity_id`, `action`, `actor_user_id`, `metadata_json` en operaciones sensibles (login fallido opcional, cambios de rol, cambios de etapa de deal) | Pantalla solo staff: búsqueda por entidad o por usuario | P0.5 |

**Definición de hecho (P6):** al cambiar rol o etapa de deal queda un registro consultable.

---

## 5. Resumen visual de dependencias entre fases

```text
P0 (Auth) ──► P1 (Personas) ──► P2 (Actividades) ──► P3 (Reservas)
                    │                    │
                    └────────────────────┴──► P4 (Deals / Pipeline)
                                              │
P5 (Notas) ◄── cualquier ficha con entidad ───┤
P6 (Auditoría) ◄── a medida que estabilicés APIs sensibles
```

---

## 6. Organización sugerida en el repo

Para no pisar al integrante del catálogo:

- **Backend:** carpeta o prefijo dedicado, por ejemplo `app/platform/` con submódulos `auth/`, `people/`, `activities/`, `reservations/`, `deals/`, `notes/`, `audit/`.
- **Frontend:** por ejemplo `src/features/platform/` con rutas `/login`, `/personas`, `/actividades`, `/reservas`, `/deals`, etc.

---

## 7. Checklist rápido “¿estoy listo para que el catálogo avance?”

- [ ] Login funcional y documentado (qué enviar en cada request).
- [ ] Endpoint de “usuario actual” + roles.
- [ ] Respuestas 401/403 consistentes (cuerpo JSON opcional pero estable).
- [ ] Rama o PR pequeños: auth primero, sin mezclar deals en el mismo PR gigante.

---

*Última referencia de módulos y tablas: esquema acordado en el README raíz del repo (`README.md`).*
