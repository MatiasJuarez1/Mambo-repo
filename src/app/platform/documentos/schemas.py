"""DTOs de documentos. El alta es multipart (sin schema de entrada JSON)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

# Única fuente del catálogo: la base guarda un String(30) sin enum nativo.
TipoDocumento = Literal[
    "boleto", "reserva_firmada", "dni", "informe_dominio", "anexo_fotografico", "otro"
]


class DocumentoOut(BaseModel):
    id: int
    tipo: TipoDocumento
    archivo_url: str
    nombre_original: str
    tamano_bytes: int
    subido_por: str
    created_at: datetime

    model_config = {"from_attributes": True}
