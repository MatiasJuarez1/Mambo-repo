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

   **Opcionales, para mandar recibos y liquidaciones por email:** `SMTP_HOST`,
   `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASSWORD` y `EMAIL_FROM`. Se
   cargan a mano en la pestaña *Environment* del servicio, como `DATABASE_URL`;
   no están en `render.yaml` porque el panel funciona sin ellas (los botones
   "Enviar por email" quedan deshabilitados y la configuración de la
   inmobiliaria muestra "Envío de emails: no configurado"). Si se define una,
   hay que definir las cinco: la API no arranca con SMTP a medias. Con Gmail:
   contraseña de aplicación (no la de la cuenta), puerto 587,
   `EMAIL_FROM=Inmobiliaria <cuenta@gmail.com>`. El puerto 465 usa SSL directo;
   cualquier otro, STARTTLS.
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
5. **Si se cargaron las `SMTP_*`:** desde un contrato administrado, registrar
   un pago y "Enviar por email". Si la API responde 202 pero el email no llega,
   el detalle está en los logs de Render (`No se pudo enviar Pago #…`): casi
   siempre es la contraseña de aplicación o el puerto.

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

### Variantes de fotos (una sola vez, después de la migración `0003`)

Las fotos nuevas generan solas sus variantes de 400/800/1600 al subirse. Las que
ya estaban en el bucket antes de la migración quedan con `variantes` en `NULL` y
se siguen sirviendo enteras: no se rompen, pero un celular se las baja a
resolución completa.

Para reprocesarlas, con `DATABASE_URL` y las cinco variables de R2 apuntando a
producción:

```powershell
cd src
python -m scripts.regenerar_variantes --dry-run   # cuántas fotos son
python -m scripts.regenerar_variantes
```

Baja cada original de R2, genera las variantes y las vuelve a subir, así que
consume tráfico del bucket. Es **idempotente**: se puede cortar a la mitad y
volver a correr, y las filas ya hechas se saltean. Si alguna foto falla, la
informa y sigue con el resto; el script sale con código 1 para que la falla no
se pierda en el scroll.

⚠️ La revisión **`0002_indices_declarados`** crea 19 índices que los modelos
declaran y el esquema inicial nunca creó. Uno de ellos, `ix_sessions_token_hash`,
es **UNIQUE**: si en producción hubiera `token_hash` duplicados, el
`CREATE INDEX` falla y hay que limpiar esas filas de `sessions` antes (borrarlas
solo desloguea a quien las tenga).

### Referencias huérfanas (una sola vez, antes de la migración `0004`)

La revisión **`0004_crm_en_el_panel`** formaliza cuatro claves foráneas que las
columnas nunca tuvieron (`propiedades.propietario_persona_id`,
`reservations.property_id`, `deals.property_id` y `activities.property_id`). Si
en producción hay filas apuntando a un id que ya no existe, el `CREATE` de esa
FK falla y la migración se corta a la mitad. Antes de `alembic upgrade head`,
correr contra Supabase:

```sql
SELECT id FROM propiedades WHERE propietario_persona_id IS NOT NULL
  AND propietario_persona_id NOT IN (SELECT id FROM people);
SELECT id FROM reservations WHERE property_id NOT IN (SELECT id FROM propiedades);
SELECT id FROM deals WHERE property_id IS NOT NULL
  AND property_id NOT IN (SELECT id FROM propiedades);
SELECT id FROM activities WHERE property_id IS NOT NULL
  AND property_id NOT IN (SELECT id FROM propiedades);
```

Las cuatro tienen que devolver cero filas. Si alguna devuelve algo, poner esa
columna en `NULL` (o borrar la fila, en el caso de `reservations`, cuya
propiedad es obligatoria) y recién entonces migrar.

La misma revisión siembra los pipelines **Venta** y **Alquiler** con sus etapas,
pero sólo si la tabla `pipelines` está vacía: si ya hay alguno cargado, no
agrega nada.

### Contratos de alquiler (migración `0005`)

La revisión **`0005_alquileres_contratos`** crea tres tablas nuevas
(`alquileres_contratos`, `alquileres_contrato_partes`, `alquileres_ajustes`) y
cuatro enums de PostgreSQL (`indice_ajuste`, `estado_contrato`,
`rol_parte_contrato`, `estado_ajuste`). No toca ninguna tabla existente, así que
no hay chequeo previo: alcanza con `alembic upgrade head` contra Supabase.

Dos cosas a tener en cuenta:

- **Correrla antes de desplegar el frontend.** El panel nuevo (menú
  "Alquileres", los dos tiles del dashboard, el bloque "Contrato de alquiler" en
  la propiedad, el botón "Crear contrato" en un deal de Alquiler ganado) pide
  `GET /api/v1/alquileres/contratos` apenas se abre; si la API ya está
  desplegada pero la base no tiene las tablas, esas pantallas muestran un 500 en
  vez de datos. El orden seguro es: `alembic upgrade head` → push de la API →
  push del frontend.
- **Dependencia nueva en la API:** `python-dateutil` (en `pyproject.toml`).
  Render la instala solo en el build; si la API corre en otro lado, hay que
  reinstalar con `pip install -e .`.

Para volver atrás, `alembic downgrade 0004_crm_en_el_panel` borra las tres
tablas y los cuatro enums — con los contratos cargados adentro, así que no es un
paso que se dé a la ligera.

### Cobros, recibos y liquidaciones (migración `0006`)

La revisión **`0006_alquileres_cobros`** crea cuatro tablas (`alquileres_cobros`,
`alquileres_pagos`, `alquileres_gastos`, `alquileres_liquidaciones`), cuatro
enums (`estado_cobro`, `medio_pago`, `tipo_gasto`, `estado_liquidacion`) y
agrega columnas con default a `inmobiliaria` (`punitorio_diario_pct`,
`dias_gracia` y los contadores `ultimo_recibo` / `ultima_liquidacion`) y a
`alquileres_contratos` (`punitorio_diario_pct`). No hay chequeo previo:
`alembic upgrade head` contra Supabase alcanza.

- **Mismo orden que la `0005`**: `alembic upgrade head` → push de la API → push
  del frontend. La ficha del contrato y el dashboard piden `cobros` y
  `/alquileres/resumen` apenas se abren.
- **Los contratos administrados que ya existían no tienen cobros.** Los cobros
  se materializan al crear el contrato o al pasarlo a administrado, y la
  migración no los genera para atrás. Para cada uno de esos contratos, desde la
  ficha: editar → `administrado` off → guardar → `administrado` on → guardar.
  Eso genera un cobro por mes desde `fecha_inicio`; los meses que ya se cobraron
  por fuera del sistema se anulan con "Anular mes" (motivo: "Cobrado antes del
  sistema"), así no aparecen como vencidos. Son pocos contratos; si algún día
  fueran muchos, es un script de diez líneas sobre `cobros.generar_cobros`.
- **Dependencia nueva en la API:** `fpdf2` (en `pyproject.toml`), más las dos
  fuentes DejaVu en `app/assets/fonts/` (van en el repo y en el paquete vía
  `package-data`). Render las instala solas en el build.
- **Los PDF van a R2** bajo `recibos/`, `liquidaciones/` y `gastos/`, con la
  misma configuración que las fotos. Un recibo emitido con el disco local de
  Render se pierde en el próximo deploy: en producción `STORAGE_BACKEND=r2`
  sigue siendo obligatorio, ahora por dos razones.
- **La numeración de recibos y liquidaciones es correlativa global** y sale de
  los contadores de `inmobiliaria`. `alembic downgrade 0005_alquileres_contratos`
  borra las cuatro tablas **y los contadores**: si se vuelve a subir, la
  numeración arranca de 0001-00000001 otra vez. Con recibos ya entregados a
  inquilinos, no es un paso que se dé.

### Recordatorios (migración `0007`)

La revisión **`0007_recordatorios`** agrega `inmobiliaria.dias_aviso_recordatorios`
(default 30). Los recordatorios no se guardan: se calculan en cada request.
`alembic upgrade head` contra Supabase alcanza; después, push de la API y del
frontend.

**El email diario lo dispara GitHub Actions**, no Render (el plan free no tiene
cron). Tres pasos, una sola vez:

1. Generar un token: `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
2. En Render, pestaña *Environment* del servicio: `RECORDATORIOS_TOKEN=<token>`.
   Sin esta variable el endpoint `POST /api/v1/alquileres/recordatorios/enviar`
   responde 404. Requiere además las `SMTP_*` (sin ellas responde 409).
3. En GitHub, *Settings → Secrets and variables → Actions*: `RECORDATORIOS_TOKEN`
   (el mismo valor) y `RECORDATORIOS_URL` (`https://<servicio>.onrender.com`,
   sin barra final).

El workflow [`.github/workflows/recordatorios.yml`](../.github/workflows/recordatorios.yml)
corre a las 08:00 de Argentina. Para probarlo: *Actions → Recordatorios diarios →
Run workflow*; el job queda verde si la API respondió 200 (con `items: 0` si no
había nada, en cuyo caso no se manda email) y rojo con el `detail` en el log si
no. Render free duerme el servicio: el primer request puede tardar ~30 s, el
`--max-time 120` lo cubre.

### Comisiones y reportes (migración `0008`)

`alembic upgrade head` crea `comisiones`, `comisiones_reparto` y `deal_stage_history`, y carga en esta última una estadía abierta por cada operación viva (su etapa actual desde `stage_changed_at`): el embudo arranca con lo que se sabe y se completa con el uso. Las operaciones ganadas **antes** de esta migración no tienen comisión: la ficha muestra "Sin comisión cargada" y se carga a mano con "Cargar comisión". Sin variables nuevas. La exportación CSV usa `;` y coma decimal (Excel en español).

### Documentos (migración `0009`)

- `0009_documentos` (Bloque 3): una tabla nueva `documentos`, sin backfill ni variables nuevas. Usa el `STORAGE_BACKEND` ya configurado; en Render tiene que ser `r2` como el resto.

### Actividades con deal_id (migración `0010`)

- `0010_activities_deal_id` (Bloque 5a): una columna nullable en `activities`, sin backfill ni variables nuevas.
