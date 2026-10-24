
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field

def utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)

# Registered players
class Player(SQLModel, table=True):
    __tablename__ = "players"

    id: int | None = Field(default=None, primary_key=True)
    display_name: str


# Individual game sessions
class Game(SQLModel, table=True):
    __tablename__ = "games"

    id: int | None = Field(default=None, primary_key=True)
    status: str = "waiting"
    out_duration_seconds: int = 30


# Player status within each game
class GamePlayer(SQLModel, table=True):
    __tablename__ = "game_players"

    game_id: int = Field(foreign_key="games.id", primary_key=True)
    player_id: int = Field(foreign_key="players.id", primary_key=True)

    score: int = 0
    out_until: datetime | None = None


# Record of each successful hit
class Snipe(SQLModel, table=True):
    __tablename__ = "snipes"

    id: int | None = Field(default=None, primary_key=True)
    game_id: int = Field(foreign_key="games.id")
    shooter_id: int = Field(foreign_key="players.id")
    target_id: int = Field(foreign_key="players.id")
    created_at: datetime = Field(default_factory=utc_now)
    request_id: str = Field(unique=True, index=True)
