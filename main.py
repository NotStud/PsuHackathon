
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, Depends, HTTPException
from sqlmodel import Session, SQLModel, select

from database import create_db_and_tables, get_session
from models import Player, Game, GamePlayer, Snipe


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield


app = FastAPI(lifespan=lifespan)

SessionDep = Annotated[Session, Depends(get_session)]


@app.get("/")
def home():
    return {"message": "Snipe Game API is running!"}


@app.post("/players")
def create_player(name: str, session: SessionDep):
    player = Player(display_name=name)

    session.add(player)
    session.commit()
    session.refresh(player)

    return player


@app.get("/players")
def get_players(session: SessionDep):
    return session.exec(select(Player)).all()


@app.post("/games")
def create_game(session: SessionDep):
    game = Game(status="waiting", out_duration_seconds=30)

    session.add(game)
    session.commit()
    session.refresh(game)

    return game


@app.post("/games/{game_id}/join")
def join_game(game_id: int, player_id: int, session: SessionDep):
    game = session.get(Game, game_id)
    player = session.get(Player, player_id)

    if not game or not player:
        raise HTTPException(404, "Game or player not found")

    if game.status != "waiting":
        raise HTTPException(400, "Game is not accepting players")

    existing = session.get(GamePlayer, (game_id, player_id))
    if existing:
        raise HTTPException(400, "Player already joined")

    game_player = GamePlayer(
        game_id=game_id,
        player_id=player_id
    )

    session.add(game_player)
    session.commit()
    session.refresh(game_player)

    return game_player


@app.get("/games/{game_id}/state")
def game_state(game_id: int, session: SessionDep):
    game = session.get(Game, game_id)

    if not game:
        raise HTTPException(404, "Game not found")

    players = session.exec(
        select(GamePlayer).where(GamePlayer.game_id == game_id)
    ).all()

    return {
        "game": game,
        "players": players
    }
