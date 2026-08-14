# Despliegue

Cuatro servicios, cada uno con un trabajo:

| Servicio | Qué corre ahí | Plan |
|---|---|---|
| **Vercel** | El frontend (Vite/React) y el proxy hacia la API | Free |
| **Render** | La API (FastAPI) | Free |
| **Supabase** | La base PostgreSQL | Free |
| **Cloudinary** | Las fotos de las propiedades | Free |

El orden importa: cada paso necesita un dato del anterior.

---

## 1. Supabase (la base)

1. Crear un proyecto. Región: **South America (São Paulo)** es la más cercana.
2. Guardar la contraseña de la base — se muestra **una sola vez**.
3. Botón **Connect** → pestaña **Session pooler** → copiar la cadena.

> ⚠️ Tiene que ser la del **pooler** (`...pooler.supabase.com`), no la de
> *Direct connection* (`db.<ref>.supabase.co`). La directa resuelve solo por
> IPv6 y Render no tiene salida IPv6: el síntoma es un `Network is unreachable`
> al arrancar, que no dice nada sobre la causa real.

4. Adaptar la cadena para SQLAlchemy cambiando el prefijo `postgresql://` por
   `postgresql+psycopg2://`:

```
postgresql+psycopg2://postgres.<ref>:<password>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
```

### Crear el esquema

Se corre desde tu máquina, apuntando a Supabase. Render en plan free no tiene
pre-deploy hooks, así que la migración no puede correr sola en el deploy.

```powershell
cd C:\Users\matia\Mambo-repo\src
$env:DATABASE_URL = "postgresql+psycopg2://postgres.<ref>:<password>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"
alembic upgrade head
```

Tiene que terminar en `Running upgrade -> 0001_esquema_inicial`. Verificalo en
Supabase → Table Editor: 17 tablas.

### Crear el usuario administrador

Con la misma variable puesta en esa terminal:

```powershell
python -m scripts.crear_admin tu-email@mambo.com.ar
```

Pide la contraseña dos veces por consola y nunca por argumento. Crea el rol
`admin` si no existe.

> No uses `mambo@mambo.com.ar` / `mambo123`: esa es la cuenta de prueba local.
> Poné un email real y una contraseña larga — es la única llave del panel y no
> hay pantalla de recuperación.

Cuando termines, cerrá esa terminal o limpiá la variable (`$env:DATABASE_URL=""`)
para no seguir trabajando contra producción sin darte cuenta.

---

## 2. Cloudinary (las fotos)

1. Crear una cuenta gratis.
2. Dashboard → **API environment variable**. Copiar el valor completo:

```
cloudinary://<api_key>:<api_secret>@<cloud_name>
```

Es un secreto: da permiso de subir y borrar. No va al repositorio, solo al panel
de Render.

---

## 3. Render (la API)

El repositorio ya trae [`render.yaml`](../render.yaml), así que no hay que
configurar nada a mano.

1. Render → **New +** → **Blueprint** → elegir el repo `Mambo-repo`.
2. Rama: `integracion-postgres` (o `main` si ya mergeaste).
3. Render lee el blueprint y pide las dos variables marcadas como `sync: false`:
   - `DATABASE_URL` → la cadena del pooler de Supabase.
   - `CLOUDINARY_URL` → la de Cloudinary.

   El resto (`JWT_SECRET` generado, `COOKIE_SECURE=True`, `COOKIE_SAMESITE=lax`,
   `STORAGE_BACKEND=cloudinary`) ya viene definido.
4. Deploy. Anotá la URL que queda: debería ser
   `https://mambo-api.onrender.com`.

> **Si la URL no es exactamente `mambo-api.onrender.com`** (por ejemplo porque el
> nombre estaba tomado), hay que corregir las dos URLs de
> [`client/vercel.json`](../client/vercel.json) y volver a pushear. Ese archivo
> no interpola variables de entorno: el host va escrito literal.

### Verificar

```
https://mambo-api.onrender.com/health      → {"status":"ok"}
https://mambo-api.onrender.com/health/db   → {"database":"ok"}
```

Si `/health/db` devuelve `error`, el detalle viene en la respuesta. Casi siempre
es la cadena de conexión: pooler vs. directa, o el prefijo `+psycopg2` faltante.

---

## 4. Vercel (el frontend)

1. Vercel → **Add New** → **Project** → importar el repo.
2. **Root Directory: `client`** ← es el único ajuste que hay que tocar. El resto
   lo detecta solo (framework Vite, `npm run build`, salida en `dist`).
3. Variables de entorno: **ninguna**. En producción el front llama a rutas
   relativas y el proxy de `vercel.json` las reenvía a Render.
4. Deploy.

---

## 5. Comprobaciones finales

En este orden, porque cada una descarta una causa distinta:

1. **La home carga y se ven las propiedades.** Si carga pero el listado está
   vacío, es esperable: la base arranca sin datos.
2. **Entrar al panel** (`/admin`) con el usuario que creaste. Si el login
   responde bien pero vuelve a la pantalla de login, el problema es la cookie:
   revisá que `COOKIE_SECURE=True` y que el proxy de `vercel.json` apunte al
   host correcto de Render.
3. **Cargar una propiedad con foto.** Después verificá en el Media Library de
   Cloudinary que el archivo aparezca en `mambo/propiedades/`. Si la foto se ve
   pero no está en Cloudinary, `STORAGE_BACKEND` no quedó en `cloudinary` y el
   archivo se está escribiendo en el disco efímero de Render — donde va a
   desaparecer en el próximo deploy.
4. **Probar el panel desde un iPhone.** Es la comprobación que valida toda la
   decisión del proxy; si algo estuviera mal armado, Safari sería el primero en
   romperse.

---

## Lo que hay que saber del plan free

**Render duerme el servicio a los 15 minutos sin tráfico.** La primera visita
después de una pausa espera ~50 segundos a que el contenedor arranque. Para un
sitio que se muestra a clientes es bastante malo: el plan Starter (US$7/mes) lo
elimina, y es el primer gasto que conviene hacer.

**Supabase pausa los proyectos free tras 7 días sin actividad.** Un sitio con
visitas no llega a esa condición; uno que todavía no se publicó, sí.

**Cloudinary free son 25 GB.** A ~300 KB por foto procesada, sobra.

---

## Actualizar el sitio

Ambos servicios despliegan solos con cada push a la rama configurada.

La excepción son los **cambios de esquema**: si una migración nueva entra en el
push, la base no se actualiza sola. Hay que correr, con `DATABASE_URL` apuntando
a Supabase:

```powershell
cd src
alembic upgrade head
```

Antes de pushear un cambio de modelos, `alembic check` avisa si te olvidaste de
generar la migración — los tests no lo detectan, porque arman el esquema desde
los propios modelos.
