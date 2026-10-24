"""Database-backed API matching the React UI's data contract."""
import secrets
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field as InputField
from sqlmodel import Session, select

from database import get_session
from auth import current_player, user_json
from models import League, LeagueMember, LeagueSnipe, Player, utc_now

router = APIRouter(prefix="/api")
SessionDep = Annotated[Session, Depends(get_session)]


PlayerDep = Annotated[Player, Depends(current_player)]


class LeagueInput(BaseModel):
    name: str = InputField(min_length=1, max_length=40)
    cooldownMinutes: int = InputField(ge=1, le=1440)


class JoinInput(BaseModel):
    joinCode: str = InputField(min_length=1, max_length=8)


class SnipeInput(BaseModel):
    targetId: int
    photoUrl: str | None = InputField(default=None, max_length=5_000_000)


def league_json(league, session):
    ids = session.exec(select(LeagueMember.player_id).where(LeagueMember.league_id == league.id)).all()
    return dict(id=str(league.id), name=league.name, joinCode=league.join_code,
                cooldownMinutes=league.cooldown_minutes, pointsPerSnipe=league.points_per_snipe,
                memberIds=[str(pid) for pid in ids])


def require_league(league_id, player, session):
    league = session.get(League, league_id)
    if not league:
        raise HTTPException(404, "League not found.")
    if not session.get(LeagueMember, (league_id, player.id)):
        raise HTTPException(403, "Join this league first.")
    return league


def snipe_json(hit):
    return dict(id=str(hit.id), leagueId=str(hit.league_id), sniperId=str(hit.shooter_id),
                targetId=str(hit.target_id), photoUrl=hit.photo_url,
                createdAt=hit.created_at.isoformat() + "Z")


@router.get("/me")
def me(player: PlayerDep):
    return user_json(player)


@router.get("/leagues")
def leagues(session: SessionDep, player: PlayerDep):
    rows = session.exec(select(League).join(LeagueMember).where(LeagueMember.player_id == player.id)).all()
    return [league_json(row, session) for row in rows]


@router.post("/leagues")
def create_league(body: LeagueInput, session: SessionDep, player: PlayerDep):
    if not body.name.strip():
        raise HTTPException(422, "Enter a league name.")
    league = League(name=body.name.strip(), cooldown_minutes=body.cooldownMinutes,
                    join_code=secrets.token_hex(4).upper())
    session.add(league)
    session.flush()
    session.add(LeagueMember(league_id=league.id, player_id=player.id))
    session.commit()
    session.refresh(league)
    return league_json(league, session)


@router.post("/leagues/join")
def join_league(body: JoinInput, session: SessionDep, player: PlayerDep):
    league = session.exec(select(League).where(League.join_code == body.joinCode.strip().upper())).first()
    if not league:
        raise HTTPException(404, "No league found with that code.")
    # Lock the league so concurrent joins for the same member remain idempotent.
    session.exec(select(League).where(League.id == league.id).with_for_update()).one()
    if not session.get(LeagueMember, (league.id, player.id)):
        session.add(LeagueMember(league_id=league.id, player_id=player.id))
    session.commit()
    return league_json(league, session)


@router.get("/leagues/{league_id}")
def get_league(league_id: int, session: SessionDep, player: PlayerDep):
    return league_json(require_league(league_id, player, session), session)


@router.get("/leagues/{league_id}/leaderboard")
def leaderboard(league_id: int, session: SessionDep, player: PlayerDep):
    require_league(league_id, player, session)
    hits = session.exec(select(LeagueSnipe).where(LeagueSnipe.league_id == league_id)).all()
    rows = session.exec(select(LeagueMember, Player).join(Player).where(LeagueMember.league_id == league_id)
                        .order_by(LeagueMember.score.desc(), Player.id)).all()
    now = utc_now()
    return [dict(user=user_json(user), points=member.score,
                 snipes=sum(h.shooter_id == user.id for h in hits),
                 timesSniped=sum(h.target_id == user.id for h in hits),
                 cooldownUntil=member.out_until.isoformat() + "Z"
                 if member.out_until and member.out_until > now else None) for member, user in rows]


@router.get("/leagues/{league_id}/feed")
def feed(league_id: int, session: SessionDep, player: PlayerDep):
    require_league(league_id, player, session)
    hits = session.exec(select(LeagueSnipe).where(LeagueSnipe.league_id == league_id)
                        .order_by(LeagueSnipe.created_at.desc(), LeagueSnipe.id.desc())).all()
    return [snipe_json(hit) for hit in hits]


@router.post("/leagues/{league_id}/snipes")
def submit_snipe(league_id: int, body: SnipeInput, session: SessionDep, player: PlayerDep):
    league = require_league(league_id, player, session)
    if body.targetId == player.id:
        raise HTTPException(422, "You cannot snipe yourself.")
    # Serialize league scoring and immunity checks in the same transaction.
    session.exec(select(League).where(League.id == league_id).with_for_update()).one()
    target = session.get(LeagueMember, (league_id, body.targetId))
    if not target:
        raise HTTPException(404, "That player is not in this league.")
    now = utc_now()
    if target.out_until and target.out_until > now:
        raise HTTPException(409, "That player is still on cooldown.")
    photo = body.photoUrl
    if photo and not photo.startswith(("data:image/", "https://")):
        raise HTTPException(422, "Photo must be an image data URL or HTTPS URL.")
    shooter = session.get(LeagueMember, (league_id, player.id))
    shooter.score += league.points_per_snipe
    target.out_until = now + timedelta(minutes=league.cooldown_minutes)
    hit = LeagueSnipe(league_id=league_id, shooter_id=player.id, target_id=body.targetId,
                      photo_url=photo, created_at=now)
    session.add_all([shooter, target, hit])
    session.commit()
    session.refresh(hit)
    return snipe_json(hit)
