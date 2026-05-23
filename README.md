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

## Backend (`src/`)

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
