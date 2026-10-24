
from contextlib import asynccontextmanager
from typing import Annotated
from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import update
from sqlmodel import Session, SQLModel, select

from database import create_db_and_tables, get_session
from models import Player, Game, GamePlayer
from league_api import router
from auth import router as auth_router, current_player


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield


app = FastAPI(lifespan=lifespan)
app.include_router(auth_router)
app.include_router(router)
UI_DIR = Path(__file__).resolve().parent.parent / "Front-End" / "dist"
if (UI_DIR / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=UI_DIR / "assets"), name="assets")

SessionDep = Annotated[Session, Depends(get_session)]


@app.get("/")
def home():
    if not (UI_DIR / "index.html").is_file():
        raise HTTPException(503, "Build the UI with: cd Front-End && npm install && npm run build")
    return FileResponse(UI_DIR / "index.html", headers={"Cache-Control": "no-store"})


@app.post("/players", dependencies=[Depends(current_player)])
def create_player(name: str, session: SessionDep):
    name = name.strip()
    if not name or len(name) > 80:
        raise HTTPException(422, "Player name must contain 1–80 characters")
    player = Player(display_name=name)

    session.add(player)
    session.commit()
    session.refresh(player)

    return player


@app.get("/players", dependencies=[Depends(current_player)])
def get_players(session: SessionDep):
    return session.exec(select(Player)).all()


@app.post("/games", dependencies=[Depends(current_player)])
def create_game(session: SessionDep):
    game = Game(status="waiting", out_duration_seconds=30)

    session.add(game)
    session.commit()
    session.refresh(game)

    return game


@app.get("/games", dependencies=[Depends(current_player)])
def get_games(session: SessionDep):
    return session.exec(select(Game).order_by(Game.id.desc())).all()


@app.post("/games/{game_id}/players/{player_id}/increment", dependencies=[Depends(current_player)])
def increment_score(game_id: int, player_id: int, session: SessionDep):
    result = session.execute(
        update(GamePlayer)
        .where(GamePlayer.game_id == game_id, GamePlayer.player_id == player_id)
        .values(score=GamePlayer.score + 1)
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Player is not in this game")
    session.commit()
    return session.get(GamePlayer, (game_id, player_id))


@app.post("/games/{game_id}/players/{player_id}/reset", dependencies=[Depends(current_player)])
def reset_score(game_id: int, player_id: int, session: SessionDep):
    player = session.get(GamePlayer, (game_id, player_id))
    if not player:
        raise HTTPException(404, "Player is not in this game")
    player.score = 0
    session.add(player)
    session.commit()
    session.refresh(player)
    return player


@app.post("/games/{game_id}/reset", dependencies=[Depends(current_player)])
def reset_scores(game_id: int, session: SessionDep):
    if not session.get(Game, game_id):
        raise HTTPException(404, "Game not found")
    session.execute(update(GamePlayer).where(GamePlayer.game_id == game_id).values(score=0))
    session.commit()
    return {"message": "All scores reset"}


@app.post("/games/{game_id}/join", dependencies=[Depends(current_player)])
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


@app.get("/games/{game_id}/state", dependencies=[Depends(current_player)])
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


@app.get("/{path:path}")
def ui_route(path: str):
    if path.startswith(("api/", "players/", "games/")):
        raise HTTPException(404, "Not found")
    return home()
