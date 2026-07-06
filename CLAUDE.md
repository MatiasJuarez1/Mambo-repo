# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Mambo is a real-estate CRM/inventory platform. Two independent projects live in one repo (not a shared-package monorepo):

- **`src/`** — Python backend (FastAPI), package name `app`, distribution `mambo-backend`.
- **`client/`** — TypeScript + Vite frontend (currently a scaffold).

The codebase is written in **Spanish** (comments, docstrings, and user-facing API messages). Match that when editing.

## Commands

Backend commands run from **`src/`** (that is where `pyproject.toml` and the `app` package live):

```bash
cd src
python -m venv .venv
.\.venv\Scripts\activate          # Windows; use source .venv/bin/activate on POSIX
pip install -e ".[dev]"

uvicorn app.main:app --reload --port 8000   # dev server
ruff check .                                 # lint (line-length 100, rules E/F/I/B/UP)
ruff format .                                # format
```

Frontend (from `client/`): `npm install`, then `npm run dev` / `npm run build`.

Health checks: `GET /health` (liveness) and `GET /health/db` (raw pymysql connectivity + credential check, dev diagnostic).

There is **no test suite, no test runner, and no Alembic/migrations** configured yet. Tables are assumed to already exist in MySQL — nothing in the app calls `Base.metadata.create_all`.

## ⚠️ Directory-name mismatch

`docker-compose.yml`, `docs/README.md`, and `src/README.md` refer to `backend/` and `frontend/`, but the real directories are `src/` and `client/`. **`docker compose up` will fail** against the current tree (build contexts `./backend` and `./frontend` don't exist). Treat the docs' `backend/` as `src/` and `frontend/` as `client/`, or fix the paths before relying on Docker.

## Backend architecture

FastAPI app assembled in [src/app/main.py](src/app/main.py): each domain module exposes a `router`, and `main.py` mounts them all. Config and DB are the two shared foundations:

- [src/app/config.py](src/app/config.py) — `Settings` (pydantic-settings) loaded from env or a `.env` at the **repo root** (not `src/`). Provide either `DATABASE_URL` or the `MYSQL_*` vars; `sqlalchemy_database_url` builds a `mysql+pymysql://` URL from the parts when `DATABASE_URL` is unset. Access via the `lru_cache`d `get_settings()`. Copy `.env.example` to repo-root `.env`.
- [src/app/database.py](src/app/database.py) — one SQLAlchemy `engine` + `SessionLocal`, the shared `Base` (DeclarativeBase), and the `get_db()` FastAPI dependency (per-request session). All models inherit this `Base`.

### Domain modules

Every feature lives under `src/app/platform/<module>/` and follows the same four-file layered pattern:

- **`models.py`** — SQLAlchemy 2.0 ORM (`Mapped` / `mapped_column`), inheriting `app.database.Base`.
- **`schemas.py`** — Pydantic request/response DTOs.
- **`service.py`** — business logic; functions take a `Session` as first arg and own commits.
- **`router.py`** — `APIRouter` with a `prefix`/`tags`; endpoints depend on `get_db` and (when protected) auth dependencies. Keep DB/business logic in `service.py`, not routers.

Modules: `auth`, `people`, `activities`, `reservations`, `deals`, `notes`, `audit`. Several are partially stubbed (e.g. [audit/service.py](src/app/platform/audit/service.py) is a TODO; `notes`/`audit` models are empty). Per [docs/README.md](docs/README.md), the schema is intentionally "CRM-ready" but the MVP priority is property inventory + minimal staff auth; the CRM modules (deals/pipeline, activities, reservations) are scaffolding ahead of that.

### Authentication

Cookie-based sessions, not JWT. See [auth/dependencies.py](src/app/platform/auth/dependencies.py) and [auth/service.py](src/app/platform/auth/service.py):

- Login sets an httponly `session_token` cookie (`COOKIE_NAME`); passwords hashed with **bcrypt**.
- Server-side `sessions` table with `expires_at` / `revoked_at`; `get_valid_session` enforces validity.
- `get_current_user` resolves the user from the cookie (401 on missing/invalid/inactive).
- `require_role("staff", "admin")` is a **dependency factory** for role gating (roles via the `user_roles` → `roles` relationship). Use it as a route dependency to protect mutations.
- `secure=False` on the login cookie is a dev setting — must become `True` (HTTPS) in production.

When adding a new domain module, mirror the existing four-file layout and register its `router` in [src/app/main.py](src/app/main.py).
