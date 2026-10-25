"""Email/password accounts; credentials never appear in player responses."""
import base64
import binascii
import hashlib
import hmac
import secrets
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from database import get_session
from models import Account, AccountSession, Player, PlayerSession, utc_now

router = APIRouter(prefix='/api')
SessionDep = Annotated[Session, Depends(get_session)]
Authorization = Annotated[str | None, Header()]
ITERATIONS = 600_000
# The app shrinks photos to 256x256 JPEG before upload; this leaves plenty of headroom.
MAX_AVATAR_BYTES = 200_000
AVATAR_TYPES = ('image/jpeg', 'image/png', 'image/webp')


def hash_password(password: str, salt: str | None = None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), ITERATIONS)
    return f'pbkdf2_sha256${ITERATIONS}${salt}${digest.hex()}'


DUMMY_HASH = hash_password('unused-account-password')


def verify_password(password: str, encoded: str):
    algorithm, iterations, salt, expected = encoded.split('$')
    if algorithm != 'pbkdf2_sha256':
        return False
    actual = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), int(iterations)).hex()
    return hmac.compare_digest(actual, expected)


def token_hash(authorization):
    if not authorization or not authorization.startswith('Bearer '):
        return None
    token = authorization[7:]
    return hashlib.sha256(token.encode()).hexdigest() if token else None


def user_json(player):
    # The version changes with the photo, so browsers can cache it but never show a stale one.
    avatar = (f'/api/players/{player.id}/avatar?v={hashlib.sha256(player.avatar_url.encode()).hexdigest()[:10]}'
              if player.avatar_url else None)
    return dict(id=str(player.id), displayName=player.display_name, avatarColor='#6366f1', avatarUrl=avatar)


def decode_avatar(data_url):
    """Returns (media_type, bytes) for a base64 image data URL, or raises 422."""
    header, _, payload = data_url.partition(',')
    media_type = header.removeprefix('data:').removesuffix(';base64')
    if not header.startswith('data:') or not header.endswith(';base64') or media_type not in AVATAR_TYPES:
        raise HTTPException(422, 'The photo must be a JPEG, PNG or WebP image.')
    try:
        image = base64.b64decode(payload, validate=True)
    except binascii.Error:
        raise HTTPException(422, 'The photo could not be read.')
    if len(image) > MAX_AVATAR_BYTES:
        raise HTTPException(413, 'The photo is too large.')
    return media_type, image


def account_session(session, authorization):
    digest = token_hash(authorization)
    login = session.get(AccountSession, digest) if digest else None
    return login if login and login.expires_at > utc_now() else None


def current_player(session: SessionDep, authorization: Authorization = None):
    login = account_session(session, authorization)
    account = session.get(Account, login.account_id) if login else None
    player = session.get(Player, account.player_id) if account else None
    if not player:
        raise HTTPException(401, 'Please sign in again.')
    return player


class LoginInput(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128, repr=False)

    @field_validator('email')
    @classmethod
    def normalize_email(cls, value):
        value = value.strip().casefold()
        local, separator, domain = value.partition('@')
        if not separator or not local or '.' not in domain or domain.startswith('.') or domain.endswith('.') or '@' in domain or any(c.isspace() for c in value):
            raise ValueError('Enter a valid email address.')
        return value


class SignupInput(LoginInput):
    name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=4, max_length=128, repr=False)

    @field_validator('name')
    @classmethod
    def normalize_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError('Enter a display name.')
        return value


def new_session(account, session):
    token = secrets.token_urlsafe(32)
    session.add(AccountSession(token_hash=hashlib.sha256(token.encode()).hexdigest(),
                               account_id=account.id, expires_at=utc_now() + timedelta(days=30)))
    return token


@router.get('/auth/status')
def auth_status(session: SessionDep, authorization: Authorization = None):
    if account_session(session, authorization):
        return dict(authenticated=True, canUpgrade=False)
    digest = token_hash(authorization)
    legacy = session.get(PlayerSession, digest) if digest else None
    linked = session.exec(select(Account).where(Account.player_id == legacy.player_id)).first() if legacy else None
    return dict(authenticated=False, canUpgrade=bool(legacy and not linked))


@router.post('/signup')
def signup(body: SignupInput, session: SessionDep, authorization: Authorization = None):
    if session.exec(select(Account).where(Account.email == body.email)).first():
        raise HTTPException(409, 'An account with this email already exists. Sign in instead.')
    digest = token_hash(authorization)
    legacy = session.get(PlayerSession, digest) if digest else None
    player = None
    if legacy:
        # Lock the player so two signup requests cannot attach different accounts.
        player = session.exec(select(Player).where(Player.id == legacy.player_id).with_for_update()).first()
        if session.exec(select(Account).where(Account.player_id == legacy.player_id)).first():
            raise HTTPException(409, 'This player already has an account. Sign in instead.')
    if player is None:
        player = Player(display_name=body.name)
    else:
        player.display_name = body.name
    session.add(player)
    try:
        session.flush()
        account = Account(email=body.email, password_hash=hash_password(body.password), player_id=player.id)
        session.add(account)
        session.flush()
        token = new_session(account, session)
        if legacy:
            session.delete(legacy)
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, 'Account already exists. Sign in instead.') from None
    session.refresh(player)
    return dict(token=token, user=user_json(player))


@router.post('/session')
def login(body: LoginInput, session: SessionDep):
    account = session.exec(select(Account).where(Account.email == body.email).with_for_update()).first()
    now = utc_now()
    if account and account.locked_until and account.locked_until > now:
        raise HTTPException(429, 'Too many attempts. Try again in 15 minutes.')
    valid = verify_password(body.password, account.password_hash if account else DUMMY_HASH)
    if not account or not valid:
        if account:
            if account.locked_until and account.locked_until <= now:
                account.failed_logins = 0
                account.locked_until = None
            account.failed_logins += 1
            if account.failed_logins >= 5:
                account.locked_until = now + timedelta(minutes=15)
            session.add(account)
            session.commit()
        raise HTTPException(401, 'Email or password is incorrect.')
    account.failed_logins = 0
    account.locked_until = None
    session.add(account)
    token = new_session(account, session)
    session.commit()
    return dict(token=token, user=user_json(session.get(Player, account.player_id)))


@router.post('/logout')
def logout(session: SessionDep, authorization: Authorization = None):
    digest = token_hash(authorization)
    login = session.get(AccountSession, digest) if digest else None
    if login:
        session.delete(login)
        session.commit()
    return dict(message='Signed out')


class AvatarInput(BaseModel):
    # None removes the photo.
    avatarUrl: str | None = Field(default=None, max_length=MAX_AVATAR_BYTES * 2)


@router.post('/me/avatar')
def set_avatar(body: AvatarInput, session: SessionDep, player: Annotated[Player, Depends(current_player)]):
    if body.avatarUrl is not None:
        decode_avatar(body.avatarUrl)
    player.avatar_url = body.avatarUrl
    session.add(player)
    session.commit()
    session.refresh(player)
    return user_json(player)


# Public so <img> tags can load it without an auth header; it only ever shows a profile photo.
@router.get('/players/{player_id}/avatar')
def get_avatar(player_id: int, session: SessionDep):
    player = session.get(Player, player_id)
    if not player or not player.avatar_url:
        raise HTTPException(404, 'No profile photo.')
    media_type, image = decode_avatar(player.avatar_url)
    return Response(image, media_type=media_type, headers={'Cache-Control': 'public, max-age=31536000, immutable'})
