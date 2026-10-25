"""Keep database round trips and image reads bounded as snipe history grows."""
import json
import unittest
from unittest.mock import patch

with patch.dict('os.environ', {'DATABASE_URL': 'postgresql://postgres:test@localhost/postgres'}):
    import league_api as api

from fastapi import HTTPException
from starlette.requests import Request
from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine
from models import Challenge, ChallengeVote, League, LeagueMember, LeagueSnipe, Player


class SnipePerformanceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        SQLModel.metadata.create_all(self.engine)
        with Session(self.engine) as session:
            session.add_all([Player(id=i, display_name=str(i)) for i in (1, 2, 3)])
            session.add(League(id=1, name='Test', join_code='TEST', creator_id=1))
            session.flush()
            session.add_all([LeagueMember(league_id=1, player_id=i) for i in (1, 2, 3)])
            for i in range(1, 21):
                session.add(LeagueSnipe(id=i, league_id=1, shooter_id=1, target_id=2,
                                       photo_url='data:image/png;base64,AA=='))
                session.add(Challenge(id=i, snipe_id=i, challenger_id=2, kind='reverse', reason='test'))
                session.add(ChallengeVote(challenge_id=i, voter_id=3, approve=True))
            session.commit()
        self.statements = []
        event.listen(self.engine, 'before_cursor_execute', self.record)

    def record(self, conn, cursor, statement, parameters, context, executemany):
        self.statements.append(statement)

    def tearDown(self):
        self.engine.dispose()

    def test_scoring_uses_three_reads_without_photos_or_writes(self):
        with Session(self.engine) as session:
            league = session.get(League, 1)
            self.statements.clear()
            scores, points = api.compute_league_scores_and_points(league, session, persist=False)
            self.assertEqual(len(points), 20)
            self.assertGreater(scores[1], 0)
            self.assertEqual(len(self.statements), 3)
            self.assertFalse(any('photo_url' in sql for sql in self.statements))
            self.assertFalse(session.dirty)

    def test_feed_batches_challenges_and_votes_without_writes(self):
        with Session(self.engine) as session:
            player = session.get(Player, 1)
            self.statements.clear()
            feed = api.feed(1, session, player)
            self.assertEqual(len(feed), 20)
            self.assertTrue(all(hit['challenges'][0]['voterIds'] == ['3'] for hit in feed))
            self.assertTrue(all(hit['challenges'][0]['votesNeeded'] == 1 for hit in feed))
            self.assertLessEqual(len(self.statements), 9)
            self.assertFalse(session.dirty)

    def test_feed_transfers_urls_instead_of_image_payloads(self):
        with Session(self.engine) as session:
            for hit in session.exec(api.select(LeagueSnipe)).all():
                hit.photo_url = 'data:image/png;base64,' + 'A' * 100_000
            session.commit()
        with Session(self.engine) as session:
            player = session.get(Player, 1)
            self.statements.clear()
            feed = api.feed(1, session, player)
            self.assertLess(len(json.dumps(feed)), 20_000)
            self.assertTrue(all(hit['photoUrl'].startswith('/api/leagues/1/snipes/') for hit in feed))
            # Presence checks are fine, but no feed query should select the image column itself.
            self.assertFalse(any('league_snipes.photo_url,' in sql or
                                 'league_snipes.photo_url \n' in sql for sql in self.statements))

    def test_private_photo_and_conditional_request(self):
        with Session(self.engine) as session:
            player = session.get(Player, 1)
            request = Request({'type': 'http', 'headers': []})
            photo = api.snipe_photo(1, 1, request, session, player)
            self.assertEqual(photo.body, b'\x00')
            self.assertEqual(photo.media_type, 'image/png')
            self.assertIn('private', photo.headers['cache-control'])
            self.assertEqual(photo.headers['vary'], 'Authorization')
            cached = Request({'type': 'http', 'headers': [
                (b'if-none-match', photo.headers['etag'].encode())]})
            self.statements.clear()
            response = api.snipe_photo(1, 1, cached, session, player)
            self.assertEqual(response.status_code, 304)
            self.assertEqual(response.body, b'')
            self.assertFalse(any(sql.startswith('SELECT league_snipes.photo_url') for sql in self.statements))

    def test_photo_requires_membership_and_matching_league(self):
        with Session(self.engine) as session:
            session.add(Player(id=4, display_name='Outsider'))
            session.add(League(id=2, name='Other', join_code='OTHER'))
            session.add(LeagueMember(league_id=2, player_id=1))
            session.commit()
            request = Request({'type': 'http', 'headers': []})
            with self.assertRaises(HTTPException) as denied:
                api.snipe_photo(1, 1, request, session, session.get(Player, 4))
            self.assertEqual(denied.exception.status_code, 403)
            with self.assertRaises(HTTPException) as missing:
                api.snipe_photo(2, 1, request, session, session.get(Player, 1))
            self.assertEqual(missing.exception.status_code, 404)

    def test_feed_preserves_external_and_missing_photos(self):
        with Session(self.engine) as session:
            session.get(LeagueSnipe, 1).photo_url = 'https://example.com/proof.jpg'
            session.get(LeagueSnipe, 2).photo_url = None
            session.commit()
        with Session(self.engine) as session:
            feed = {hit['id']: hit for hit in api.feed(1, session, session.get(Player, 1))}
            self.assertEqual(feed['1']['photoUrl'], 'https://example.com/proof.jpg')
            self.assertIsNone(feed['2']['photoUrl'])
