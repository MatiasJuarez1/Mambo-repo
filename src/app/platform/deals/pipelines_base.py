"""Pipelines con los que arranca el sistema.

Un solo lugar para la migración 0004 y para `service.sembrar_pipelines_base`
(que usan los tests): si cambian las etapas, cambian acá.
"""

# (nombre, [(etapa, posición, is_won, is_lost), ...])
PIPELINES_BASE: list[tuple[str, list[tuple[str, int, bool, bool]]]] = [
    (
        "Venta",
        [
            ("Consulta", 1, False, False),
            ("Visita", 2, False, False),
            ("Oferta", 3, False, False),
            ("Ganada", 4, True, False),
            ("Perdida", 5, False, True),
        ],
    ),
    (
        "Alquiler",
        [
            ("Consulta", 1, False, False),
            ("Visita", 2, False, False),
            ("Reserva", 3, False, False),
            ("Contrato firmado", 4, True, False),
            ("Perdida", 5, False, True),
        ],
    ),
]
