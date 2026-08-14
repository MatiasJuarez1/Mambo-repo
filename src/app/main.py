from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.config import get_settings
from app.database import engine

# Módulos de inventario / publicaciones (rama agustin)
from app.modules.propiedades.router import router as propiedades_router
from app.modules.publicaciones.router import router as publicaciones_router

# Módulos de plataforma / CRM (rama matias-platform)
from app.platform.activities.router import router as activities_router
from app.platform.audit.router import router as audit_router
from app.platform.auth.router import router as auth_router
from app.platform.deals.router import router as deals_router
from app.platform.notes.router import router as notes_router
from app.platform.people.router import router as people_router
from app.platform.reservations.router import router as reservations_router

app = FastAPI(title="Mambo API", version="1.0.0")

_settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    # Dominios de producción, que llegan por la variable CORS_ORIGINS. Se suman al
    # regex de dev en vez de reemplazarlo: si se borrara, el frontend local dejaría
    # de poder hablarle a la API.
    allow_origins=_settings.cors_origins_lista,
    # En dev el frontend de Vite corre en localhost; si el 5173 está ocupado, Vite
    # cae a 5174/5175/... Se acepta cualquier puerto local para que la app no se
    # rompa por ese corrimiento.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    # Imprescindible para el login: sin esto el navegador descarta la cookie de sesión.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Archivos subidos (fotos de propiedades) servidos de forma local.
# La carpeta se crea si no existe para que StaticFiles no falle en un entorno limpio.
_settings.media_root.mkdir(parents=True, exist_ok=True)
app.mount(
    _settings.media_url_prefix,
    StaticFiles(directory=_settings.media_root),
    name="media",
)

# Inventario y publicaciones (bajo /api/v1)
app.include_router(propiedades_router, prefix="/api/v1")
app.include_router(publicaciones_router, prefix="/api/v1")

# Plataforma / CRM
app.include_router(auth_router)
app.include_router(people_router)
app.include_router(activities_router)
app.include_router(reservations_router)
app.include_router(deals_router)
app.include_router(notes_router)
app.include_router(audit_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/db")
def health_db() -> dict[str, str]:
    """Comprueba la conexión real a la base (SQLAlchemy)."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 — diagnóstico en dev
        return {"database": "error", "detail": str(exc)}
    return {"database": "ok"}
