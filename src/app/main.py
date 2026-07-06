import pymysql
from fastapi import FastAPI

from app.config import get_settings
from app.platform.auth.router import router as auth_router
from app.platform.people.router import router as people_router
from app.platform.activities.router import router as activities_router
from app.platform.reservations.router import router as reservations_router
from app.platform.deals.router import router as deals_router
from app.platform.notes.router import router as notes_router
from app.platform.audit.router import router as audit_router

app = FastAPI(title="Mambo API")

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
    """Comprueba TCP + credenciales contra MySQL (sin ORM)."""
    s = get_settings()
    try:
        conn = pymysql.connect(
            host=s.mysql_host,
            port=s.mysql_port,
            user=s.mysql_user,
            password=s.mysql_password,
            database=s.mysql_database,
        )
        try:
            conn.ping(reconnect=False)
        finally:
            conn.close()
    except Exception as exc:  # noqa: BLE001 — diagnóstico en dev
        return {"database": "error", "detail": str(exc)}
    return {"database": "ok"}

