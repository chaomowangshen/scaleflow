import os
from dataclasses import dataclass
from functools import lru_cache
from urllib.parse import quote_plus

from dotenv import load_dotenv


load_dotenv()


def _as_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _resolve_database_url() -> str:
    direct = (os.getenv("DATABASE_URL") or "").strip()
    if direct:
        return direct

    host = (os.getenv("PG_HOST") or "").strip()
    port = (os.getenv("PG_PORT") or "5432").strip()
    user = (os.getenv("PG_USER") or "").strip()
    password = os.getenv("PG_PASSWORD")
    database = (os.getenv("PG_DB") or "").strip()

    missing = []
    if not host:
        missing.append("PG_HOST")
    if not port:
        missing.append("PG_PORT")
    if not user:
        missing.append("PG_USER")
    if password is None or password == "":
        missing.append("PG_PASSWORD")
    if not database:
        missing.append("PG_DB")
    if missing:
        missing_fields = ", ".join(missing)
        raise RuntimeError(
            "DATABASE_URL is not set and PostgreSQL fields are incomplete. "
            f"Missing: {missing_fields}"
        )

    encoded_user = quote_plus(user)
    encoded_password = quote_plus(password)
    return f"postgresql+psycopg://{encoded_user}:{encoded_password}@{host}:{port}/{database}"


@dataclass(frozen=True)
class Settings:
    app_name: str
    database_url: str
    secret_key: str
    access_token_expire_minutes: int
    admin_username: str
    admin_password: str
    purge_grace_days: int
    export_dir: str
    sql_echo: bool


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        app_name=os.getenv("APP_NAME", "Likert Survey Platform"),
        database_url=_resolve_database_url(),
        secret_key=os.getenv("SECRET_KEY", "change-this-secret-in-production"),
        access_token_expire_minutes=int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "720")),
        admin_username=os.getenv("ADMIN_USERNAME", "admin"),
        admin_password=os.getenv("ADMIN_PASSWORD", "admin123"),
        purge_grace_days=int(os.getenv("PURGE_GRACE_DAYS", "7")),
        export_dir=os.getenv("EXPORT_DIR", "./outputs"),
        sql_echo=_as_bool(os.getenv("SQL_ECHO"), False),
    )


settings = get_settings()
