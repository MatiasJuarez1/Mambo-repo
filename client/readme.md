# Frontend (Vite + React)

```bash
npm install
npm run dev     # http://localhost:5173
npm run build
npm test        # vitest; el --pool=threads ya viene en el script
```

## Despliegue en Vercel

Root Directory del proyecto en Vercel: **`client`**. El resto lo detecta solo
(framework Vite, `npm run build`, salida en `dist`).

### `vercel.json` — por qué existe

No es solo el fallback de rutas del SPA. Los dos primeros rewrites reenvían la
API a Render, y eso es lo que hace que el navegador vea **un solo origen**:

```
navegador → mambo.vercel.app/api/v1/propiedades → (rewrite) → mambo-api.onrender.com/...
```

Esa indirección no es un capricho. Si el front llamara al dominio de Render
directamente, la cookie de sesión pasaría a ser una cookie de terceros, que
exige `SameSite=None` y que **Safari y iOS bloquean por defecto**: el panel admin
quedaría inaccesible desde iPhone y desde Mac. Con el proxy la cookie es propia,
sigue en `SameSite=Lax` y además no hace falta configurar CORS.

Dos cosas que hay que saber al tocarlo:

1. **El host de destino está escrito literal.** `vercel.json` no interpola
   variables de entorno. Si el servicio de Render no se llama `mambo-api`, hay
   que corregir las dos URLs a mano.
2. **Solo se reenvían `/api/*` y `/auth/*`**, que es lo único que consume el
   front hoy. Los routers de plataforma (`/people`, `/deals`, `/activities`…)
   cuelgan de la raíz en el backend: el día que el front llame a uno, hay que
   agregarle su rewrite acá o va a dar 404 en producción andando bien en local.

### Variables de entorno

Ninguna es obligatoria. `VITE_API_URL` solo hace falta para apuntar a una API
distinta de la del proxy; sin ella, en producción las llamadas salen relativas al
propio dominio (ver `src/api/client.ts`).

## Colores

#DE1267
#076766
#E3E5EA
