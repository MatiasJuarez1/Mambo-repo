from pathlib import Path
from pydantic_settings import BaseSettings

# El .env vive en la raíz del repo (un nivel arriba de src/)
_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/mamboDB"

    model_config = {"env_file": str(_ENV_FILE)}


settings = Settings()
