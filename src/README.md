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
 
