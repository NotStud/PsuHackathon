"""Shot-time immunity, cooldown after every shot, creator-editable rules, and profile photos."""
import base64
from datetime import datetime, timedelta
import unittest
from unittest.mock import patch

with patch.dict('os.environ', {'DATABASE_URL': 'postgresql://postgres:test@localhost/postgres'}):
    import league_api as api
    import auth

from fastapi import HTTPException
from sqlmodel import SQLModel, Session, create_engine

from models import League

START = datetime(2026, 10, 25, 12, 0, 0)
JPEG = 'data:image/jpeg;base64,' + base64.b64encode(b'\xff\xd8\xff\xe0 tiny jpeg').decode()


class LeagueUpdatesTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        SQLModel.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.alice, self.bob, self.carol = (self.signup(n) for n in ('Alice', 'Bob', 'Carol'))
        created = self.at(0, api.create_league, api.LeagueInput(
            name='Updates', cooldownMinutes=30, shooterCooldownMinutes=5), self.session, self.alice)
        self.lid = int(created['id'])
        for player in (self.bob, self.carol):
            api.join_league(api.JoinInput(joinCode=created['joinCode']), self.session, player)
        self.session.get(League, self.lid).created_at = START
        self.session.commit()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def signup(self, name):
        result = auth.signup(auth.SignupInput(name=name, email=name.lower() + '@example.com',
                                              password='test-password-123'), self.session)
        return api.current_player(self.session, 'Bearer ' + result['token'])

    def at(self, minutes, call, *args):
        with patch.object(api, 'utc_now', return_value=START + timedelta(minutes=minutes)):
            return call(*args)

    def fire(self, shooter, request_id, minutes):
        return self.at(minutes, api.fire_shot, self.lid, api.ShotInput(requestId=request_id), self.session, shooter)

    def snipe(self, shooter, target, minutes, request_id=None):
        body = api.SnipeInput(targetId=target.id, requestId=request_id)
        return self.at(minutes, api.submit_snipe, self.lid, body, self.session, shooter)

    def board(self, minutes):
        rows = self.at(minutes, api.leaderboard, self.lid, self.session, self.alice)
        return {row['user']['displayName']: row for row in rows}

    def test_immunity_is_judged_when_the_shot_was_fired(self):
        self.fire(self.alice, 'alice-1', 0)
        self.snipe(self.carol, self.bob, 1)  # Bob becomes immune after Alice already fired
        hit = self.snipe(self.alice, self.bob, 3, 'alice-1')
        self.assertEqual(hit['createdAt'], '2026-10-25T12:00:00Z')  # counts from the moment of the shot
        self.assertEqual(self.board(4)['Bob']['cooldownUntil'], '2026-10-25T12:31:00Z')  # the later hit wins

    def test_target_immune_at_shot_time_stays_protected(self):
        self.snipe(self.carol, self.bob, 0)
        self.fire(self.alice, 'alice-1', 25)  # Bob is immune until :30
        with self.assertRaises(HTTPException) as error:
            self.snipe(self.alice, self.bob, 31, 'alice-1')  # expired by now, but not when fired
        self.assertEqual(error.exception.status_code, 409)

    def test_old_shots_expire(self):
        self.fire(self.alice, 'alice-1', 0)
        with self.assertRaises(HTTPException) as error:
            self.snipe(self.alice, self.bob, 11, 'alice-1')
        self.assertEqual(error.exception.status_code, 410)

    def test_every_shot_starts_the_shooter_cooldown(self):
        shot = self.fire(self.alice, 'miss', 0)  # a miss: never sent as a snipe
        self.assertEqual(shot['reloadUntil'], '2026-10-25T12:05:00Z')
        self.assertEqual(self.fire(self.alice, 'miss', 1), shot)  # retrying the same shot is safe
        with self.assertRaises(HTTPException) as error:
            self.fire(self.alice, 'second', 4)
        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(self.board(4)['Alice']['shooterCooldownUntil'], '2026-10-25T12:05:00Z')
        self.fire(self.alice, 'second', 5)
        # The shot's own snipe is still allowed while its cooldown runs.
        self.assertEqual(self.snipe(self.alice, self.bob, 6, 'second')['targetId'], str(self.bob.id))

    def test_creator_edits_rules(self):
        league = api.update_rules(self.lid, api.RulesInput(shooterCooldownMinutes=12, bountyHours=6),
                                  self.session, self.alice)
        self.assertEqual((league['shooterCooldownMinutes'], league['bountyHours']), (12, 6))
        self.assertEqual(league['cooldownMinutes'], 30)  # untouched
        self.assertEqual(league['creatorId'], str(self.alice.id))
        with self.assertRaises(HTTPException) as error:
            api.update_rules(self.lid, api.RulesInput(pointsPerSnipe=99), self.session, self.bob)
        self.assertEqual(error.exception.status_code, 403)

    def test_legacy_league_without_creator_uses_first_member(self):
        self.session.get(League, self.lid).creator_id = None
        self.session.commit()
        first = min((self.alice, self.bob, self.carol), key=lambda p: p.id)
        self.assertEqual(api.get_league(self.lid, self.session, self.bob)['creatorId'], str(first.id))

    def test_defaults(self):
        league = api.create_league(api.LeagueInput(name='Defaults'), self.session, self.alice)
        rules = {k: league[k] for k in ('cooldownMinutes', 'shooterCooldownMinutes', 'pointsPerSnipe',
                                        'bountyBonusPoints', 'kingBonusPoints', 'bountyHours')}
        self.assertEqual(rules, dict(cooldownMinutes=30, shooterCooldownMinutes=5, pointsPerSnipe=1,
                                     bountyBonusPoints=2, kingBonusPoints=2, bountyHours=24))

    def test_profile_photo(self):
        user = auth.set_avatar(auth.AvatarInput(avatarUrl=JPEG), self.session, self.alice)
        self.assertTrue(user['avatarUrl'].startswith(f'/api/players/{self.alice.id}/avatar?v='))
        response = auth.get_avatar(self.alice.id, self.session)
        self.assertEqual((response.media_type, response.body), ('image/jpeg', b'\xff\xd8\xff\xe0 tiny jpeg'))
        for bad in ('data:text/html;base64,PGI+', 'data:image/jpeg;base64,***',
                    'data:image/jpeg;base64,' + base64.b64encode(b'x' * (auth.MAX_AVATAR_BYTES + 1)).decode()):
            with self.subTest(bad=bad[:30]), self.assertRaises(HTTPException):
                auth.set_avatar(auth.AvatarInput(avatarUrl=bad), self.session, self.alice)
        self.assertIsNone(auth.set_avatar(auth.AvatarInput(avatarUrl=None), self.session, self.alice)['avatarUrl'])
        with self.assertRaises(HTTPException):
            auth.get_avatar(self.alice.id, self.session)
