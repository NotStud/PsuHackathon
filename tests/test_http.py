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
        self.assertIn('<div id="root">', home.text)
        import re
        assets = re.findall(r'(?:src|href)="(/assets/[^"]+)"', home.text)
        self.assertTrue(assets)
        for asset in assets:
            self.assertEqual(self.client.get(asset).status_code, 200)
        self.assertEqual(self.client.get('/leagues/1').status_code, 200)
        self.assertEqual(self.client.get('/api/me').status_code, 401)
        alice = self.client.post('/api/session', json={'name': 'Alice'}).json()
        bob = self.client.post('/api/session', json={'name': 'Bob'}).json()
        auth = {'Authorization': 'Bearer ' + alice['token']}
        bob_auth = {'Authorization': 'Bearer ' + bob['token']}
        self.assertEqual(self.client.get('/api/me', headers=auth).json(), alice['user'])
        result = self.client.post('/api/leagues', json={'name': 'HTTP League', 'cooldownMinutes': 15}, headers=auth)
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
