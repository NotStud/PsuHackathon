"""SQLModel sessions backed by the Supabase PostgreSQL database."""
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import make_url
from sqlalchemy import text
from sqlmodel import SQLModel, Session, create_engine

load_dotenv(Path(__file__).resolve().parent / ".env")


def build_engine(database_url: str):
    if not database_url.strip():
        raise RuntimeError(
            "DATABASE_URL is missing. Copy .env.example to .env and set the "
            "Supabase PostgreSQL connection string from Connect > Session pooler."
        )
    url = make_url(database_url)
    if url.get_backend_name() != "postgresql":
        raise RuntimeError("DATABASE_URL must be a Supabase PostgreSQL connection string.")
    url = url.set(drivername="postgresql+psycopg")
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        connect_args={"sslmode": "require", "connect_timeout": 10, "prepare_threshold": None},
        hide_parameters=True,
    )


engine = build_engine(os.getenv("DATABASE_URL", ""))


def create_db_and_tables():
    import models 

    with engine.begin() as connection:
        SQLModel.metadata.create_all(connection)
        for table in SQLModel.metadata.tables:
            connection.execute(text(f'ALTER TABLE public."{table}" ENABLE ROW LEVEL SECURITY'))


def get_session():
    with Session(engine) as session:
        yield session
