"""Exercise the UI contract against an isolated database; no Supabase writes."""
import unittest
from unittest.mock import patch

with patch.dict('os.environ', {'DATABASE_URL': 'postgresql://postgres:test@localhost/postgres'}):
    import league_api as api

from fastapi import HTTPException
from sqlmodel import SQLModel, Session, create_engine


class LeagueApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        SQLModel.metadata.create_all(self.engine)
        self.session = Session(self.engine)

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def login(self, name):
        result = api.login(api.LoginInput(name=name), self.session)
        return result, api.current_player(self.session, 'Bearer ' + result['token'])

    def test_ui_lifecycle_and_persistence(self):
        login, alice = self.login('Alice')
        _, bob = self.login('Bob')
        league = api.create_league(api.LeagueInput(name='Friends', cooldownMinutes=30), self.session, alice)
        lid = int(league['id'])
        joined = api.join_league(api.JoinInput(joinCode=league['joinCode'].lower()), self.session, bob)
        self.assertEqual(len(joined['memberIds']), 2)
        api.join_league(api.JoinInput(joinCode=league['joinCode']), self.session, bob)
        self.assertEqual(len(api.leagues(self.session, bob)), 1)
        hit = api.submit_snipe(lid, api.SnipeInput(targetId=bob.id, photoUrl='data:image/png;base64,AA=='), self.session, alice)
        self.session.expire_all()
        board = api.leaderboard(lid, self.session, alice)
        self.assertEqual(board[0]['points'], 10)
        self.assertEqual(board[0]['snipes'], 1)
        self.assertEqual(board[1]['timesSniped'], 1)
        self.assertTrue(board[1]['cooldownUntil'].endswith('Z'))
        self.assertEqual(api.feed(lid, self.session, bob)[0], hit)
        with self.assertRaises(HTTPException) as error:
            api.submit_snipe(lid, api.SnipeInput(targetId=bob.id), self.session, alice)
        self.assertEqual(error.exception.status_code, 409)
        self.session.rollback()
        with Session(self.engine) as restored:
            self.assertEqual(api.current_player(restored, 'Bearer ' + login['token']).id, alice.id)

    def test_membership_auth_and_self_hit(self):
        _, alice = self.login('Alice')
        _, outsider = self.login('Outsider')
        league = api.create_league(api.LeagueInput(name='Friends', cooldownMinutes=30), self.session, alice)
        lid = int(league['id'])
        with self.assertRaises(HTTPException) as error:
            api.get_league(lid, self.session, outsider)
        self.assertEqual(error.exception.status_code, 403)
        with self.assertRaises(HTTPException):
            api.current_player(self.session, 'Bearer invalid')
        with self.assertRaises(HTTPException):
            api.submit_snipe(lid, api.SnipeInput(targetId=alice.id), self.session, alice)
        with self.assertRaises(HTTPException):
            api.login(api.LoginInput(name='   '), self.session)
