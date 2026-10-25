"""game.py rules in the league API: bounty rotation timing and reversal-safe timers."""
from datetime import datetime, timedelta
import unittest
from unittest.mock import patch

with patch.dict('os.environ', {'DATABASE_URL': 'postgresql://postgres:test@localhost/postgres'}):
    import league_api as api
    import auth

from fastapi import HTTPException
from sqlmodel import SQLModel, Session, create_engine

from models import League

START = datetime(2026, 10, 24, 12, 0, 0)


class GameRulesTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        SQLModel.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.players = [self.signup(name) for name in ('Alice', 'Bob', 'Carol', 'Dave')]

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def signup(self, name):
        result = auth.signup(auth.SignupInput(name=name, email=name.lower() + '@example.com',
                                              password='test-password-123'), self.session)
        return api.current_player(self.session, 'Bearer ' + result['token'])

    def league(self, members, **rules):
        settings = dict(name='Rules', cooldownMinutes=15, shooterCooldownMinutes=10,
                        pointsPerSnipe=1, bountyBonusPoints=0, kingBonusPoints=0) | rules
        created = api.create_league(api.LeagueInput(**settings), self.session, members[0])
        for player in members[1:]:
            api.join_league(api.JoinInput(joinCode=created['joinCode']), self.session, player)
        league = self.session.get(League, int(created['id']))
        league.created_at = START
        self.session.commit()
        return league.id

    def at(self, minutes, call, *args):
        with patch.object(api, 'utc_now', return_value=START + timedelta(minutes=minutes)):
            return call(*args)

    def snipe(self, lid, shooter, target, minutes):
        return self.at(minutes, api.submit_snipe, lid, api.SnipeInput(targetId=target.id), self.session, shooter)

    def board(self, lid, minutes):
        rows = self.at(minutes, api.leaderboard, lid, self.session, self.players[0])
        return {row['user']['displayName']: row for row in rows}

    def test_reversal_keeps_timers_from_later_valid_snipes(self):
        alice, bob, carol, dave = self.players
        lid = self.league(self.players)
        first = self.snipe(lid, alice, bob, 0)
        self.snipe(lid, carol, bob, 20)    # Bob's immunity from the first hit has expired
        self.snipe(lid, alice, carol, 30)  # Alice's shooter cooldown has expired
        api.challenge_snipe(lid, int(first['id']), api.ChallengeInput(reason='Missed'), self.session, bob)
        self.at(32, api.approve_challenge, lid, int(first['id']), self.session, dave)

        board = self.board(lid, 33)
        self.assertEqual(board['Bob']['cooldownUntil'], '2026-10-24T12:35:00Z')        # Carol's hit at :20
        self.assertEqual(board['Alice']['shooterCooldownUntil'], '2026-10-24T12:40:00Z')  # Alice's shot at :30
        with self.assertRaises(HTTPException) as error:
            self.snipe(lid, dave, bob, 33)
        self.assertEqual(error.exception.status_code, 409)

    def test_reversing_the_only_snipe_clears_both_timers(self):
        alice, bob, _, dave = self.players
        lid = self.league(self.players)
        hit = self.snipe(lid, alice, bob, 0)
        api.challenge_snipe(lid, int(hit['id']), api.ChallengeInput(reason='Missed'), self.session, bob)
        self.at(1, api.approve_challenge, lid, int(hit['id']), self.session, dave)
        board = self.board(lid, 2)
        self.assertIsNone(board['Bob']['cooldownUntil'])
        self.assertIsNone(board['Alice']['shooterCooldownUntil'])
        self.assertEqual(board['Alice']['points'], 0)

    def test_bounty_rotates_through_members_each_round(self):
        alice, bob = self.players[:2]
        lid = self.league([alice, bob], bountyHours=12)  # 12 hours each
        league = self.at(60, api.get_league, lid, self.session, alice)
        self.assertEqual(league['bountyPlayerId'], str(min(alice.id, bob.id)))
        self.assertEqual(league['bountyEndsAt'], '2026-10-25T00:00:00Z')
        later = self.at(13 * 60, api.get_league, lid, self.session, alice)
        self.assertEqual(later['bountyPlayerId'], str(max(alice.id, bob.id)))
        self.assertEqual(later['bountyEndsAt'], '2026-10-25T12:00:00Z')

    def test_bounty_and_king_bonuses_are_added_to_the_snipe(self):
        alice, bob, carol = self.players[:3]
        lid = self.league([alice, bob, carol], pointsPerSnipe=2, bountyBonusPoints=4, kingBonusPoints=3,
                          shooterCooldownMinutes=0, bountyHours=24)  # one day each
        bounty = self.at(0, api.get_league, lid, self.session, alice)['bountyPlayerId']
        target = next(p for p in (alice, bob, carol) if str(p.id) == bounty)
        shooter = next(p for p in (alice, bob, carol) if p is not target)
        hit = self.snipe(lid, shooter, target, 0)
        self.assertEqual(hit['points'], 2 + 4 + 3)  # base + bounty + king (everyone tied at 0)
        board = self.board(lid, 1)
        self.assertTrue(board[shooter.display_name]['isKing'])
        self.assertEqual(board[target.display_name]['points'], -1)
