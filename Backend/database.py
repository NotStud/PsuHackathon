"""SQLModel sessions backed by the Supabase PostgreSQL database, or a local SQLite file when none is set."""
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import make_url
from sqlalchemy import text
from sqlmodel import SQLModel, Session, create_engine

load_dotenv(Path(__file__).resolve().parent / ".env")


LOCAL_DATABASE = Path(__file__).resolve().parent / "local.db"


def build_engine(database_url: str):
    # No DATABASE_URL: run locally on a SQLite file next to this module.
    if not database_url.strip():
        database_url = f"sqlite:///{LOCAL_DATABASE.as_posix()}"
    url = make_url(database_url)
    if url.get_backend_name() == "sqlite":
        # FastAPI runs requests on worker threads, so the connection is shared across them.
        return create_engine(url, connect_args={"check_same_thread": False})
    if url.get_backend_name() != "postgresql":
        raise RuntimeError("DATABASE_URL must be a Supabase PostgreSQL connection string (or empty for local SQLite).")
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
        if engine.dialect.name != "sqlite":  # a local file is created fresh with every column
            migrate_postgres(connection)
        copy_old_challenges(connection)


def migrate_postgres(connection):
    # Existing Supabase tables need additive columns for the merged league rules.
    for table, column, definition in (
        ("leagues", "shooter_cooldown_minutes", "INTEGER NOT NULL DEFAULT 0"),
        ("leagues", "bounty_bonus_points", "INTEGER NOT NULL DEFAULT 0"),
        ("leagues", "king_bonus_points", "INTEGER NOT NULL DEFAULT 0"),
        ("leagues", "round_duration_days", "DOUBLE PRECISION NOT NULL DEFAULT 7"),
        ("leagues", "created_at", "TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')"),
        ("league_members", "cooldown_until", "TIMESTAMP"),
        ("league_snipes", "request_id", "VARCHAR"),
        ("leagues", "bounty_hours", "DOUBLE PRECISION NOT NULL DEFAULT 24"),
        ("leagues", "creator_id", "INTEGER"),
        ("players", "avatar_url", "TEXT"),
        ("league_snipes", "crosshair", "VARCHAR"),
        ("league_snipes", "headshot", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("league_snipes", "missed", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("league_challenges", "headshot", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("leagues", "headshot_bonus_points", "INTEGER NOT NULL DEFAULT 2"),
        ("leagues", "challenge_votes", "INTEGER NOT NULL DEFAULT 1"),
    ):
        connection.execute(text(f'ALTER TABLE public."{table}" ADD COLUMN IF NOT EXISTS "{column}" {definition}'))
    for table in SQLModel.metadata.tables:
        connection.execute(text(f'ALTER TABLE public."{table}" ENABLE ROW LEVEL SECURITY'))


def copy_old_challenges(connection):
    """Challenges used to be settled by one approver (snipe_challenges). Copy any not yet
    copied into the voting tables, with the approver as a yes vote."""
    connection.execute(text(
        "INSERT INTO league_challenges (snipe_id, kind, challenger_id, reason, status, created_at, resolved_at) "
        "SELECT s.snipe_id, 'reverse', s.challenger_id, s.reason, s.status, s.created_at, s.approved_at "
        "FROM snipe_challenges s WHERE NOT EXISTS (SELECT 1 FROM league_challenges c "
        "WHERE c.snipe_id = s.snipe_id AND c.kind = 'reverse')"
    ))
    connection.execute(text(
        "INSERT INTO challenge_votes (challenge_id, voter_id, approve, created_at) "
        "SELECT c.id, s.approved_by, TRUE, s.approved_at FROM snipe_challenges s "
        "JOIN league_challenges c ON c.snipe_id = s.snipe_id AND c.kind = 'reverse' "
        "WHERE s.approved_by IS NOT NULL AND s.approved_at IS NOT NULL AND NOT EXISTS "
        "(SELECT 1 FROM challenge_votes v WHERE v.challenge_id = c.id AND v.voter_id = s.approved_by)"
    ))


def get_session():
    with Session(engine) as session:
        yield session
