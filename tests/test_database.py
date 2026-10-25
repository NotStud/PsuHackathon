"""Offline configuration and score regression checks (no Supabase writes)."""
import os
import unittest
from unittest.mock import patch, MagicMock

# Importing creates the engine, but does not connect to this placeholder host.
with patch.dict(os.environ, {"DATABASE_URL": "postgresql://postgres:test@localhost:5432/postgres"}):
    import database
    import main

from sqlalchemy import update
from sqlalchemy.dialects import postgresql
from sqlmodel import SQLModel, Session, create_engine
from models import GamePlayer


class DatabaseTests(unittest.TestCase):
    def test_postgres_driver_and_password(self):
        engine = database.build_engine("postgresql://postgres.project:p%40ss%23word@localhost:5432/postgres")
        try:
            self.assertEqual(engine.url.drivername, "postgresql+psycopg")
            self.assertEqual(engine.url.password, "p@ss#word")
            args, kwargs = engine.dialect.create_connect_args(engine.url)
            self.assertEqual(kwargs["port"], 5432)
        finally:
            engine.dispose()

    def test_requires_postgres_configuration(self):
        with self.assertRaises(RuntimeError):
            database.build_engine("mysql://root@localhost/game")

    def test_local_sqlite_without_configuration(self):
        engine = database.build_engine("")
        try:
            self.assertEqual(engine.dialect.name, "sqlite")
            self.assertEqual(engine.url.database, database.LOCAL_DATABASE.as_posix())
        finally:
            engine.dispose()

    def test_rls_and_creation_share_transaction(self):
        engine = MagicMock()
        connection = engine.begin.return_value.__enter__.return_value
        with patch.object(database, "engine", engine), patch.object(SQLModel.metadata, "create_all") as create:
            database.create_db_and_tables()
        create.assert_called_once_with(connection)
        statements = [str(call.args[0]) for call in connection.execute.call_args_list]
        # One ENABLE ROW LEVEL SECURITY per table, 15 added columns, 2 statements copying old challenges.
        self.assertEqual(len(statements), len(SQLModel.metadata.tables) + 17)
        for table in ("players", "games", "game_players", "snipes", "league_challenges", "challenge_votes"):
            self.assertIn(f'ALTER TABLE public."{table}" ENABLE ROW LEVEL SECURITY', statements)

    def test_game_score_lifecycle(self):
        engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(engine)
        try:
            with Session(engine) as session:
                player = main.create_player(" Alex ", session)
                game = main.create_game(session)
                main.join_game(game.id, player.id, session)
                self.assertEqual(main.increment_score(game.id, player.id, session).score, 1)
                self.assertEqual(main.increment_score(game.id, player.id, session).score, 2)
                self.assertEqual(main.reset_score(game.id, player.id, session).score, 0)
                main.increment_score(game.id, player.id, session)
                main.reset_scores(game.id, session)
                self.assertEqual(main.game_state(game.id, session)["players"][0].score, 0)
        finally:
            engine.dispose()

    def test_increment_compiles_as_atomic_postgres_update(self):
        statement = update(GamePlayer).where(GamePlayer.game_id == 1, GamePlayer.player_id == 2).values(score=GamePlayer.score + 1)
        sql = str(statement.compile(dialect=postgresql.dialect()))
        self.assertIn("score=(game_players.score +", sql)


if __name__ == "__main__":
    unittest.main()
