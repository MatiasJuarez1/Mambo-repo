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

Health checks: `GET /health` (liveness) and `GET /health/db` (SQLAlchemy connectivity + credential check, dev diagnostic).

### Migrations

Alembic **is** wired up now, with an initial migration in [src/alembic/versions/](src/alembic/versions/) that creates all 17 tables. Run from `src/`:

```bash
alembic upgrade head          # crea/actualiza el esquema
alembic revision --autogenerate -m "descripción"
```

`alembic/env.py` takes the URL from `settings.sqlalchemy_database_url` (i.e. `DATABASE_URL`), **ignoring** the `sqlalchemy.url` in `alembic.ini`, which is intentionally blank. Nothing in the app calls `Base.metadata.create_all` outside the tests.

### Tests

Both projects have a suite.

```bash
cd src && python -m pytest tests/ -q          # backend (pytest + SQLite en memoria)
cd client && npm test                          # frontend (vitest + Testing Library)
```

- Backend tests run against **real SQLite in memory**, not mocks; [src/tests/conftest.py](src/tests/conftest.py) explains the three dialect adaptations it needs and exposes the `db`, `client`, `crear_usuario` and `iniciar_sesion` fixtures.
- ⚠️ **The tests build their schema from the models, so they cannot catch model↔database drift.** This used to be dangerous in a specific way: the tables were created by hand outside the repo, so *the database* was authoritative and a renamed `mapped_column` passed the whole suite and then failed in production with `Unknown column`. That happened once already — `users.password_hash`, `users.name` and `sessions.token_hash` were modelled under different names and auth could never have run against the real database.
  **Since the initial migration exists, that relationship is inverted**: production is built from the models, so the models are authoritative. The remaining risk is the opposite one — changing a model and forgetting `alembic revision --autogenerate`. The suite passes either way, so the check to run before merging a model change is `alembic check` (fails if the models and the migrations have diverged), not a query against `INFORMATION_SCHEMA`.
- [src/conftest.py](src/conftest.py) (repo-level, loaded before anything else) sets a throwaway `JWT_SECRET` so the suite can import the app — `Settings` builds at import time and the secret has no default.
- Frontend tests **must run with `--pool=threads`** (already baked into `npm test`). The default `forks` pool times out spawning workers on Windows and produces failures that have nothing to do with the code.

## Deployment

Vercel (frontend) + Render (API) + Supabase (PostgreSQL) + Cloudinary (photos). Step-by-step runbook in [docs/despliegue.md](docs/despliegue.md); the service definition lives in [render.yaml](render.yaml). Three things that are easy to get wrong:

- **[client/vercel.json](client/vercel.json) proxies `/api/*` and `/auth/*` to Render**, so the browser sees a single origin and the session cookie stays first-party (`SameSite=Lax`). Calling Render directly would make it a third-party cookie, which Safari and iOS block by default. The Render host is written literally — `vercel.json` does not interpolate env vars — and only those two prefixes are proxied, so a frontend call to any other root-mounted router (`/people`, `/deals`, …) 404s in production while working locally.
- **`STORAGE_BACKEND=cloudinary` is mandatory on Render**, whose disk is wiped on every deploy.
- **Migrations do not run on deploy** (Render free has no pre-deploy hook). Run `alembic upgrade head` locally with `DATABASE_URL` pointed at Supabase, using its **session pooler** string — the direct-connection host is IPv6-only and Render has no IPv6 egress.

## ⚠️ Directory-name mismatch

`docker-compose.yml`, `docs/README.md`, and `src/README.md` refer to `backend/` and `frontend/`, but the real directories are `src/` and `client/`. **`docker compose up` will fail** against the current tree (build contexts `./backend` and `./frontend` don't exist). Treat the docs' `backend/` as `src/` and `frontend/` as `client/`, or fix the paths before relying on Docker.

## Backend architecture

FastAPI app assembled in [src/app/main.py](src/app/main.py): each domain module exposes a `router`, and `main.py` mounts them all. Config and DB are the two shared foundations:

- [src/app/config.py](src/app/config.py) — `Settings` (pydantic-settings) loaded from env or a `.env` at the **repo root** (not `src/`). Provide either `DATABASE_URL` or the `POSTGRES_*` vars; `sqlalchemy_database_url` builds a `postgresql+psycopg2://` URL from the parts when `DATABASE_URL` is unset. Access via the `lru_cache`d `get_settings()`. Copy `.env.example` to repo-root `.env`. A `model_validator` rejects two combinations at startup rather than letting them fail silently at runtime: `COOKIE_SAMESITE=none` without `COOKIE_SECURE`, and `STORAGE_BACKEND=cloudinary` without credentials.
- [src/app/database.py](src/app/database.py) — one SQLAlchemy `engine` + `SessionLocal`, the shared `Base` (DeclarativeBase), and the `get_db()` FastAPI dependency (per-request session). All models inherit this `Base`.

### Domain modules

Features live under **two** package trees, both following the same four-file pattern:

- `src/app/modules/<module>/` — the property-inventory side (`propiedades`, `publicaciones`), mounted under `/api/v1`.
- `src/app/platform/<module>/` — the CRM/platform side (`auth`, `people`, `activities`, …), mounted at the root.

The four-file layered pattern: 

- **`models.py`** — SQLAlchemy 2.0 ORM (`Mapped` / `mapped_column`), inheriting `app.database.Base`.
- **`schemas.py`** — Pydantic request/response DTOs.
- **`service.py`** — business logic; functions take a `Session` as first arg and own commits.
- **`router.py`** — `APIRouter` with a `prefix`/`tags`; endpoints depend on `get_db` and (when protected) auth dependencies. Keep DB/business logic in `service.py`, not routers.

Modules: `auth`, `people`, `activities`, `reservations`, `deals`, `notes`, `audit`. Several are partially stubbed (e.g. [audit/service.py](src/app/platform/audit/service.py) is a TODO; `notes`/`audit` models are empty). Per [docs/README.md](docs/README.md), the schema is intentionally "CRM-ready" but the MVP priority is property inventory + minimal staff auth; the CRM modules (deals/pipeline, activities, reservations) are scaffolding ahead of that.

### Authentication

**JWT carried in an httponly cookie** — not a Bearer token in `localStorage`, so an XSS in the admin panel cannot read it. See [auth/dependencies.py](src/app/platform/auth/dependencies.py) and [auth/service.py](src/app/platform/auth/service.py):

- Login verifies the password with **bcrypt**, creates a row in `sessions`, and signs a JWT whose `jti` **is** that row's `token` column. The JWT goes out in the httponly `session_token` cookie (`COOKIE_NAME`); it is never in the response body.
- `get_current_user` does **two** checks: the token's signature/expiry, then that its `jti` is still live in `sessions`. That second check costs one query per request and forfeits JWT's stateless advantage — it buys the ability to revoke a session instantly, which is the deliberate trade-off here.
- The authenticated identity comes from the `sessions` row, **not** from the `sub` claim: the database decides who you are, not the token's payload.
- `require_role("staff", "admin")` is a **dependency factory** for role gating (roles via the `user_roles` → `roles` relationship). Both `modules/propiedades` and `modules/publicaciones` apply it per-endpoint via a `SOLO_STAFF` constant — **deliberately not on the `APIRouter`**, because the `GET`s must stay anonymous for the public site.
- `jwt_secret` has **no default**: a missing `JWT_SECRET` fails app startup by design. `cookie_secure` must become `True` in production, but only once TLS is in place — with `secure=True` over plain HTTP the browser drops the cookie and nobody can log in.
- Create the first admin from `src/` with `python -m scripts.crear_admin` (prompts for the password via `getpass`; never pass it as an argument). It must be run as a module, not as `python scripts/crear_admin.py` — the script imports `app.main` to register every model before touching the DB.

The frontend counterpart: [client/src/context/AuthContext.tsx](client/src/context/AuthContext.tsx) asks `GET /auth/me` on mount, because the cookie is httponly and JS cannot read it. [client/src/api/client.ts](client/src/api/client.ts) must keep `credentials: 'include'` — without it the browser never attaches the cookie cross-origin and every authenticated call 401s.

When adding a new domain module, mirror the existing four-file layout and register its `router` in [src/app/main.py](src/app/main.py).
