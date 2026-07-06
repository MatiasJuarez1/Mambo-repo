from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
