"""
Combined Database-backed API & Game Rules Engine matching the React UI's data contract.
Features adjustable league settings, bounty rotations, 1st-place and headshot bonus points, and
challenges settled by league vote.
"""

import secrets
from datetime import datetime, timedelta
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field as InputField
from sqlmodel import Session, not_, or_, select

router = APIRouter(prefix="/api")


from database import get_session
from auth import current_player, user_json
from models import Challenge, ChallengeVote, League, LeagueMember, LeagueShot, LeagueSnipe, Player, utc_now

SessionDep = Annotated[Session, Depends(get_session)]
PlayerDep = Annotated[Player, Depends(current_player)]


class LeagueInput(BaseModel):
    name: str = InputField(min_length=1, max_length=40)
    cooldownMinutes: int = InputField(default=30, ge=0, le=1440)          # Target immunity
    shooterCooldownMinutes: int = InputField(default=5, ge=0, le=1440)    # Wait after every shot fired
    pointsPerSnipe: int = InputField(default=1, ge=1, le=1000)            # Base points
    bountyBonusPoints: int = InputField(default=2, ge=0, le=1000)         # Bounty bonus
    kingBonusPoints: int = InputField(default=2, ge=0, le=1000)           # King/1st place bonus
    bountyHours: float = InputField(default=24, gt=0, le=720)             # How long each member is the bounty
    headshotBonusPoints: int = InputField(default=2, ge=0, le=1000)       # Headshot bonus
    challengeVotes: int = InputField(default=1, ge=1, le=5)               # Yes votes a challenge needs


class RulesInput(BaseModel):
    """Rule changes from the league creator; omitted fields stay as they are."""
    cooldownMinutes: Optional[int] = InputField(default=None, ge=0, le=1440)
    shooterCooldownMinutes: Optional[int] = InputField(default=None, ge=0, le=1440)
    pointsPerSnipe: Optional[int] = InputField(default=None, ge=1, le=1000)
    bountyBonusPoints: Optional[int] = InputField(default=None, ge=0, le=1000)
    kingBonusPoints: Optional[int] = InputField(default=None, ge=0, le=1000)
    bountyHours: Optional[float] = InputField(default=None, gt=0, le=720)
    headshotBonusPoints: Optional[int] = InputField(default=None, ge=0, le=1000)
    challengeVotes: Optional[int] = InputField(default=None, ge=1, le=5)


# How long after firing a shot it can still be sent as a snipe.
SHOT_SUBMIT_WINDOW = timedelta(minutes=10)

RULE_COLUMNS = dict(cooldownMinutes="cooldown_minutes", shooterCooldownMinutes="shooter_cooldown_minutes",
                    pointsPerSnipe="points_per_snipe", bountyBonusPoints="bounty_bonus_points",
                    kingBonusPoints="king_bonus_points", bountyHours="bounty_hours",
                    headshotBonusPoints="headshot_bonus_points", challengeVotes="challenge_votes")


class ShotInput(BaseModel):
    requestId: str = InputField(min_length=1, max_length=100)


class JoinInput(BaseModel):
    joinCode: str = InputField(min_length=1, max_length=8)


class SnipeInput(BaseModel):
    targetId: int
    photoUrl: Optional[str] = InputField(default=None, max_length=5_000_000)
    requestId: Optional[str] = InputField(default=None, max_length=100)
    crosshair: Optional[str] = InputField(default=None, max_length=40, pattern=r"^[a-z0-9-]+:[a-z0-9-]+$")
    headshot: bool = False  # the app saw the crosshair on the target's head
    # A shot the app called a miss, sent with the shooter's reason it was really a hit.
    # It counts for nothing until a yes vote on that challenge passes.
    missed: bool = False
    # The shooter says it was a headshot the app didn't see: with a miss, a headshot hit; with
    # a hit, a headshot. Either way the league votes on it, and the bonus comes with a yes.
    claimHeadshot: bool = False
    challengeReason: Optional[str] = InputField(default=None, max_length=500)


class ChallengeInput(BaseModel):
    reason: str = InputField(min_length=1, max_length=500)
    # The target asks for a reversal; the shooter claims a headshot. Worked out from who
    # is challenging when left out.
    kind: Optional[Literal["reverse", "headshot"]] = None


# =============================================================================
# GAME ENGINE LOGIC (Bounty, King, and Dynamic Score Recalculation)
# =============================================================================
def get_bounty_player_id(league: League, at_time: datetime, session: Session) -> Optional[int]:
    """Each member is the bounty for `bounty_hours`, in player-ID order, starting when the league was made."""
    member_ids = session.exec(
        select(LeagueMember.player_id)
        .where(LeagueMember.league_id == league.id)
        .order_by(LeagueMember.player_id)
    ).all()
    if not member_ids:
        return None
    slot = league.bounty_hours * 3600
    if slot <= 0:
        return member_ids[0]
    elapsed = max(0.0, (at_time - league.created_at).total_seconds())
    return member_ids[int(elapsed // slot) % len(member_ids)]


def bounty_ends_at(league: League, at_time: datetime) -> Optional[datetime]:
    """When the current bounty's turn ends and the next member becomes the bounty."""
    slot = league.bounty_hours * 3600
    if slot <= 0:
        return None
    elapsed = max(0.0, (at_time - league.created_at).total_seconds())
    return league.created_at + timedelta(seconds=(int(elapsed // slot) + 1) * slot)


def league_owner_id(league: League, session: Session) -> Optional[int]:
    """The creator edits the rules. Leagues made before creators were recorded fall back to
    their earliest member (lowest player ID)."""
    if league.creator_id:
        return league.creator_id
    return session.exec(select(LeagueMember.player_id).where(LeagueMember.league_id == league.id)
                        .order_by(LeagueMember.player_id).limit(1)).first()


def reversed_ids():
    """Snipes whose reversal challenge passed: they no longer count."""
    return select(Challenge.snipe_id).where(Challenge.kind == "reverse", Challenge.status == "approved")


def upheld_miss_ids():
    """Missed shots the league voted to count as hits."""
    return select(Challenge.snipe_id).where(Challenge.kind == "hit", Challenge.status == "approved")


def valid_snipes(league: League):
    """Snipes that count: not reversed, and not a miss unless the league voted it a hit."""
    return select(LeagueSnipe).where(LeagueSnipe.league_id == league.id, LeagueSnipe.id.not_in(reversed_ids()),
                                     or_(not_(LeagueSnipe.missed), LeagueSnipe.id.in_(upheld_miss_ids())))


def immune_at(league: League, target_id: int, at_time: datetime, session: Session) -> bool:
    """Whether the target was protected at `at_time`, judged only from snipes made before then."""
    last_hit = session.exec(valid_snipes(league).where(LeagueSnipe.target_id == target_id,
                                                       LeagueSnipe.created_at <= at_time)
                            .order_by(LeagueSnipe.created_at.desc()).limit(1)).first()
    return bool(last_hit) and last_hit.created_at + timedelta(minutes=league.cooldown_minutes) > at_time


def refresh_timers(league: League, player_ids, session: Session):
    """Rebuild immunity and shooter cooldowns from the snipes that still count (as game.py does),
    so reversing one snipe never clears a timer that a later valid snipe set. Every shot fired
    counts toward the shooter cooldown, even one whose snipe was reversed."""
    valid = valid_snipes(league)

    def latest(query):
        return session.exec(query.order_by(LeagueSnipe.created_at.desc()).limit(1)).first()

    for player_id in player_ids:
        member = session.get(LeagueMember, (league.id, player_id))
        if not member:
            continue
        last_hit = latest(valid.where(LeagueSnipe.target_id == player_id))
        last_snipe = latest(valid.where(LeagueSnipe.shooter_id == player_id))
        last_fired = session.exec(select(LeagueShot.fired_at).where(
            LeagueShot.league_id == league.id, LeagueShot.shooter_id == player_id)
            .order_by(LeagueShot.fired_at.desc()).limit(1)).first()
        shot_times = [t for t in (last_snipe.created_at if last_snipe else None, last_fired) if t]
        member.out_until = last_hit.created_at + timedelta(minutes=league.cooldown_minutes) if last_hit else None
        member.cooldown_until = (max(shot_times) + timedelta(minutes=league.shooter_cooldown_minutes)
                                 if shot_times else None)
        session.add(member)


def compute_league_scores_and_points(league: League, session: Session):
    """
    Chronologically evaluates all valid snipes to calculate individual member scores
    and award bonus points (bounty + king). Reversals dynamically update points.
    """
    members = session.exec(
        select(LeagueMember).where(LeagueMember.league_id == league.id)
    ).all()
    scores = {m.player_id: 0 for m in members}

    snipes = session.exec(
        select(LeagueSnipe)
        .where(LeagueSnipe.league_id == league.id)
        .order_by(LeagueSnipe.created_at.asc(), LeagueSnipe.id.asc())
    ).all()

    if not snipes:
        return {m.player_id: m.score for m in members}, {}

    # Challenges that passed: reversed snipes count for nothing, upheld headshot claims get the bonus.
    passed = session.exec(
        select(Challenge.snipe_id, Challenge.kind, Challenge.headshot)
        .join(LeagueSnipe)
        .where(LeagueSnipe.league_id == league.id, Challenge.status == "approved")
    ).all()
    reversed_snipe_ids = {snipe_id for snipe_id, kind, _ in passed if kind == "reverse"}
    headshot_ids = {snipe_id for snipe_id, kind, headshot in passed if kind == "headshot" or headshot}
    upheld_miss_ids = {snipe_id for snipe_id, kind, _ in passed if kind == "hit"}

    snipe_points = {}
    for hit in snipes:
        if hit.id in reversed_snipe_ids or (hit.missed and hit.id not in upheld_miss_ids):
            snipe_points[hit.id] = 0
            continue

        shooter_id = hit.shooter_id
        target_id = hit.target_id

        if shooter_id not in scores:
            scores[shooter_id] = 0
        if target_id not in scores:
            scores[target_id] = 0

        # Calculate bonus triggers
        bounty_id = get_bounty_player_id(league, hit.created_at, session)
        is_bounty = (target_id == bounty_id)

        max_score = max(scores.values()) if scores else 0
        is_king = (scores[target_id] == max_score)

        # Compute point total for this hit
        pts = league.points_per_snipe
        if is_bounty:
            pts += league.bounty_bonus_points
        if is_king:
            pts += league.king_bonus_points
        if hit.headshot or hit.id in headshot_ids:
            pts += league.headshot_bonus_points

        snipe_points[hit.id] = pts
        scores[shooter_id] += pts
        scores[target_id] -= 1  # Penalty for getting sniped

    # Persist updated scores
    for member in members:
        member.score = scores.get(member.player_id, 0)
        session.add(member)
    session.flush()

    return scores, snipe_points


# =============================================================================
# JSON SERIALIZERS MATCHING REACT UI CONTRACT
# =============================================================================
def league_json(league: League, session: Session):
    ids = session.exec(
        select(LeagueMember.player_id).where(LeagueMember.league_id == league.id)
    ).all()
    now = utc_now()
    bounty_id = get_bounty_player_id(league, now, session)
    bounty_until = bounty_ends_at(league, now)
    owner_id = league_owner_id(league, session)

    return dict(
        id=str(league.id),
        name=league.name,
        joinCode=league.join_code,
        cooldownMinutes=league.cooldown_minutes,
        shooterCooldownMinutes=league.shooter_cooldown_minutes,
        pointsPerSnipe=league.points_per_snipe,
        bountyBonusPoints=league.bounty_bonus_points,
        kingBonusPoints=league.king_bonus_points,
        bountyHours=league.bounty_hours,
        headshotBonusPoints=league.headshot_bonus_points,
        challengeVotes=league.challenge_votes,
        creatorId=str(owner_id) if owner_id else None,
        bountyPlayerId=str(bounty_id) if bounty_id else None,
        bountyEndsAt=bounty_until.isoformat() + "Z" if bounty_until else None,
        memberIds=[str(pid) for pid in ids]
    )


def challenge_voters(hit: LeagueSnipe, session: Session) -> list[int]:
    """Everyone in the league except the shooter and the target votes on its challenges."""
    return [pid for pid in session.exec(select(LeagueMember.player_id).where(LeagueMember.league_id == hit.league_id))
            if pid not in (hit.shooter_id, hit.target_id)]


def votes_needed(league: League, voters: int) -> int:
    """The league's yes-vote count, capped at how many can vote so small leagues can still pass one."""
    return max(1, min(league.challenge_votes, voters))


def challenge_json(challenge: Challenge, needed: int, session: Session, viewer_id: Optional[int]):
    # Only yes votes count (votes are yes-only now; older no votes are ignored).
    yes = session.exec(select(ChallengeVote.voter_id).where(ChallengeVote.challenge_id == challenge.id,
                                                             ChallengeVote.approve)
                       .order_by(ChallengeVote.created_at)).all()
    return dict(
        id=str(challenge.id),
        kind=challenge.kind,
        challengerId=str(challenge.challenger_id),
        reason=challenge.reason,
        status=challenge.status,
        yesVotes=len(yes),
        voterIds=[str(voter) for voter in yes],
        votesNeeded=needed,
        voted=viewer_id in yes,
        claimsHeadshot=challenge.kind == "headshot" or challenge.headshot,
        createdAt=challenge.created_at.isoformat() + "Z",
    )


def snipe_json(hit: LeagueSnipe, session: Session, points: int = 0, viewer_id: Optional[int] = None):
    challenges = session.exec(select(Challenge).where(Challenge.snipe_id == hit.id).order_by(Challenge.id)).all()
    needed = votes_needed(session.get(League, hit.league_id), len(challenge_voters(hit, session))) if challenges else 0
    passed = {c.kind for c in challenges if c.status == "approved"}
    headshot = hit.headshot or any(c.status == "approved" and (c.kind == "headshot" or c.headshot) for c in challenges)
    status = ("reversed" if "reverse" in passed
              else "challenged" if any(c.status == "pending" for c in challenges)
              else "missed" if hit.missed and "hit" not in passed else "valid")

    return dict(
        id=str(hit.id),
        leagueId=str(hit.league_id),
        sniperId=str(hit.shooter_id),
        targetId=str(hit.target_id),
        photoUrl=hit.photo_url,
        crosshair=hit.crosshair,
        points=points,
        status=status,
        headshot=headshot,
        missed=hit.missed,
        challenges=[challenge_json(c, needed, session, viewer_id) for c in challenges],
        createdAt=hit.created_at.isoformat() + "Z" if hit.created_at else None
    )


def require_league(league_id: int, player: Player, session: Session) -> League:
    league = session.get(League, league_id)
    if not league:
        raise HTTPException(404, "League not found.")
    if not session.get(LeagueMember, (league_id, player.id)):
        raise HTTPException(403, "Join this league first.")
    return league


# =============================================================================
# API ENDPOINTS
# =============================================================================
@router.get("/me")
def me(player: PlayerDep):
    return user_json(player)


@router.get("/leagues")
def leagues(session: SessionDep, player: PlayerDep):
    rows = session.exec(
        select(League).join(LeagueMember).where(LeagueMember.player_id == player.id)
    ).all()
    return [league_json(row, session) for row in rows]


@router.post("/leagues")
def create_league(body: LeagueInput, session: SessionDep, player: PlayerDep):
    if not body.name.strip():
        raise HTTPException(422, "Enter a league name.")

    league = League(
        name=body.name.strip(),
        cooldown_minutes=body.cooldownMinutes,
        shooter_cooldown_minutes=body.shooterCooldownMinutes,
        points_per_snipe=body.pointsPerSnipe,
        bounty_bonus_points=body.bountyBonusPoints,
        king_bonus_points=body.kingBonusPoints,
        bounty_hours=body.bountyHours,
        headshot_bonus_points=body.headshotBonusPoints,
        challenge_votes=body.challengeVotes,
        creator_id=player.id,
        join_code=secrets.token_hex(4).upper()
    )
    session.add(league)
    session.flush()
    session.add(LeagueMember(league_id=league.id, player_id=player.id))
    session.commit()
    session.refresh(league)
    return league_json(league, session)


@router.post("/leagues/join")
def join_league(body: JoinInput, session: SessionDep, player: PlayerDep):
    league = session.exec(
        select(League).where(League.join_code == body.joinCode.strip().upper())
    ).first()
    if not league:
        raise HTTPException(404, "No league found with that code.")

    session.exec(select(League).where(League.id == league.id).with_for_update()).one()
    if not session.get(LeagueMember, (league.id, player.id)):
        session.add(LeagueMember(league_id=league.id, player_id=player.id))
    session.commit()
    return league_json(league, session)


@router.get("/leagues/{league_id}")
def get_league(league_id: int, session: SessionDep, player: PlayerDep):
    return league_json(require_league(league_id, player, session), session)


@router.post("/leagues/{league_id}/rules")
def update_rules(league_id: int, body: RulesInput, session: SessionDep, player: PlayerDep):
    league = require_league(league_id, player, session)
    if league_owner_id(league, session) != player.id:
        raise HTTPException(403, "Only the league creator can change the rules.")
    for field, column in RULE_COLUMNS.items():
        value = getattr(body, field)
        if value is not None:
            setattr(league, column, value)
    session.add(league)
    session.commit()
    session.refresh(league)
    return league_json(league, session)


@router.post("/leagues/{league_id}/shots")
def fire_shot(league_id: int, body: ShotInput, session: SessionDep, player: PlayerDep):
    """Called the moment a shot is fired, hit or miss. Starts the shooter cooldown and fixes
    the time target immunity is judged at when the snipe is submitted."""
    league = require_league(league_id, player, session)
    session.exec(select(League).where(League.id == league_id).with_for_update()).one()
    shot = session.get(LeagueShot, body.requestId)
    if shot:
        if shot.shooter_id != player.id or shot.league_id != league_id:
            raise HTTPException(409, "That shot ID is already taken.")
    else:
        now = utc_now()
        shooter = session.get(LeagueMember, (league_id, player.id))
        if shooter.cooldown_until and shooter.cooldown_until > now:
            raise HTTPException(409, "Your shooter cooldown is still active.")
        shot = LeagueShot(request_id=body.requestId, league_id=league_id, shooter_id=player.id, fired_at=now)
        shooter.cooldown_until = now + timedelta(minutes=league.shooter_cooldown_minutes)
        session.add_all([shot, shooter])
        session.commit()
        session.refresh(shot)
    reload_until = shot.fired_at + timedelta(minutes=league.shooter_cooldown_minutes)
    return dict(requestId=shot.request_id, firedAt=shot.fired_at.isoformat() + "Z",
                reloadUntil=reload_until.isoformat() + "Z")


@router.get("/leagues/{league_id}/leaderboard")
def leaderboard(league_id: int, session: SessionDep, player: PlayerDep):
    league = require_league(league_id, player, session)
    scores, _ = compute_league_scores_and_points(league, session)

    valid_hits = session.exec(valid_snipes(league)).all()

    rows = session.exec(
        select(LeagueMember, Player)
        .join(Player)
        .where(LeagueMember.league_id == league_id)
        .order_by(LeagueMember.score.desc(), Player.id)
    ).all()

    now = utc_now()
    bounty_id = get_bounty_player_id(league, now, session)
    max_score = max(scores.values()) if scores else 0

    return [
        dict(
            user=user_json(user),
            points=member.score,
            snipes=sum(h.shooter_id == user.id for h in valid_hits),
            timesSniped=sum(h.target_id == user.id for h in valid_hits),
            cooldownUntil=member.out_until.isoformat() + "Z"
            if member.out_until and member.out_until > now else None,
            shooterCooldownUntil=member.cooldown_until.isoformat() + "Z"
            if member.cooldown_until and member.cooldown_until > now else None,
            isBounty=(user.id == bounty_id),
            isKing=(member.score == max_score and member.score > 0)
        )
        for member, user in rows
    ]


@router.get("/leagues/{league_id}/feed")
def feed(league_id: int, session: SessionDep, player: PlayerDep):
    league = require_league(league_id, player, session)
    scores, hit_pts = compute_league_scores_and_points(league, session)

    hits = session.exec(
        select(LeagueSnipe)
        .where(LeagueSnipe.league_id == league_id)
        .order_by(LeagueSnipe.created_at.desc(), LeagueSnipe.id.desc())
        .limit(100)
    ).all()

    return [snipe_json(hit, session, hit_pts.get(hit.id, 0), player.id) for hit in hits]


@router.post("/leagues/{league_id}/snipes")
def submit_snipe(league_id: int, body: SnipeInput, session: SessionDep, player: PlayerDep):
    league = require_league(league_id, player, session)
    if body.targetId == player.id:
        raise HTTPException(422, "You cannot snipe yourself.")

    session.exec(select(League).where(League.id == league_id).with_for_update()).one()

    # Idempotency check via requestId
    if body.requestId:
        existing = session.exec(
            select(LeagueSnipe).where(
                LeagueSnipe.league_id == league_id,
                LeagueSnipe.shooter_id == player.id,
                LeagueSnipe.request_id == body.requestId
            )
        ).first()
        if existing:
            if existing.target_id != body.targetId:
                raise HTTPException(409, "Request ID was already used for another target.")
            scores, hit_pts = compute_league_scores_and_points(league, session)
            return snipe_json(existing, session, hit_pts.get(existing.id, 0), player.id)

    shooter = session.get(LeagueMember, (league_id, player.id))
    target = session.get(LeagueMember, (league_id, body.targetId))

    if not target:
        raise HTTPException(404, "That player is not in this league.")

    now = utc_now()
    fired = session.get(LeagueShot, body.requestId) if body.requestId else None
    if fired and (fired.shooter_id != player.id or fired.league_id != league_id or fired.snipe_id):
        fired = None

    if fired:
        # A shot fired through POST /shots: its cooldown already started, and immunity is
        # judged at the moment it was fired (the timers pause while the target is picked).
        if now - fired.fired_at > SHOT_SUBMIT_WINDOW:
            raise HTTPException(410, "That shot is too old to send. Take a new one.")
        if immune_at(league, body.targetId, fired.fired_at, session):
            raise HTTPException(409, "That player was immune when you fired.")
    else:
        if shooter.cooldown_until and shooter.cooldown_until > now:
            raise HTTPException(409, "Your shooter cooldown is still active.")
        if target.out_until and target.out_until > now:
            raise HTTPException(409, "That player is currently immune to snipes.")

    photo = body.photoUrl
    if photo and not photo.startswith(("data:image/", "https://")):
        raise HTTPException(422, "Photo must be an image data URL or HTTPS URL.")
    reason = (body.challengeReason or "").strip()
    if body.missed and not reason:
        raise HTTPException(422, "Say why this miss should count as a hit.")
    claim_headshot = body.claimHeadshot and not body.headshot  # the app already saw a headshot
    if claim_headshot and not reason:
        raise HTTPException(422, "Say why it was a headshot.")

    # Apply timers. The snipe counts from the moment it was fired. A miss doesn't make the
    # target immune unless the league votes it a hit.
    hit_at = fired.fired_at if fired else now
    if not fired:
        shooter.cooldown_until = now + timedelta(minutes=league.shooter_cooldown_minutes)
    immune_until = hit_at + timedelta(minutes=league.cooldown_minutes)
    if not body.missed and (not target.out_until or target.out_until < immune_until):
        target.out_until = immune_until

    hit = LeagueSnipe(
        league_id=league_id,
        shooter_id=player.id,
        target_id=body.targetId,
        photo_url=photo,
        crosshair=body.crosshair,
        headshot=body.headshot and not body.missed,
        missed=body.missed,
        request_id=body.requestId,
        created_at=hit_at
    )
    session.add_all([shooter, target, hit])
    session.flush()
    if fired:
        fired.snipe_id = hit.id
        session.add(fired)
    if body.missed:
        session.add(Challenge(snipe_id=hit.id, kind="hit", challenger_id=player.id, reason=reason,
                              headshot=claim_headshot))
        session.flush()
    elif claim_headshot:
        session.add(Challenge(snipe_id=hit.id, kind="headshot", challenger_id=player.id, reason=reason))
        session.flush()

    # Recalculate scores and hit values
    scores, hit_pts = compute_league_scores_and_points(league, session)
    session.commit()

    return snipe_json(hit, session, hit_pts.get(hit.id, 0), player.id)


@router.post("/leagues/{league_id}/snipes/{snipe_id}/challenge")
def challenge_snipe(league_id: int, snipe_id: int, body: ChallengeInput, session: SessionDep, player: PlayerDep):
    """The target challenges a snipe to have it reversed; the shooter challenges their own
    snipe to have it count as a headshot. The rest of the league then votes on it. (A miss's
    "hit" challenge is sent with the miss itself.)"""
    league = require_league(league_id, player, session)
    hit = session.get(LeagueSnipe, snipe_id)

    if not hit or hit.league_id != league_id:
        raise HTTPException(404, "Snipe not found in this league.")
    kind = {hit.target_id: "reverse", hit.shooter_id: "headshot"}.get(player.id)
    if not kind:
        raise HTTPException(403, "Only the shooter or the target can challenge a snipe.")
    if body.kind and body.kind != kind:
        raise HTTPException(403, "Only the target can ask for a reversal, and only the shooter can claim a headshot.")

    session.exec(select(League).where(League.id == league_id).with_for_update()).one()
    challenges = session.exec(select(Challenge).where(Challenge.snipe_id == snipe_id)).all()
    existing = next((c for c in challenges if c.kind == kind), None)
    if existing:
        if existing.status == "rejected":
            raise HTTPException(409, "This challenge was already voted down.")
        _, hit_pts = compute_league_scores_and_points(league, session)
        return snipe_json(hit, session, hit_pts.get(hit.id, 0), player.id)
    if any(c.kind == "reverse" and c.status == "approved" for c in challenges):
        raise HTTPException(409, "This snipe was already reversed.")
    if hit.missed and not any(c.kind == "hit" and c.status == "approved" for c in challenges):
        raise HTTPException(409, "This shot doesn't count as a hit yet.")
    if kind == "headshot" and (hit.headshot or any(c.kind == "hit" and c.headshot for c in challenges)):
        raise HTTPException(409, "This snipe already counts as a headshot, or claims one.")

    session.add(Challenge(snipe_id=snipe_id, kind=kind, challenger_id=player.id, reason=body.reason.strip()))
    session.flush()
    _, hit_pts = compute_league_scores_and_points(league, session)
    session.commit()
    return snipe_json(hit, session, hit_pts.get(hit.id, 0), player.id)


@router.post("/leagues/{league_id}/challenges/{challenge_id}/vote")
def vote_on_challenge(league_id: int, challenge_id: int, session: SessionDep, player: PlayerDep):
    """A yes vote on a challenge, from anyone but the shooter and the target. There is no no
    vote: without enough yes votes the challenge stays open and the snipe stands. At the
    league's yes-vote count it passes, and scores (and, for a reversal, timers) are worked
    out again."""
    league = require_league(league_id, player, session)
    session.exec(select(League).where(League.id == league_id).with_for_update()).one()
    challenge = session.get(Challenge, challenge_id)
    hit = session.get(LeagueSnipe, challenge.snipe_id) if challenge else None

    if not hit or hit.league_id != league_id:
        raise HTTPException(404, "Challenge not found in this league.")
    if player.id in (hit.shooter_id, hit.target_id):
        raise HTTPException(403, "The shooter and the target can't vote on their own snipe.")
    if challenge.status != "pending":
        raise HTTPException(409, "Voting on this challenge has closed.")

    vote = session.get(ChallengeVote, (challenge.id, player.id))
    if vote:
        vote.approve = True  # voting again changes nothing (or turns an older no vote into a yes)
    else:
        vote = ChallengeVote(challenge_id=challenge.id, voter_id=player.id, approve=True)
    session.add(vote)
    session.flush()

    needed = votes_needed(league, len(challenge_voters(hit, session)))
    yes = len(session.exec(select(ChallengeVote).where(ChallengeVote.challenge_id == challenge.id,
                                                       ChallengeVote.approve)).all())
    if yes >= needed:
        challenge.status = "approved"
        challenge.resolved_at = utc_now()
        session.add(challenge)
        session.flush()
    if challenge.status == "approved" and challenge.kind in ("reverse", "hit"):
        # Timers fall back to whatever the remaining valid snipes say.
        refresh_timers(league, (hit.target_id, hit.shooter_id), session)
        session.flush()

    _, hit_pts = compute_league_scores_and_points(league, session)
    session.commit()
    return snipe_json(hit, session, hit_pts.get(hit.id, 0), player.id)
