from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker
from sqlalchemy.pool import StaticPool

from .config import settings


Base = declarative_base()


def _is_sqlite(url: str) -> bool:
    return url.startswith("sqlite")


def _build_engine(url: str):
    connect_args = {"check_same_thread": False} if _is_sqlite(url) else {}
    engine_kwargs = {
        "echo": settings.sql_echo,
        "future": True,
        "connect_args": connect_args,
    }
    if _is_sqlite(url) and ":memory:" in url:
        engine_kwargs["poolclass"] = StaticPool
    return create_engine(url, **engine_kwargs)


engine = _build_engine(settings.database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=Session, expire_on_commit=False)


def reset_database_engine(database_url: str) -> None:
    global engine, SessionLocal
    engine.dispose()
    engine = _build_engine(database_url)
    SessionLocal.configure(bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
