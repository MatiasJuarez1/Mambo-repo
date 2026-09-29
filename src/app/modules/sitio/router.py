"""Router sitio: vistas previas para compartir, sitemap y robots.txt. Todo público.

Ninguna de estas rutas la llama el front: `vercel.json` reescribe hacia acá
`/sitemap.xml`, `/robots.txt` y, solo para los lectores de vistas previas
(WhatsApp, Facebook…), `/propiedades/:id`.
"""

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, Response
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.modules.sitio import service

router = APIRouter(prefix="/sitio", tags=["Sitio"])

# Una hora en el CDN de Vercel: una propiedad editada tarda eso en verse en una
# vista previa nueva, y a cambio un link muy compartido no despierta a Render.
_CACHE = {"Cache-Control": "public, max-age=0, s-maxage=3600"}


def _base(request: Request) -> str:
    """URL pública del sitio. `SITIO_URL` manda; si no está, la deduce de lo que
    reenvía el proxy de Vercel, y en dev, del propio request."""
    configurada = get_settings().sitio_url
    if configurada:
        return configurada.rstrip("/")
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    esquema = request.headers.get("x-forwarded-proto") or request.url.scheme
    return f"{esquema}://{host.split(',')[0].strip()}"


@router.get("/propiedades/{propiedad_id}", response_class=HTMLResponse)
def vista_previa_propiedad(propiedad_id: int, request: Request, db: Session = Depends(get_db)):
    prop = service.propiedad_publica(db, propiedad_id)
    ruta = f"/propiedades/{propiedad_id}"
    html = service.html_vista_previa(db, prop, _base(request), ruta)
    # 200 también cuando no existe: el lector igual necesita algo que mostrar, y
    # la SPA es la que le dice a la persona que la propiedad no está.
    return HTMLResponse(html, headers=_CACHE)


@router.get("/sitemap.xml")
def sitemap(request: Request, db: Session = Depends(get_db)):
    return Response(
        service.sitemap(db, _base(request)), media_type="application/xml", headers=_CACHE
    )


@router.get("/robots.txt", response_class=PlainTextResponse)
def robots(request: Request):
    return PlainTextResponse(service.robots(_base(request)), headers=_CACHE)
