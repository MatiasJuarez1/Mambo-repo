## Mambo

Este repo contiene **dos proyectos** (no es monorepo de paquetes compartidos; cada uno vive en su carpeta):

| Carpeta | Stack |
|---------|--------|
| **`frontend/`** | React + TypeScript (Vite) |
| **`backend/`** | Python (FastAPI) |

---

## Módulos del dominio (base de datos / producto)

Alineados al modelo de datos: cada bloque agrupa tablas y responsabilidades. Los marcados como **MVP** son los que conviene implementar primero para una funcionalidad simple: **cargar viviendas, listar en el home, ver detalle y editar**.

| Módulo | Descripción breve | Tablas principales |
|--------|-------------------|---------------------|
| **Inventario (propiedades)** — **MVP** | Activo inmueble: datos comerciales, tipo, precio, estado comercial | `properties`, `property_locations`, `property_media`, `property_features` |
| **Publicaciones** — **MVP (opcional en fase 1)** | Aviso “publicable” (título, estado de publicación); separa catálogo interno de lo que se muestra en la web | `listings` |
| **Personas y contactos** | Contactos sin login; canales (email, teléfono, etc.) | `people`, `people_contacts` |
| **Identidad y acceso** | Usuarios del staff, roles, sesiones | `users`, `roles`, `user_roles`, `sessions` |
| **Actividades (CRM ligero)** | Llamadas, visitas, tareas ligadas a persona/propiedad/publicación | `activities` |
| **Reservas** | Reserva / seña / fechas; cliente como `person_id` | `reservations` |
| **Ventas y pipeline (CRM)** | Oportunidades, etapas, partes del negocio | `pipelines`, `pipeline_stages`, `deals`, `deal_parties` |
| **Notas (transversal)** | Comentarios por entidad (persona, propiedad, publicación, etc.) | `notes` |
| **Auditoría (transversal)** | Registro de cambios con actor y metadata | `audit_log` |

---

## Qué desarrollar primero (MVP: cargar, home, editar)

Objetivo: **ABM de viviendas** y **listado en la página principal** sin depender aún de CRM completo.

### Prioridad 1 — imprescindible

1. **Inventario (propiedades)**  
   - API: crear / listar / obtener por id / actualizar / (soft delete si aplica).  
   - Incluir en la misma capa o endpoints relacionados: **ubicación** (`property_locations`), **fotos** (`property_media`), **características** (`property_features`) según lo que el formulario y el home necesiten.  
   - **Frontend**: formulario de carga/edición, listado en home, página de detalle.

2. **Identidad y acceso (mínimo)**  
   - Solo lo necesario para que **solo el staff** pueda crear/editar/borrar (login + rol básico o un solo usuario admin al inicio).

### Prioridad 2 — en cuanto el home sea “catálogo público”

3. **Publicaciones (`listings`)**  
   - Si el home debe mostrar solo lo “publicado”, separá: **propiedad en inventario** vs **listing activo**.  
   - Si en la primera iteración el home lista todo el inventario interno, podés posponer `listings` un poco.

### Prioridad 3 — después del MVP

4. **Personas y contactos** — formularios de contacto, propietarios, interesados.  
5. **Actividades** — seguimiento comercial.  
6. **Reservas** — flujo de reserva/seña.  
7. **Ventas y pipeline** — CRM completo.  
8. **Notas y auditoría** — trazabilidad y comentarios internos.

---

## Recomendaciones del proyecto

Lineamientos prácticos para avanzar sin reescribir todo cuando sumes CRM o sitio público.

### Orden de trabajo

Implementá primero el **inventario** (`properties` + ubicación + al menos fotos en `property_media`) con API CRUD y el **frontend** (listado en home, detalle, formulario crear/editar). En paralelo, un **auth mínimo** (un rol staff) para que solo personal autorizado pueda mutar datos. Eso entrega un producto usable rápido.

### Listings vs propiedades

Si el sitio público debe mostrar solo lo publicado a la venta/alquiler, introducí **`listings` pronto** y que el home consuma *listings activos* enlazados a propiedades. Si el home es solo un panel interno, podés posponer `listings` un poco. Para una **web real de inmobiliaria**, conviene **separar inventario y publicación desde el principio** para no mezclar borrador con lo que ve el cliente.

### Backend (FastAPI)

Organizá el código por **módulos de dominio** (por ejemplo `properties/`, `listings/`, `auth/`) con routers, servicios y acceso a datos, aunque al inicio sea SQL directo o un ORM liviano. Así, cuando sumes CRM, no reescribís toda la estructura.

### Base de datos

Mantené el esquema “CRM-ready” pero **no implementes pipelines, deals ni actividades** hasta tener el ABM y el listado público estables. Los `ENUM` sirven para arrancar; cuando haga falta configuración por cliente o multi-idioma, pasá eso a **tablas catálogo**.

### Frontend

Definí **tipos TypeScript** alineados a los DTOs del API y una sola fuente de verdad para la URL del backend (`VITE_API_URL`). Validaciones básicas en la UI; **reglas de negocio fuertes en el backend**.

### Infraestructura

Seguí con **Docker Compose** para desarrollo homogéneo. Cuando agregues MySQL, sumalo como servicio en compose y versioná los cambios de esquema (**Alembic** o scripts SQL) desde el primer cambio real del modelo.

### Resumen en una frase

**MVP = inventario + auth staff + (listings si hay sitio público) + home / detalle / ABM.** El resto del CRM queda preparado en el modelo de datos pero fuera del camino crítico hasta que el flujo de propiedades esté cerrado.

---

## Correr local (sin Docker)

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

**Backend**

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -U pip
pip install -e ".[dev]"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Salud del API: `GET http://localhost:8000/health`

---

## Correr con Docker

En la raíz del repo:

```bash
docker compose up --build
```

- Frontend: `http://localhost:5173`  
- Backend: `http://localhost:8000`
