# Mambo — Sistema de gestión inmobiliaria

Stack: **FastAPI** · **SQLAlchemy 2** · **MySQL 8** · **Vite + React + TypeScript**

| Carpeta | Stack |
|---------|-------|
| `src/` | Python 3.11 · FastAPI · SQLAlchemy 2 · Alembic |
| `client/` | Vite · React · TypeScript |

---

## Requisitos

- Python 3.11+
- Node.js 20+
- MySQL 8 (local via MySQL Workbench **o** via Docker)
- Docker + Docker Compose (opcional)

---

## Base de datos

Crear el esquema ejecutando el script SQL provisto en MySQL Workbench:

```sql
SOURCE schema.sql;
```

Esto crea la base `inmobiliaria_crm` con todas las tablas. El backend mapea los modelos a ese esquema existente; **no ejecuta `CREATE TABLE`** por su cuenta.

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

### 1. Variables de entorno

```bash
# Desde la raíz del proyecto
cp .env.example .env
# Editar DATABASE_URL con tu usuario/contraseña de MySQL
```

### 2. Instalar dependencias

```bash
cd src
pip install -e ".[dev]"
```

### 3. Levantar el servidor

```bash
uvicorn app.main:app --reload --port 8000
```

- API disponible en `http://localhost:8000`
- Documentación interactiva: `http://localhost:8000/docs`

### Migraciones (Alembic)

El esquema inicial viene del script SQL. Para **cambios futuros** al modelo:

```bash
cd src

# Generar migración automática luego de modificar un model.py
alembic revision --autogenerate -m "descripcion_del_cambio"

# Aplicar migraciones pendientes
alembic upgrade head
```

---

## Frontend (`client/`)

### 1. Instalar dependencias

```bash
cd client
npm install
```

### 2. Levantar servidor de desarrollo

```bash
npm run dev
```

Frontend disponible en `http://localhost:5173`.

La URL del backend se configura con `VITE_API_URL` (por defecto `http://localhost:8000`).

---

## Con Docker Compose

```bash
# Desde la raíz del proyecto
cp .env.example .env
docker compose up --build
```

> Para usar MySQL vía Docker en vez de local, descomentar el servicio `db` en `docker-compose.yml` y ajustar `DATABASE_URL` en `.env` apuntando a `db:3306`.

---

## Endpoints

### Propiedades

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v1/propiedades` | Listado con filtros (tipo, operación, estado, ciudad, precio) |
| GET | `/api/v1/propiedades/{id}` | Detalle completo |
| POST | `/api/v1/propiedades` | Crear propiedad (con ubicación, medios y características anidados) |
| PUT | `/api/v1/propiedades/{id}` | Actualizar campos y/o ubicación |
| DELETE | `/api/v1/propiedades/{id}` | Baja lógica |
| POST | `/api/v1/propiedades/{id}/medios` | Agregar foto/video/documento |
| DELETE | `/api/v1/propiedades/{id}/medios/{mid}` | Eliminar medio |
| POST | `/api/v1/propiedades/{id}/caracteristicas` | Agregar característica clave-valor |
| DELETE | `/api/v1/propiedades/{id}/caracteristicas/{cid}` | Eliminar característica |

**Filtros disponibles en `GET /propiedades`:**  
`tipo_propiedad`, `tipo_operacion`, `estado_comercial`, `ciudad`, `precio_min`, `precio_max`, `skip`, `limit`

### Publicaciones

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v1/publicaciones/publicas` | Listado público (solo estado `activa`) |
| GET | `/api/v1/publicaciones` | Listado interno (todos los estados) |
| GET | `/api/v1/publicaciones/{id}` | Detalle |
| POST | `/api/v1/publicaciones` | Crear publicación vinculada a una propiedad |
| PUT | `/api/v1/publicaciones/{id}` | Actualizar título, descripción o estado |
| DELETE | `/api/v1/publicaciones/{id}` | Baja lógica (pone estado `eliminada`) |

---

## Estructura del backend

```
src/
├── app/
│   ├── config.py          # Settings desde .env
│   ├── database.py        # Engine SQLAlchemy + get_db
│   ├── main.py            # App FastAPI + routers + CORS
│   └── modules/
│       ├── propiedades/
│       │   ├── models.py  # Propiedad, PropiedadUbicacion, PropiedadMedio, PropiedadCaracteristica
│       │   ├── schemas.py # Pydantic DTOs (Create / Update / Response)
│       │   ├── service.py # Lógica de negocio
│       │   └── router.py  # Endpoints FastAPI
│       └── publicaciones/
│           ├── models.py
│           ├── schemas.py
│           ├── service.py
│           └── router.py
├── alembic/               # Migraciones
│   ├── env.py
│   └── versions/
└── alembic.ini
```
