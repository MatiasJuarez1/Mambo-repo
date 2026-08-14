# Despliegue

Cuatro servicios, cada uno con un trabajo:

| Servicio | Qué corre ahí | Plan |
|---|---|---|
| **Vercel** | El frontend (Vite/React) y el proxy hacia la API | Free |
| **Render** | La API (FastAPI) | Free |
| **Supabase** | La base PostgreSQL | Free |
| **Cloudflare R2** | Las fotos de las propiedades | Free |

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
postgresql+psycopg2://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

> ⚠️ **La contraseña que genera Supabase casi siempre necesita percent-encoding.**
> Dentro de una URL, `?` abre la query string, `+` significa espacio y `/`, `@`,
> `#`, `:` y `%` tienen cada uno su significado. Una contraseña del estilo
> `aB3?x+Kd=7=1` se corta en el `?`, y lo que llega al servidor es un pedazo:
> el error que devuelve habla de credenciales inválidas y manda a buscar el
> problema donde no está. Para obtener la forma correcta:
>
> ```powershell
> python -c "from urllib.parse import quote_plus; print(quote_plus(input('password: ')))"
> ```
>
> Ese resultado es el que va en la URL. La contraseña original, sin tocar, es la
> que se usa en el formulario de Supabase o en cualquier cliente que pida los
> datos por separado.

### Crear el esquema

Se corre desde tu máquina, apuntando a Supabase. Render en plan free no tiene
pre-deploy hooks, así que la migración no puede correr sola en el deploy.

```powershell
cd C:\Users\matia\Mambo-repo\src
$env:DATABASE_URL = "postgresql+psycopg2://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
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

## 2. Cloudflare R2 (las fotos)

R2 tiene **dos URLs distintas** y confundirlas es el error clásico del paso:

| | Para qué | Dónde sale |
|---|---|---|
| **Endpoint S3** | **Subir**. Privado: cada request va firmada con SigV4. | R2 → Overview → *S3 API* |
| **URL pública** | **Leer**. Es lo que abre el navegador y lo que se guarda en la base. | Settings del bucket → *Public Development URL* |

> ⚠️ Guardar el endpoint S3 como URL pública deja todas las fotos rotas con un
> 401, porque el navegador no firma nada. La app rechaza esa combinación al
> arrancar en vez de dejarla pasar.

### Credenciales

R2 → **Manage API Tokens** → **Create API token**:

- Permiso: **Object Read & Write**
- En *Specify bucket(s)*: **solo el bucket del proyecto**, nunca "All buckets".
  Una cuenta de Cloudflare suele tener buckets de varios proyectos, y un token
  amplio se los lleva a todos si se filtra.
- TTL: *Forever*

Devuelve **Access Key ID** y **Secret Access Key**. El secret se muestra **una
sola vez**.

### Acceso público

En el bucket → **Settings** → **Public Development URL** → **Enable** (pide
escribir `allow`).

Sin este paso el bucket responde 403 a todo, incluso a su raíz.

> ⚠️ **Un 403 no alcanza para concluir que está apagado.** `r2.dev` está detrás
> de la protección de bots de Cloudflare, que devuelve 403 a los user-agents que
> no parecen un navegador — `Python-urllib/x.y`, el de `requests` sin configurar,
> y varios clientes de línea de comandos. Probar el acceso público con un script
> da 403 aunque esté perfectamente habilitado.
>
> Para verificarlo de verdad, abrir la URL **en el navegador**, o mandar un
> user-agent de navegador:
>
> ```powershell
> curl.exe -I -A "Mozilla/5.0" https://pub-<hash>.r2.dev/<archivo>
> ```
>
> Lo que sí distingue los dos casos es qué responde una **ruta inexistente**: con
> el acceso público encendido da **404**; apagado, da 403 igual que todo lo demás.

Queda una URL `https://pub-<hash>.r2.dev`. Cloudflare limita su ancho de banda y
no la recomienda para producción: cuando haya dominio propio, se conecta en
**Custom Domains** de esa misma pantalla y se cambia solo `R2_PUBLIC_BASE_URL`.
Las fotos ya subidas siguen funcionando, porque en la base se guarda además la
key del objeto.

---

## 3. Render (la API)

El repositorio ya trae [`render.yaml`](../render.yaml), así que no hay que
configurar nada a mano.

1. Render → **New +** → **Blueprint** → elegir el repo `Mambo-repo`.
2. Rama: `integracion-postgres` (o `main` si ya mergeaste).
3. Render lee el blueprint y pide las dos variables marcadas como `sync: false`:
   - `DATABASE_URL` → la cadena del pooler de Supabase.
   - `R2_ACCESS_KEY_ID` y `R2_SECRET_ACCESS_KEY` → las del token de R2.

   El resto (`JWT_SECRET` generado, `COOKIE_SECURE=True`, `COOKIE_SAMESITE=lax`,
   `STORAGE_BACKEND=r2` y las URLs de R2) ya viene definido.
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
3. **Cargar una propiedad con foto.** Después verificá en el bucket de R2 que el
   archivo aparezca bajo `propiedades/`. Si la foto se ve pero no está en el
   bucket, `STORAGE_BACKEND` no quedó en `r2` y el archivo se está escribiendo
   en el disco efímero de Render — donde va a desaparecer en el próximo deploy.
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

**R2 free son 10 GB, y el egress no se cobra nunca.** A ~300 KB por foto ya procesada, sobra.

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
