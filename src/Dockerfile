FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY pyproject.toml README.md /app/
COPY app /app/app

# Sin el extra [dev]: ruff y pytest no tienen nada que hacer en una imagen que
# solo corre el servidor, y son varios MB y varios segundos de build de más.
RUN pip install --no-cache-dir -U pip \
  && pip install --no-cache-dir -e .

EXPOSE 8000

# Forma shell (no exec) para que ${PORT} se expanda. Los hostings asignan el
# puerto por variable de entorno y esperan que el proceso escuche ahí; con el
# 8000 fijo, Render publica el servicio en un puerto donde no hay nadie
# escuchando y el deploy queda colgado en "in progress" hasta que expira.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
