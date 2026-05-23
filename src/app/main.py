from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.modules.propiedades.router import router as propiedades_router
from app.modules.publicaciones.router import router as publicaciones_router

app = FastAPI(title="Mambo API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(propiedades_router, prefix="/api/v1")
app.include_router(publicaciones_router, prefix="/api/v1")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
