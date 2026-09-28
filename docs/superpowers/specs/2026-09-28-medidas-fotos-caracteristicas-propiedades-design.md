# Propiedades: medidas ampliadas, reordenar fotos y checklist de características — Diseño

Tres pedidos puntuales sobre el formulario de carga de propiedades (`pages/admin/propiedades/Formulario.tsx`), surgidos de uso real del panel: falta distinguir tipos de superficie, no se puede reordenar las fotos ya subidas, y no hay forma de cargar amenities pese a que el modelo (`PropiedadCaracteristica`) y los endpoints ya existen — nunca se les construyó una UI. Estado: aprobado el 28/09/2026.

> **Regla de trabajo para quien implemente esto (humano o agente):** no hacer `git commit` ni `git push` de nada. Se deja todo en el working tree y Matías se encarga de commitear y pushear. Vale para el spec, el plan y cada tarea de implementación.

## 1. Objetivo

Que el formulario de propiedades permita cargar la superficie con el detalle que maneja la inmobiliaria (terreno, construidos, cubiertos, propios, totales), reordenar las fotos ya subidas arrastrándolas, y tildar rápidamente los amenities más comunes en vez de no tener forma de cargarlos.

## 2. Alcance

**Entra**

1. Tres campos de superficie nuevos — `m2_terreno`, `m2_construidos`, `m2_propios` — que se suman a los dos existentes (`m2_cubiertos`, `m2_totales`). Los cinco son opcionales y sin condicionar por tipo de propiedad.
2. Reordenar las fotos ya guardadas arrastrándolas en la grilla del formulario de edición, con un endpoint nuevo que persiste el orden completo y recalcula cuál es la foto "Principal".
3. Checklist de características: catálogo fijo de amenities comunes (checkboxes) + campo para agregar una característica libre, reutilizando el modelo y los endpoints de `caracteristicas` que ya existen pero no tienen UI.

**No entra**

- Condicionar qué campos de m2 se muestran según `tipo_propiedad` — se decidió mostrar siempre los cinco, todos opcionales (Decisión 1).
- Un botón separado para "marcar como principal" sin arrastrar — el drag & drop de fotos es la única forma de cambiarla (Decisión 6).
- Librería de terceros para el drag & drop (`@dnd-kit` o similar) — se usa la Drag and Drop API nativa del navegador (Decisión 4).
- Unificar dormitorios/baños dentro de la grilla de características en la ficha pública — quedan en el bloque de specs numéricos, separado, como hoy (Decisión 10).
- Categorías, grupos o un orden editable dentro del catálogo de checkboxes — es una lista plana fija.
- Traducir o parametrizar el catálogo desde configuración/base de datos — queda como constante en el frontend, igual criterio que el resto de los textos de la UI (en español, hardcodeados).
- Tocar `PropiedadCard.tsx` (tarjetas del listado) — los campos de m2 nuevos y el checklist solo se muestran en el formulario de admin y en la ficha pública de detalle (`Detalle.tsx`); la tarjeta del listado sigue mostrando lo que ya muestra hoy.

## 3. Decisiones

1. **Los 5 campos de superficie son opcionales y no se condicionan por tipo de propiedad.** Más simple de implementar y mantener; una propiedad sin terreno (un depto) simplemente no carga ese campo.
2. **`m2_cubiertos` y `m2_construidos` son conceptos distintos que conviven.** "Cubierto" (bajo techo, incluye garage/lavadero) no es lo mismo que "construido" (superficie edificada total) en el uso real de la inmobiliaria — no se renombra ni se fusiona nada, se agrega `m2_construidos` como campo nuevo e independiente.
3. **La ficha pública solo muestra los m2 que tengan valor cargado**, igual criterio que ya usan `m2_cubiertos`/`m2_totales` hoy (si es `null` no aparece, no se muestra un campo vacío ni un cero).
4. **El drag & drop de fotos es nativo (HTML5 Drag and Drop API), sin agregar una librería.** El admin se usa desde escritorio; no se justifica una dependencia nueva del frontend para esto.
5. **El endpoint de reorden recibe la lista completa de ids en el nuevo orden**, no un PATCH incremental por foto — evita N pedidos por cada drop y hace trivial recalcular tanto `orden` como la foto principal en una sola transacción.
6. **El orden se persiste al instante en cada drop**, igual que hoy se suben y borran fotos al instante — sin botón "guardar orden" aparte.
7. **La primera foto del nuevo orden pasa a ser la Principal automáticamente**, desmarcando la que lo era. Hoy `es_principal` solo se fija al subir la primera foto de la propiedad y no existe ninguna otra forma de cambiarla; con el drag & drop pasa a ser la manera de elegir la portada del sitio público.
8. **El catálogo de checkboxes se amplía más allá de los ítems que pidió Matías**, sumando amenities comunes del rubro (cochera, balcón, jardín, aire acondicionado, etc. — ver §5.4) para no tener que volver sobre esto de inmediato.
9. **Tildar un checkbox = crear una característica con `valor: "si"`; destildarlo = borrar esa fila.** No hay edición de un valor booleano, solo alta/baja. Esto reusa `POST`/`DELETE .../caracteristicas` sin cambios de schema.
10. **En la ficha pública, `valor === "si"` se muestra solo con la clave y un ✅** (ej. "✅ Piscina"); cualquier otro valor (las características de texto libre, tipo "Orientación: Norte") se sigue mostrando como "clave: valor", igual que hoy.
11. **El bloque de specs numéricos (dormitorios, baños, m2) y el bloque de "Características" quedan separados en la ficha pública**, sin fusionarse en una sola lista — cambio más chico, no toca una sección que ya funciona.
12. **Dormitorios y baños no se duplican en el catálogo de checkboxes** — siguen siendo los campos numéricos existentes (`Propiedad.dormitorios`, `Propiedad.banos`), mostrados aparte.
13. **Una sola operación de fotos/características a la vez** (surgió en los reviews, 28/09/2026). Mientras se guarda un reorden no se puede arrastrar otra foto, subir ni borrar; mientras se sube una foto no se puede arrastrar. Lo mismo con las características: mientras se guarda una, los checkboxes, "Agregar" y los "×" quedan deshabilitados. Sin esto, dos pedidos cruzados dejaban la grilla mostrando algo distinto a lo guardado (o creaban características duplicadas con un doble clic). Cada acción limpia el error anterior al empezar, y un alta libre que falla conserva lo escrito.
14. **"Tildada" se reconoce sin importar mayúsculas ni tildes** (`esTildada` en `lib/propiedad.ts`): el seed carga `Balcón: Sí`, y con la comparación exacta contra `"si"` aparecía como chip, con el checkbox destildado y un duplicado al tildarlo. Las nuevas se siguen guardando como `"si"`.
15. **El admin muestra primero la foto Principal**, con el mismo orden que la ficha pública (`ordenarMedios`), para que datos viejos donde la principal no es la de `orden` 0 se vean igual en los dos lados.
16. **Enter en los campos de característica libre la agrega**, en vez de enviar el formulario entero de la propiedad.

## 4. Backend

### 4.1 Modelo (`modules/propiedades/models.py`)

```python
class Propiedad(Base):
    ...
    m2_terreno = Column(Numeric(10, 2), nullable=True)
    m2_construidos = Column(Numeric(10, 2), nullable=True)
    m2_cubiertos = Column(Numeric(10, 2), nullable=True)   # ya existía
    m2_propios = Column(Numeric(10, 2), nullable=True)
    m2_totales = Column(Numeric(10, 2), nullable=True)     # ya existía
```

Se ubican juntas en el `__tablename__ = "propiedades"` existente, sin tabla nueva.

### 4.2 Migración

```bash
cd src
alembic revision --autogenerate -m "agrega m2_terreno, m2_construidos y m2_propios a propiedades"
alembic upgrade head   # local, para probar
```

Revisar el archivo generado: deben aparecer solo `add_column` para las tres columnas nuevas (nullable, sin `server_default`) y nada más. Correr `alembic check` antes de mergear, como indica el CLAUDE.md del repo.

### 4.3 Schemas (`modules/propiedades/schemas.py`)

`PropiedadBase` suma los tres campos (y por herencia llegan a `PropiedadCreate`/`PropiedadUpdate` — en `Update` ya son todos opcionales porque la clase entera lo es):

```python
class PropiedadBase(BaseModel):
    ...
    m2_terreno: Decimal | None = None
    m2_construidos: Decimal | None = None
    m2_cubiertos: Decimal | None = None   # ya existía
    m2_propios: Decimal | None = None
    m2_totales: Decimal | None = None     # ya existía
```

`PropiedadUpdate` no hereda de `PropiedadBase` (es una clase aparte con todos los campos opcionales) — se le agregan los mismos tres campos a mano, igual que ya tiene `m2_cubiertos`/`m2_totales`. `PropiedadListItem` también suma los tres, mismo criterio que ya sigue con los dos existentes.

### 4.4 Reordenar medios

**Schema nuevo** (`schemas.py`):

```python
class ReordenarMediosRequest(BaseModel):
    orden: list[int]  # ids de PropiedadMedio, en el orden deseado
```

**Service** (`service.py`):

```python
def reordenar_medios(db: Session, propiedad_id: int, orden: list[int]) -> list[PropiedadMedio]:
    obtener_propiedad(db, propiedad_id)

    medios = (
        db.query(PropiedadMedio)
        .filter(PropiedadMedio.propiedad_id == propiedad_id)
        .all()
    )
    por_id = {m.id: m for m in medios}

    faltantes = set(por_id) - set(orden)
    ajenos = set(orden) - set(por_id)
    if faltantes or ajenos:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La lista de ids no coincide con los medios de la propiedad",
        )

    for posicion, medio_id in enumerate(orden):
        medio = por_id[medio_id]
        medio.orden = posicion
        medio.es_principal = posicion == 0

    db.commit()
    return sorted(medios, key=lambda m: m.orden)
```

Exige la lista **completa** (no un subconjunto): así no hay ambigüedad sobre qué pasa con los medios que no se nombran, y el frontend siempre tiene el array entero en memoria de todas formas.

**Router** (`router.py`), junto a los otros endpoints de medios:

```python
@router.put(
    "/{propiedad_id}/medios/orden",
    response_model=list[MedioResponse],
    dependencies=SOLO_STAFF,
)
def reordenar_medios(
    propiedad_id: int, data: ReordenarMediosRequest, db: Session = Depends(get_db)
):
    return service.reordenar_medios(db, propiedad_id, data.orden)
```

No colisiona con `DELETE /{propiedad_id}/medios/{medio_id}`: FastAPI matchea `/orden` como segmento literal, no como si fuera un `{medio_id}` numérico, así que el orden de declaración entre ambas rutas no importa. Se agrupa junto al resto de los endpoints de `medios` por prolijidad.

### 4.5 Errores

| Caso | Código y mensaje |
|---|---|
| Propiedad inexistente o eliminada | 404 "Propiedad no encontrada" (ya lo da `obtener_propiedad`) |
| `orden` no incluye exactamente los ids de medios de esa propiedad (falta uno, sobra uno de otra propiedad, duplicado) | 400 "La lista de ids no coincide con los medios de la propiedad" |
| Anónimo o sin rol staff/admin en `PUT .../medios/orden` | 401/403 vía `require_role`, mismo `SOLO_STAFF` que el resto de mutaciones de medios |

## 5. Frontend

### 5.1 `types/propiedad.ts`

- `PropiedadListItem`, `Propiedad` y `PropiedadCreatePayload` suman `m2_terreno`, `m2_construidos`, `m2_propios` (`number | null` / `number | undefined` según ya siguen `m2_cubiertos`/`m2_totales`).

### 5.2 `api/propiedades.ts`

```ts
reordenarMedios: (propiedadId: number, orden: number[]) =>
  request<Medio[]>(`${BASE}/${propiedadId}/medios/orden`, {
    method: 'PUT',
    body: JSON.stringify({ orden }),
  }),
```

(mismo patrón `request()` que ya usan `subirMedio`/`eliminarMedio`).

### 5.3 `Formulario.tsx` — Medidas y ambientes

`FormState` e `INITIAL` suman `m2_terreno`, `m2_construidos`, `m2_propios` (string, igual patrón que los existentes). La sección queda:

```text
┌─ Medidas y ambientes ────────────────────────────────────────────┐
│ Dormitorios   Baños   m² terreno   m² construidos                │
│ m² cubiertos  m² propios   m² totales                            │
└────────────────────────────────────────────────────────────────────┘
```

Cada campo es un `<input type="number" min="0">` igual a los existentes, agregados al mismo `form-row` (o partidos en dos filas si quedan muy apretados — criterio visual libre de quien implemente, sin cambiar el patrón `form-field`/`form-row` ya usado en el resto del form). `handleSubmit` agrega los tres campos al `payload` con `num(form.m2_x)`, igual que los dos existentes.

### 5.4 `Formulario.tsx` — Checklist de características

Catálogo fijo, constante nueva (por ejemplo en `lib/propiedad.ts`, junto a `etiquetaEstado`/`mediaUrl`):

```ts
export const CATALOGO_CARACTERISTICAS = [
  'Suite principal con vestidor',
  'Escritorio',
  'Sala de juegos',
  'Dependencia de servicio con baño',
  'Galería techada y quincho',
  'Asador',
  'Piscina',
  'Terraza',
  'Cochera',
  'Balcón',
  'Jardín',
  'Lavadero',
  'Placards empotrados',
  'Cocina equipada',
  'Aire acondicionado',
  'Calefacción central',
  'Portón eléctrico',
  'Living comedor',
] as const
```

En el form (sección nueva "Características", entre "Ubicación" y "Fotos", visible solo en `esEdicion` porque `caracteristicas` cuelga de una propiedad ya creada, mismo motivo por el que "Fotos" ya tiene esa restricción):

- Grilla de checkboxes, uno por ítem del catálogo. Tildado = existe una fila en `caracteristicas` con `clave === item && valor === 'si'`.
- `onChange` de un checkbox:
  - Tildar → `propiedadesApi.agregarCaracteristica(id, { clave: item, valor: 'si' })`, agrega la respuesta a `caracteristicas` local.
  - Destildar → busca la fila local con esa `clave` y `valor === 'si'`, llama `propiedadesApi.eliminarCaracteristica(id, fila.id)`, la saca del estado local.
- Debajo, un campo de texto + botón "Agregar" para una característica libre (clave y valor en dos inputs cortos, o un solo input tipo "Orientación: Norte" que se parte en el primer `:` — criterio de implementación, ambos válidos dado que el modelo no distingue origen). Se muestra como chip con una "×" para borrarla, igual patrón visual que las fotos (`foto-quitar`).
- Estado nuevo `const [caracteristicas, setCaracteristicas] = useState<Caracteristica[]>([])`, poblado en el mismo `useEffect` que ya carga `medios` desde `p.caracteristicas`.

### 5.5 `Formulario.tsx` — Drag & drop de fotos

Sobre el `fotos-grid` existente, cada `foto-item` se hace arrastrable:

```tsx
<div
  key={m.id}
  className={`foto-item ${arrastrando === m.id ? 'arrastrando' : ''}`}
  draggable
  onDragStart={() => setArrastrando(m.id)}
  onDragOver={e => e.preventDefault()}
  onDrop={() => soltarSobre(m.id)}
  onDragEnd={() => setArrastrando(null)}
>
  ...
</div>
```

```ts
const [arrastrando, setArrastrando] = useState<number | null>(null)

const soltarSobre = (destinoId: number) => {
  if (arrastrando === null || arrastrando === destinoId) return
  const actual = [...medios]
  const origenIdx  = actual.findIndex(m => m.id === arrastrando)
  const destinoIdx = actual.findIndex(m => m.id === destinoId)
  const [movido] = actual.splice(origenIdx, 1)
  actual.splice(destinoIdx, 0, movido)

  setMedios(actual)  // optimista, igual criterio que subir/borrar
  setArrastrando(null)

  propiedadesApi.reordenarMedios(Number(id), actual.map(m => m.id))
    .then(setMedios)  // confirma con lo que devuelve el backend (es_principal recalculado)
    .catch(e => setError(e instanceof Error ? e.message : 'No se pudo reordenar las fotos'))
}
```

CSS nuevo en `Formulario.css`: `.foto-item.arrastrando { opacity: 0.4; }` para dar feedback visual mientras se arrastra — sin más efectos (sin placeholder animado ni indicador de línea de inserción, para no complicar el CSS por una mejora cosmética).

### 5.6 `Detalle.tsx` (ficha pública)

- Bloque `detalle-specs`: se agregan los tres `div.detalle-spec` nuevos (terreno, construidos, propios) con la misma condición `!= null` que ya usan cubiertos/totales, y el mismo `formatSuperficie`.
- Bloque de características (`detalle-caract-grid`): cada `c.valor === 'si'` se renderiza como `<span className="detalle-caract-item">✅ {c.clave}</span>`; cualquier otro valor sigue como `<span className="detalle-caract-item">{c.clave}: {c.valor}</span>`.

## 6. Tests

Backend (`src/tests/`):

- `test_propiedades_permisos.py`: agregar el caso `("put", f"/api/v1/propiedades/{propiedad_id}/medios/orden", {"orden": []})` a la lista de endpoints que exigen `SOLO_STAFF`, igual patrón que los demás de medios/caracteristicas ahí presentes.
- `test_propiedades_medios_orden.py` (nuevo):
  - Reordenar 3 fotos devuelve la lista en el nuevo orden, con `orden` secuencial (0, 1, 2) y `es_principal` solo en la primera.
  - La foto que era principal antes del reorden deja de serlo si ya no queda primera.
  - Mandar un `orden` con un id de otra propiedad → 400.
  - Mandar un `orden` al que le falta un id existente → 400.
- Migración: correr `alembic check` localmente antes de mergear (ya documentado en el CLAUDE.md del repo) — no hace falta un test de pytest para esto.

Frontend (`client/src/pages/admin/propiedades/`):

- `Formulario.medidas.test.tsx` (nuevo, o sumado a un test existente si ya cubre el form): los 5 campos de m2 se envían en el payload de creación/edición cuando tienen valor, y no se envían (`undefined`) cuando están vacíos.
- `Formulario.caracteristicas.test.tsx` (nuevo): tildar un checkbox llama a `agregarCaracteristica` con `valor: 'si'`; destildar uno ya tildado llama a `eliminarCaracteristica` con el id correcto; agregar una característica libre la suma a la lista.
- `Formulario.fotos.test.tsx` o ampliar el test existente del form: simular `dragStart`/`drop` entre dos `foto-item` llama a `reordenarMedios` con el array de ids en el nuevo orden.
- `Detalle.test.tsx`: una característica con `valor: 'si'` se muestra con el prefijo ✅ y sin ": si"; una con otro valor se sigue mostrando como "clave: valor"; los tres m2 nuevos aparecen en `detalle-specs` cuando tienen valor y no aparecen cuando son `null`.

## 7. Despliegue

Requiere migración, y **el orden importa: primero la migración, después el push.** Si Render despliega el código antes de que existan las columnas, toda consulta de propiedades falla con "column does not exist" y se cae el sitio público entero. Al revés es seguro: las columnas son nullable y el código viejo las ignora. Correr `alembic upgrade head` contra Supabase (pooler de sesión), confirmar con `alembic current` que quedó en `0012_superficies_propiedad`, y recién ahí pushear, siguiendo el mismo procedimiento que ya documenta el CLAUDE.md del repo — Render no corre migraciones en el deploy. Sin variables de entorno nuevas, sin cambios a `render.yaml` ni `vercel.json`.

## 8. Deuda conocida

- El catálogo de características queda hardcodeado en el frontend. Si algún día hace falta que cada inmobiliaria (o cada tipo de propiedad) tenga su propio catálogo, es un cambio de modelo (tabla de catálogo configurable) que no se justifica hoy con un solo tenant.
- El drag & drop nativo no funciona bien en pantallas táctiles (tablets). Como el panel se usa desde escritorio, se acepta la limitación; si en el futuro hace falta soporte táctil, ahí sí se justificaría sumar una librería (`@dnd-kit`, que ya se evaluó y se descartó para esta vuelta — Decisión 4).

## 9. Después, si aparece la demanda

Reordenar o elegir qué características del catálogo se ofrecen sin tocar código (catálogo configurable desde `inmobiliaria`). Indicador visual de "insertar acá" durante el drag (línea entre fotos) en vez de solo atenuar la que se arrastra. Soporte táctil para reordenar fotos desde tablet/celular.
