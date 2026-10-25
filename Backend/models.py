
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field
from pydantic import NaiveDatetime

def utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)

# Registered players
class Player(SQLModel, table=True):
    __tablename__ = "players"

    id: int | None = Field(default=None, primary_key=True)
    display_name: str
    avatar_url: str | None = None  # small JPEG data URL, served by GET /api/players/{id}/avatar


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
    out_until: NaiveDatetime | None = None


# Record of each successful hit
class Snipe(SQLModel, table=True):
    __tablename__ = "snipes"

    id: int | None = Field(default=None, primary_key=True)
    game_id: int = Field(foreign_key="games.id")
    shooter_id: int = Field(foreign_key="players.id")
    target_id: int = Field(foreign_key="players.id")
    created_at: NaiveDatetime = Field(default_factory=utc_now)
    request_id: str = Field(unique=True, index=True)


class PlayerSession(SQLModel, table=True):
    __tablename__ = "player_sessions"

    token_hash: str = Field(primary_key=True)
    player_id: int = Field(foreign_key="players.id", index=True)


class League(SQLModel, table=True):
    __tablename__ = "leagues"

    id: int | None = Field(default=None, primary_key=True)
    name: str
    join_code: str = Field(unique=True, index=True)
    cooldown_minutes: int = 60
    points_per_snipe: int = 10
    shooter_cooldown_minutes: int = 0
    bounty_bonus_points: int = 0
    king_bonus_points: int = 0
    round_duration_days: float = 7.0  # no longer used; bounty_hours sets the rotation
    bounty_hours: float = 24.0  # how long each member stays the bounty
    creator_id: int | None = Field(default=None, foreign_key="players.id")
    created_at: NaiveDatetime = Field(default_factory=utc_now)


class LeagueMember(SQLModel, table=True):
    __tablename__ = "league_members"

    league_id: int = Field(foreign_key="leagues.id", primary_key=True)
    player_id: int = Field(foreign_key="players.id", primary_key=True)
    score: int = 0
    out_until: NaiveDatetime | None = None
    cooldown_until: NaiveDatetime | None = None


class LeagueSnipe(SQLModel, table=True):
    __tablename__ = "league_snipes"

    id: int | None = Field(default=None, primary_key=True)
    league_id: int = Field(foreign_key="leagues.id", index=True)
    shooter_id: int = Field(foreign_key="players.id")
    target_id: int = Field(foreign_key="players.id")
    request_id: str | None = Field(default=None, index=True)
    photo_url: str | None = None
    crosshair: str | None = None  # the shooter's crosshair as "style:color", drawn over the photo
    created_at: NaiveDatetime = Field(default_factory=utc_now)


class Account(SQLModel, table=True):
    __tablename__ = "accounts"

    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    password_hash: str
    player_id: int = Field(foreign_key="players.id", unique=True, index=True)
    failed_logins: int = 0
    locked_until: NaiveDatetime | None = None


class AccountSession(SQLModel, table=True):
    __tablename__ = "account_sessions"

    token_hash: str = Field(primary_key=True)
    account_id: int = Field(foreign_key="accounts.id", index=True)
    expires_at: NaiveDatetime


class SnipeChallenge(SQLModel, table=True):
    __tablename__ = "snipe_challenges"

    snipe_id: int = Field(foreign_key="league_snipes.id", primary_key=True)
    challenger_id: int = Field(foreign_key="players.id")
    reason: str
    status: str = "pending"
    created_at: NaiveDatetime = Field(default_factory=utc_now)
    approved_by: int | None = Field(default=None, foreign_key="players.id")
    approved_at: NaiveDatetime | None = None


# Every shot fired, hit or not. Starts the shooter cooldown and fixes the moment
# target immunity is judged at, however long the shooter takes to pick a target.
class LeagueShot(SQLModel, table=True):
    __tablename__ = "league_shots"

    request_id: str = Field(primary_key=True)
    league_id: int = Field(foreign_key="leagues.id", index=True)
    shooter_id: int = Field(foreign_key="players.id", index=True)
    fired_at: NaiveDatetime = Field(default_factory=utc_now)
    snipe_id: int | None = Field(default=None, foreign_key="league_snipes.id")
