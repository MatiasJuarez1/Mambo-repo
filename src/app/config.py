from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "mysql+pymysql://root:root@localhost:3306/inmobiliaria_crm"

    model_config = {"env_file": ".env"}


settings = Settings()
