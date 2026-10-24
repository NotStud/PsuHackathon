"""HTTP integration checks against isolated SQLite; never write to Supabase."""
import os
import unittest
from unittest.mock import patch

with patch.dict(os.environ, {'DATABASE_URL': 'postgresql://postgres:test@localhost/postgres'}):
    import main

from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine
from database import get_session


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        SQLModel.metadata.create_all(self.engine)

        def sessions():
            with Session(self.engine) as session:
                yield session

        main.app.dependency_overrides[get_session] = sessions
        self.startup = patch.object(main, 'create_db_and_tables')
        self.startup.start()
        self.client = TestClient(main.app)
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        main.app.dependency_overrides.clear()
        self.startup.stop()
        self.engine.dispose()

    def test_ui_and_api_lifecycle(self):
        home = self.client.get('/')
        self.assertEqual(home.status_code, 200)
        self.assertEqual(home.headers["cache-control"], "no-store")
        self.assertIn('<div id="root">', home.text)
        import re
        assets = re.findall(r'(?:src|href)="(/assets/[^"]+)"', home.text)
        self.assertTrue(assets)
        for asset in assets:
            self.assertEqual(self.client.get(asset).status_code, 200)
        self.assertEqual(self.client.get('/leagues/1').status_code, 200)
        self.assertEqual(self.client.get('/api/me').status_code, 401)
        alice = self.client.post('/api/signup', json={'name': 'Alice', 'email': 'alice@example.com', 'password': 'test-password-123'}).json()
        bob = self.client.post('/api/signup', json={'name': 'Bob', 'email': 'bob@example.com', 'password': 'test-password-123'}).json()
        auth = {'Authorization': 'Bearer ' + alice['token']}
        bob_auth = {'Authorization': 'Bearer ' + bob['token']}
        self.assertEqual(self.client.get('/api/me', headers=auth).json(), alice['user'])
        result = self.client.post('/api/leagues', json={'name': 'HTTP League', 'cooldownMinutes': 15, 'pointsPerSnipe': 10, 'bountyBonusPoints': 0, 'kingBonusPoints': 0, 'shooterCooldownMinutes': 0}, headers=auth)
        self.assertEqual(result.status_code, 200, result.text)
        league = result.json()
        self.assertEqual(league['cooldownMinutes'], 15)
        lid = league['id']
        joined = self.client.post('/api/leagues/join', json={'joinCode': league['joinCode']}, headers=bob_auth)
        self.assertEqual(joined.status_code, 200, joined.text)
        self.assertEqual(len(joined.json()['memberIds']), 2)
        self.assertEqual(self.client.get('/api/leagues', headers=auth).json()[0]['id'], lid)
        self.assertEqual(self.client.get(f'/api/leagues/{lid}', headers=auth).status_code, 200)
        shot = {'targetId': int(bob['user']['id']), 'photoUrl': 'data:image/jpeg;base64,AA=='}
        hit = self.client.post(f'/api/leagues/{lid}/snipes', json=shot, headers=auth)
        self.assertEqual(hit.status_code, 200, hit.text)
        self.assertEqual(hit.json()['targetId'], bob['user']['id'])
        board = self.client.get(f'/api/leagues/{lid}/leaderboard', headers=auth).json()
        self.assertEqual(board[0]['points'], 10)
        self.assertEqual(board[1]['timesSniped'], 1)
        self.assertTrue(board[1]['cooldownUntil'].endswith('Z'))
        self.assertEqual(len(self.client.get(f'/api/leagues/{lid}/feed', headers=bob_auth).json()), 1)
        self.assertEqual(self.client.post(f'/api/leagues/{lid}/snipes', json=shot, headers=auth).status_code, 409)

    def test_account_login_logout_and_saved_data(self):
        from models import Account, AccountSession
        from sqlmodel import select
        from datetime import timedelta
        import auth as auth_module
        password = 'long-private-password'
        signup = self.client.post('/api/signup', json={
            'name': 'Account Player', 'email': 'Player@Example.com', 'password': password,
        })
        self.assertEqual(signup.status_code, 200, signup.text)
        original = signup.json()
        headers = {'Authorization': 'Bearer ' + original['token']}
        league = self.client.post('/api/leagues', json={'name': 'Saved League', 'cooldownMinutes': 15, 'pointsPerSnipe': 10, 'bountyBonusPoints': 0, 'kingBonusPoints': 0, 'shooterCooldownMinutes': 0}, headers=headers).json()
        with Session(self.engine) as session:
            account = session.exec(select(Account)).one()
            self.assertEqual(account.email, 'player@example.com')
            self.assertNotEqual(account.password_hash, password)
            self.assertTrue(auth_module.verify_password(password, account.password_hash))
            self.assertNotIn(password, signup.text)
            login_session = session.exec(select(AccountSession)).one()
            self.assertNotEqual(login_session.token_hash, original['token'])
        duplicate = self.client.post('/api/signup', json={
            'name': 'Duplicate', 'email': 'PLAYER@example.com', 'password': password,
        })
        self.assertEqual(duplicate.status_code, 409)
        wrong = self.client.post('/api/session', json={'email': 'player@example.com', 'password': 'wrong'})
        self.assertEqual(wrong.status_code, 401)
        unknown = self.client.post('/api/session', json={'email': 'unknown@example.com', 'password': 'wrong'})
        self.assertEqual(unknown.json(), wrong.json())
        self.assertEqual(self.client.post('/api/logout', json={}, headers=headers).status_code, 200)
        self.assertEqual(self.client.get('/api/me', headers=headers).status_code, 401)
        login = self.client.post('/api/session', json={'email': 'PLAYER@example.com', 'password': password})
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.json()['user']['id'], original['user']['id'])
        restored_headers = {'Authorization': 'Bearer ' + login.json()['token']}
        saved = self.client.get('/api/leagues', headers=restored_headers).json()
        self.assertEqual(saved[0]['id'], league['id'])
        with Session(self.engine) as session:
            token = auth_module.token_hash(restored_headers['Authorization'])
            login_session = session.get(AccountSession, token)
            login_session.expires_at = auth_module.utc_now() - timedelta(seconds=1)
            session.add(login_session)
            session.commit()
        self.assertEqual(self.client.get('/api/me', headers=restored_headers).status_code, 401)

    def test_legacy_player_can_attach_account_but_cannot_access_api(self):
        import hashlib
        from models import Player, PlayerSession, League, LeagueMember
        with Session(self.engine) as session:
            player = Player(display_name='Old player')
            session.add(player)
            session.flush()
            player_id = player.id
            session.add(PlayerSession(token_hash=hashlib.sha256(b'legacy-token').hexdigest(), player_id=player_id))
            league = League(name='Old league', join_code='OLD12345')
            session.add(league)
            session.flush()
            session.add(LeagueMember(league_id=league.id, player_id=player_id, score=50))
            session.commit()
        headers = {'Authorization': 'Bearer legacy-token'}
        self.assertEqual(self.client.get('/api/auth/status', headers=headers).json(), {'authenticated': False, 'canUpgrade': True})
        self.assertEqual(self.client.get('/api/leagues', headers=headers).status_code, 401)
        result = self.client.post('/api/signup', json={
            'name': 'Old player', 'email': 'old@example.com', 'password': 'legacy-password-123',
        }, headers=headers)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()['user']['id'], str(player_id))
        new_headers = {'Authorization': 'Bearer ' + result.json()['token']}
        league = self.client.get('/api/leagues', headers=new_headers).json()[0]
        board = self.client.get('/api/leagues/' + league['id'] + '/leaderboard', headers=new_headers).json()
        self.assertEqual(board[0]['points'], 50)
        self.assertFalse(self.client.get('/api/auth/status', headers=headers).json()['canUpgrade'])
        self.assertEqual(self.client.post('/api/session', json={'name': 'No password'}).status_code, 422)

    def test_four_character_password_signup_and_login(self):
        created = self.client.post('/api/signup', json={
            'name': 'Four', 'email': 'four@example.com', 'password': 'abcd',
        })
        self.assertEqual(created.status_code, 200, created.text)
        login = self.client.post('/api/session', json={'email': 'four@example.com', 'password': 'abcd'})
        self.assertEqual(login.status_code, 200, login.text)
        self.assertEqual(login.json()['user']['id'], created.json()['user']['id'])

    def test_password_validation_lockout_and_legacy_route_protection(self):
        self.assertEqual(self.client.post('/api/signup', json={
            'name': 'Short', 'email': 'short@example.com', 'password': 'abc',
        }).status_code, 422)
        self.assertEqual(self.client.post('/api/signup', json={
            'name': 'Invalid', 'email': 'invalid', 'password': 'long-password-123',
        }).status_code, 422)
        self.assertEqual(self.client.post('/games').status_code, 401)
        self.assertEqual(self.client.get('/players').status_code, 401)
        self.client.post('/api/signup', json={'name': 'Lockout', 'email': 'lock@example.com', 'password': 'long-password-123'})
        for _ in range(5):
            self.assertEqual(self.client.post('/api/session', json={'email': 'lock@example.com', 'password': 'wrong'}).status_code, 401)
        self.assertEqual(self.client.post('/api/session', json={'email': 'lock@example.com', 'password': 'long-password-123'}).status_code, 429)

    def test_merged_league_rules_with_account_authentication(self):
        players = []
        for name in ['Alice', 'Bob', 'Charlie']:
            result = self.client.post('/api/signup', json={
                'name': name, 'email': name.lower() + '@example.com', 'password': 'test-password-123',
            }).json()
            players.append((result['user']['id'], {'Authorization': 'Bearer ' + result['token']}))
        alice, bob, charlie = players
        league = self.client.post('/api/leagues', headers=alice[1], json={
            'name': 'Merged Rules', 'cooldownMinutes': 15, 'shooterCooldownMinutes': 10,
            'pointsPerSnipe': 2, 'bountyBonusPoints': 4, 'kingBonusPoints': 3,
        }).json()
        for _, headers in [bob, charlie]:
            self.assertEqual(self.client.post('/api/leagues/join', headers=headers, json={'joinCode': league['joinCode']}).status_code, 200)
        base = '/api/leagues/' + league['id']
        shot = {'targetId': int(alice[0]), 'requestId': 'merged-shot'}
        response = self.client.post(base + '/snipes', headers=bob[1], json=shot)
        self.assertEqual(response.status_code, 200, response.text)
        hit = response.json()
        self.assertEqual(hit['points'], 9)
        retry = self.client.post(base + '/snipes', headers=bob[1], json=shot)
        self.assertEqual(retry.json()['id'], hit['id'])
        self.assertEqual(self.client.post(base + '/snipes', headers=bob[1], json={'targetId': int(charlie[0])}).status_code, 409)
        challenged = self.client.post(base + '/snipes/' + hit['id'] + '/challenge', headers=alice[1], json={'reason': 'Not a valid shot'})
        self.assertEqual(challenged.status_code, 200, challenged.text)
        self.assertEqual(challenged.json()['status'], 'challenged')
        approved = self.client.post(base + '/snipes/' + hit['id'] + '/approve', headers=charlie[1])
        self.assertEqual(approved.status_code, 200, approved.text)
        self.assertEqual(approved.json()['status'], 'reversed')
        board = self.client.get(base + '/leaderboard', headers=alice[1]).json()
        self.assertTrue(all(member['points'] == 0 for member in board))
