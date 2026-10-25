"""Keep database round trips and image reads bounded as snipe history grows."""
import unittest
from unittest.mock import patch

with patch.dict('os.environ', {'DATABASE_URL': 'postgresql://postgres:test@localhost/postgres'}):
    import league_api as api

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
