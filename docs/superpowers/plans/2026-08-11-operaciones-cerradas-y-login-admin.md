# Operaciones cerradas + login de administrador (JWT) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar el sitio en condiciones de desplegarse: mostrar en el listado público las propiedades vendidas/alquiladas con una faja encima (**hecho**, Fase 0), y poner un login de administrador con JWT que además **tape el agujero de seguridad** que hoy deja crear, editar y borrar propiedades sin autenticación.

**Architecture:** El backend ya tiene todo el andamiaje de auth (usuarios, bcrypt, roles, `require_role`); lo que cambia es *cómo se transporta la identidad*: en vez de un token opaco contra la tabla `sessions`, un JWT firmado que viaja en cookie httponly. La tabla `sessions` se conserva como lista de revocación por `jti`, para poder cerrar sesión de verdad. Primero el backend con sus tests, después el frontend, y el despliegue al final.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + PyJWT + bcrypt (backend, `src/`). React 19 + TypeScript 5.8 + Vite 6 + React Router (frontend, `client/`).

## Cómo se verifica

**Ojo:** `CLAUDE.md` dice que el repo no tiene suite de tests. **Está desactualizado** — hoy hay dos:

- Backend: `cd src && python -m pytest tests/ -q` (pytest + SQLite en memoria, ver `tests/conftest.py`).
- Frontend: `cd client && npx vitest run --pool=threads` (71 tests).
  **No usar `npm test` en esta máquina**: el pool `forks` de vitest agota el tiempo de arranque de los workers en Windows y da falsos errores. Con `--pool=threads` pasa entero. Arreglar el script en `package.json` es la Tarea 4.6.

Ciclo por tarea: test que falla → implementación → test que pasa → `ruff check` (backend) o `npx tsc --noEmit` (frontend).

## Restricciones globales

- **El código va en castellano** (comentarios, docstrings, mensajes de la API), como el resto del repo.
- **No inventar migraciones.** No hay Alembic. Todo cambio de esquema se anota en la Tarea 5.1 como SQL a correr a mano.
- **Ningún secreto hardcodeado.** `JWT_SECRET` sale de entorno y la app **no arranca** si falta.
- **Ruff:** los módulos existentes usan `Optional[X]` / `List[X]` y `Depends(...)` en defaults, y ruff los marca (UP045/UP006/B008). Mantener el estilo del archivo; no "arreglar" de paso.

---

## Fase 0 — Fajas en operaciones cerradas ✅ HECHO

Ya implementado y verificado (17 tests backend + 71 frontend en verde, `tsc` limpio, revisión visual con captura).

- [x] `listar_propiedades` acepta `estados` (varios a la vez) y ordena disponibles primero — `src/app/modules/propiedades/service.py`
- [x] `GET /api/v1/propiedades?estados=...&estados=...` — `src/app/modules/propiedades/router.py`
- [x] `ESTADOS_PUBLICOS` y `etiquetaCierre()` — `client/src/lib/propiedad.ts`
- [x] Faja diagonal + ficha atenuada — `client/src/components/PropiedadCard.{tsx,css}`
- [x] El listado pide los tres estados públicos — `client/src/pages/public/Listado.tsx`
- [x] Tests: `src/tests/test_propiedades_listado.py`, `client/src/components/PropiedadCard.test.tsx`, ampliación de `client/src/lib/propiedad.test.ts`

### Pendiente menor de la Fase 0

- [ ] **0.1 — Decidir el desplegable de zonas.** `listar_ciudades()` (`service.py:71`) solo considera propiedades `disponible`. Ahora que el listado muestra cerradas, una zona cuyo único inventario está vendido no aparece en el select, aunque sus fichas sí se vean. Es defendible (el buscador ofrece dónde hay stock), pero es una inconsistencia introducida por la Fase 0 y hay que decidirla a conciencia. Si se cambia, actualizar `test_propiedad_no_disponible_no_aporta_su_ciudad`.

---

## Fase 1 — JWT en cookie httponly (backend)

**Decisión tomada:** JWT firmado (HS256) transportado en cookie **httponly**, no en `localStorage`. Un XSS en el panel no puede leer la cookie; con `localStorage` se llevaría la sesión entera.

**Nota honesta sobre el diseño:** validar el `jti` contra la tabla `sessions` en cada request agrega una consulta y le quita al JWT su ventaja de ser stateless — funcionalmente queda parecido al sistema de sesiones que ya existía. Se acepta a cambio de poder revocar una sesión al instante, que en un panel de administración importa más que ahorrar una consulta. Si más adelante molesta, la alternativa es bajar el TTL a ~15 min y sumar refresh token.

- [ ] **1.1 — Dependencia y configuración.** Agregar `pyjwt>=2.8` a `src/pyproject.toml`. En `src/app/config.py` sumar a `Settings`: `jwt_secret: str`, `jwt_algorithm: str = "HS256"`, `jwt_ttl_horas: int = 8`, `cookie_secure: bool = False`. Documentar las cuatro en `.env.example`. **`jwt_secret` sin default**: si falta, pydantic-settings hace fallar el arranque, que es lo que queremos.

- [ ] **1.2 — Emisión y validación del token.** En `src/app/platform/auth/service.py`: `crear_access_token(user, jti) -> str` con claims `sub` (id de usuario), `jti`, `iat`, `exp`; y `decodificar_access_token(token) -> dict` que devuelva `None` ante firma inválida, token expirado o malformado (nunca que propague la excepción de PyJWT).
  **Tests primero** (`src/tests/test_auth_jwt.py`): token válido round-trip; firma alterada → `None`; `exp` vencido → `None`; token firmado con otro secreto → `None`; basura → `None`.

- [ ] **1.3 — Login emite el JWT.** Reescribir `POST /auth/login` (`src/app/platform/auth/router.py`): verificar credenciales con `authenticate_user` (bcrypt, sin cambios), crear la fila en `sessions` —su `token` pasa a ser el `jti`— y devolver la cookie con `httponly=True`, `samesite="lax"`, `secure=settings.cookie_secure`, `max_age=jwt_ttl_horas*3600`.
  **Tests:** credenciales correctas → 200 + cookie httponly presente; contraseña incorrecta → 401 y **sin** cookie; usuario inactivo → 401; el cuerpo de la respuesta **no** incluye el token (solo va en la cookie).

- [ ] **1.4 — Dependencia de lectura.** En `src/app/platform/auth/dependencies.py`, reemplazar el cuerpo de `get_current_user`: leer la cookie, decodificar el JWT, verificar que el `jti` siga vivo en `sessions` (no revocado, no expirado) y cargar el `User`. **Mantener la firma y el nombre** para que `require_role` y los routers existentes sigan funcionando sin tocarse.
  **Tests:** sin cookie → 401; JWT válido pero `jti` revocado → 401; JWT válido y usuario inactivo → 401; JWT válido y todo en orden → devuelve el usuario.

- [ ] **1.5 — Logout que revoca la sesión correcta.** El logout actual (`router.py:55-59`) toma *la primera* sesión sin revocar del usuario, así que con sesión abierta en dos dispositivos cierra la equivocada. Revocar el `jti` que viene en el JWT del request.
  **Tests:** logout revoca la sesión propia; con dos sesiones abiertas, la otra **sigue válida**; usar el token después del logout → 401.

## Fase 2 — Cerrar el agujero de escritura

Hoy `POST`, `PUT`, `DELETE` y la subida de imágenes de `/api/v1/propiedades` no piden nada. Cualquiera con la URL puede escribir en la base y subir archivos al servidor. **Esto es lo que bloquea el despliegue.**

- [ ] **2.1 — Test que demuestra el agujero.** En `src/tests/test_propiedades_permisos.py`, para cada endpoint de escritura de `propiedades` y `publicaciones`: sin cookie → **401**. Estos tests fallan hoy con 200/201 y son la prueba de la vulnerabilidad.
- [ ] **2.2 — Proteger propiedades.** Agregar `dependencies=[Depends(require_role("staff", "admin"))]` a los seis endpoints de escritura de `src/app/modules/propiedades/router.py`. **No tocar** los `GET`: el sitio público es anónimo.
- [ ] **2.3 — Proteger publicaciones.** Lo mismo en `src/app/modules/publicaciones/router.py`.
- [ ] **2.4 — Rol insuficiente → 403.** Test: usuario autenticado sin rol staff/admin recibe 403, no 401.

## Fase 3 — Login en el frontend

- [ ] **3.1 — Mandar la cookie.** Agregar `credentials: 'include'` al `fetch` de `client/src/api/client.ts`. **Sin esto nada de la Fase 1 funciona desde el navegador**: el front corre en `:5173` y la API en `:8000`, y sin ese flag el navegador no adjunta la cookie. (El backend ya tiene `allow_credentials=True`.)
- [ ] **3.2 — API de auth.** `client/src/api/auth.ts` con `login`, `logout` y `me`, más los tipos en `client/src/types/auth.ts`.
- [ ] **3.3 — Contexto de sesión.** `client/src/context/AuthContext.tsx`: al montar llama a `/auth/me` para saber si hay sesión viva (la cookie es httponly: **el JS no puede leerla**, preguntar al backend es la única vía). Expone `usuario`, `cargando`, `login()`, `logout()`.
- [ ] **3.4 — Página de login.** `client/src/pages/admin/Login.tsx` con email + contraseña, error visible en credenciales incorrectas y redirección a `/admin` al entrar. Estilo de la paleta actual.
- [ ] **3.5 — Rutas protegidas.** Componente `RutaProtegida` que envuelva las rutas `/admin/*` en `client/src/App.tsx`: mientras `cargando` muestra un placeholder, sin sesión redirige a `/admin/login`. **Que no parpadee** el contenido admin antes de redirigir.
- [ ] **3.6 — Salir.** Botón de logout en `AdminLayout` con el email del usuario al lado.
- [ ] **3.7 — 401 global.** Si cualquier respuesta da 401, limpiar el contexto y mandar a login: cubre el token vencido en pleno uso.
- [ ] **3.8 — Tests.** Login exitoso redirige; credenciales malas muestran el error sin navegar; ruta admin sin sesión redirige; con sesión renderiza.

## Fase 4 — Antes de desplegar

- [ ] **4.1 — Cookie `secure` en producción.** `cookie_secure=True` vía entorno. Con `secure=True` la cookie **solo viaja por HTTPS**: verificar que el hosting tenga TLS antes de activarlo o nadie podrá entrar.
- [ ] **4.2 — CORS real.** `src/app/main.py:29` acepta cualquier puerto de localhost. Sumar el dominio de producción por entorno, sin borrar el regex de dev.
- [ ] **4.3 — Usuario admin inicial.** Script `src/scripts/crear_admin.py` que cree el usuario con contraseña hasheada y el rol `admin`. Sin esto no hay cómo entrar la primera vez. La contraseña se pide por consola, **no se pasa por argumento** (queda en el historial del shell).
- [ ] **4.4 — Fotos en disco.** `media_root` es una carpeta local; en un hosting con sistema de archivos efímero **las fotos se pierden en cada despliegue**. Decidir volumen persistente o pasar a S3/Cloudinary. Ver la nota `fotos-storage-local-primero`.
- [ ] **4.5 — Docker.** `docker-compose.yml` apunta a `backend/` y `frontend/`, que no existen (son `src/` y `client/`). Hoy `docker compose up` falla. Arreglar o descartar Docker para el despliegue.
- [ ] **4.6 — `npm test`.** Cambiar el script a `vitest run --pool=threads` para que la suite corra sin los timeouts de workers en Windows.
- [ ] **4.7 — Actualizar `CLAUDE.md`.** Dice que no hay tests (hay dos suites), que los módulos viven en `app/platform/` (también hay `app/modules/`) y que la auth es por sesión con cookie (pasa a ser JWT).

## Fase 5 — Fuera de alcance de este plan

- [ ] **5.1 — Cambio de logo.** Pendiente la versión **horizontal** en la paleta nueva para la navbar (`Navbar.tsx:90`). La apilada ya está en `client/public/logo-mambo.png`. El teal del logo nuevo (`#07646C`) no coincide con `--petrol` (`#0E3A3B`), que según el comentario de `index.css:10-12` se derivó del logo: hay que decidir si se ajusta la paleta.
- [ ] **5.2 — Paginación real.** El listado pide 20 y no hay "ver más". Al sumar las cerradas el inventario visible crece y esto se va a notar antes.
