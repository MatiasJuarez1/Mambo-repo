"""Backfill: genera las variantes (`srcset`) de las fotos que ya estaban subidas.

Las copias reducidas de cada foto se generan al subirla, así que las fotos
anteriores a esa función tienen la columna `variantes` en NULL. Eso no rompe
nada —el frontend cae al `url` de siempre— pero se siguen bajando a 1920px en
un teléfono. Este script recorre esas filas, baja el original del
almacenamiento, regenera las copias y llena la columna.

Uso (desde `src/`):

    python -m scripts.regenerar_variantes
    python -m scripts.regenerar_variantes --dry-run
    python -m scripts.regenerar_variantes --forzar

Se corre **como módulo** por la misma razón que `crear_admin` (ver su
docstring): importa `app.main` para registrar todos los modelos antes de tocar
la base.

Dos propiedades que no son adorno:

- **Idempotente.** Saltea las filas que ya tienen `variantes`, así que se puede
  cortar a la mitad y volver a correr sin duplicar trabajo ni pisar nada. Por eso
  el backfill es manual y no un paso del deploy: si un backfill obligatorio se
  cae en la mitad, deja fotos rotas en producción.
- **Una foto que falla no aborta el lote.** Un archivo corrupto en la posición 3
  de 200 no puede dejar las otras 197 sin procesar; se anota cuál falló y se
  sigue. El commit es por fila, así que lo hecho hasta ahí queda hecho.

Salvedad conocida: una foto más chica que la variante más chica (400px) no
genera ninguna y su columna queda en NULL, que es justamente lo que este script
usa como marca de "pendiente". Esas filas se vuelven a leer en cada corrida. Es
una descarga desperdiciada, no un resultado equivocado, y no vale la pena
inventar un valor centinela en la base para evitarla.
"""

from __future__ import annotations

import argparse
from collections.abc import Callable
from dataclasses import dataclass, field

from sqlalchemy.orm import Session as DBSession

# Ver el comentario equivalente en `scripts/crear_admin.py`: importar `app.main`
# registra TODOS los modelos, no solo los de propiedades. Sin eso SQLAlchemy no
# puede resolver las relaciones declaradas por nombre y el script muere antes de
# llegar a la base.
import app.main  # noqa: F401
from app.database import SessionLocal
from app.modules.propiedades.models import PropiedadMedio, TipoMedio
from app.modules.propiedades.service import reprocesar_variantes


@dataclass
class Resumen:
    """Cuentas de una corrida, para el reporte final y para los tests."""

    procesados: int = 0
    salteados: int = 0
    fallas: list[tuple[int, str]] = field(default_factory=list)

    @property
    def fallados(self) -> int:
        return len(self.fallas)


def _motivo_para_saltear(medio: PropiedadMedio, forzar: bool) -> str | None:
    """Devuelve por qué se saltea la fila, o `None` si hay que procesarla.

    Se devuelve el motivo en texto y no un booleano porque el reporte por
    consola es la única forma que tiene quien corre el script de entender por
    qué una foto no cambió: "salteados: 12" a secas no distingue entre "ya
    estaban hechas" y "ninguna era nuestra".
    """
    if not medio.storage_key:
        # Los medios del seed apuntan a URLs de terceros. No hay original
        # nuestro que bajar ni clave de la que derivar las variantes.
        return "sin storage_key (la foto no es nuestra)"
    if medio.variantes is not None and not forzar:
        return "ya tiene variantes"
    return None


def regenerar(
    db: DBSession,
    *,
    forzar: bool = False,
    dry_run: bool = False,
    informar: Callable[[str], None] = print,
) -> Resumen:
    """Recorre las imágenes y regenera sus variantes. Devuelve el resumen.

    Toda la lógica pesada vive en `modules/propiedades/service.py` y en
    `app/storage.py`: acá solo se decide qué filas tocar, se escribe la columna
    y se cuenta. `informar` se inyecta para que los tests lean el reporte sin
    depender de `capsys`.

    Con `dry_run` no se toca **ni el almacenamiento ni la base**: solo se dice
    qué filas se procesarían. No baja los originales, así que tampoco descubre
    archivos corruptos; sirve para saber cuántas fotos y cuántas descargas
    implica la corrida real, no para validarlas.
    """
    medios = (
        db.query(PropiedadMedio)
        .filter(PropiedadMedio.tipo_medio == TipoMedio.imagen)
        .order_by(PropiedadMedio.id)
        .all()
    )
    informar(f"{len(medios)} medios de tipo imagen." + (" (dry-run)" if dry_run else ""))

    resumen = Resumen()
    for medio in medios:
        motivo = _motivo_para_saltear(medio, forzar)
        if motivo:
            resumen.salteados += 1
            informar(f"  medio {medio.id}: salteado — {motivo}")
            continue

        if dry_run:
            resumen.procesados += 1
            informar(f"  medio {medio.id}: se reprocesaría")
            continue

        try:
            variantes = reprocesar_variantes(medio.storage_key)
        except Exception as error:  # noqa: BLE001 — a propósito: ver el docstring del módulo
            # Cualquier cosa: el archivo ya no está, está corrupto, R2 no
            # contesta. Sea cual sea, la respuesta es la misma —anotarla y
            # seguir— así que discriminar el tipo solo agregaría formas nuevas
            # de que el lote muera entero.
            db.rollback()
            resumen.fallas.append((medio.id, f"{type(error).__name__}: {error}"))
            informar(f"  medio {medio.id}: FALLÓ — {type(error).__name__}: {error}")
            continue

        medio.variantes = variantes
        # Commit por fila y no uno solo al final: si la corrida se corta en la
        # mitad (o alguien la interrumpe), lo procesado hasta ahí queda guardado
        # y la próxima lo saltea.
        db.commit()
        resumen.procesados += 1
        anchos = ", ".join(variantes) if variantes else "ninguna"
        informar(f"  medio {medio.id}: variantes {anchos}")

    return resumen


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Regenera las variantes de imagen de las fotos ya subidas."
    )
    parser.add_argument(
        "--forzar",
        action="store_true",
        help="Reprocesa también las filas que ya tienen variantes.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Muestra qué se haría, sin escribir en la base ni en el almacenamiento.",
    )
    args = parser.parse_args(argv)

    db = SessionLocal()
    try:
        resumen = regenerar(db, forzar=args.forzar, dry_run=args.dry_run)
    finally:
        db.close()

    print(
        f"Listo: {resumen.procesados} procesados, "
        f"{resumen.salteados} salteados, {resumen.fallados} fallados."
    )
    for medio_id, error in resumen.fallas:
        print(f"  falló el medio {medio_id}: {error}")

    # Código de salida distinto de cero si algo falló: el resumen se pierde en el
    # scroll de una consola con 200 fotos, el código de salida no.
    return 1 if resumen.fallas else 0


if __name__ == "__main__":
    raise SystemExit(main())
