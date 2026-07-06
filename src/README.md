 ## Estructuracion

 modules/
├── propiedades/
│   ├── models.py    — Propiedad, PropiedadUbicacion, PropiedadMedio, PropiedadCaracteristica
│   ├── schemas.py   — DTOs Pydantic v2 (Create / Update / Response / ListItem)
│   ├── service.py   — CRUD + soft delete + filtros
│   └── router.py    — 11 endpoints bajo /api/v1/propiedades
└── publicaciones/
    ├── models.py    — Publicacion
    ├── schemas.py
    ├── service.py   — CRUD + auto-seteo de publicada_en al activar
    └── router.py    — 6 endpoints bajo /api/v1/publicaciones (incluye /publicas)
 
 ## Backend (FastAPI)
 
 ### Requisitos
 - Python 3.11+
 
 ### Setup (local)
 ```bash
 cd backend
 python -m venv .venv
 .\.venv\Scripts\activate
 pip install -U pip
 pip install -e ".[dev]"
 ```
 
 ### Correr en desarrollo
 ```bash
 uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
 ```
 
 ### Endpoint de salud
 - `GET /health`
 
