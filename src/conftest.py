"""Arranque del entorno de tests, previo a cualquier import de la aplicación.

`Settings.jwt_secret` no tiene valor por defecto a propósito: si falta, la app no
arranca. Como `app.config` construye el `Settings` en tiempo de import, la suite
necesita el secreto puesto **antes** de que se importe `app.main`, y este archivo
es lo primero que carga pytest (los conftest se leen desde la raíz hacia abajo).

Va acá y no en `tests/conftest.py` justamente por eso: ese módulo ya importa
`app.main` en su cabecera, así que sería tarde.
"""

import os

# `setdefault`: si alguien ya exportó JWT_SECRET en su entorno, se respeta.
os.environ.setdefault("JWT_SECRET", "secreto-solo-para-tests-no-usar-en-produccion")
