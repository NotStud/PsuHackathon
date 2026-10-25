"""The shooter's crosshair is saved with each snipe, so the feed can draw it over the photo."""
import unittest
from unittest.mock import patch

with patch.dict('os.environ', {'DATABASE_URL': 'postgresql://postgres:test@localhost/postgres'}):
    import league_api as api
    import auth

from pydantic import ValidationError
from sqlmodel import SQLModel, Session, create_engine


class SnipeCrosshairTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        SQLModel.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.alice, self.bob = self.signup('Alice'), self.signup('Bob')
        created = api.create_league(api.LeagueInput(name='Crosshairs'), self.session, self.alice)
        self.lid = int(created['id'])
        api.join_league(api.JoinInput(joinCode=created['joinCode']), self.session, self.bob)

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def signup(self, name):
        result = auth.signup(auth.SignupInput(name=name, email=name.lower() + '@example.com',
                                              password='test-password-123'), self.session)
        return api.current_player(self.session, 'Bearer ' + result['token'])

    def test_crosshair_is_saved_and_shown_in_the_feed(self):
        api.fire_shot(self.lid, api.ShotInput(requestId='s1'), self.session, self.alice)
        hit = api.submit_snipe(self.lid, api.SnipeInput(targetId=self.bob.id, requestId='s1', crosshair='scope:green'),
                               self.session, self.alice)
        self.assertEqual(hit['crosshair'], 'scope:green')
        self.assertEqual(api.feed(self.lid, self.session, self.bob)[0]['crosshair'], 'scope:green')

    def test_older_snipes_have_no_crosshair(self):
        hit = api.submit_snipe(self.lid, api.SnipeInput(targetId=self.bob.id), self.session, self.alice)
        self.assertIsNone(hit['crosshair'])

    def test_rejects_anything_but_style_and_color(self):
        for bad in ('<script>', 'classic', 'classic:red:extra', 'Classic:Red'):
            with self.subTest(bad=bad), self.assertRaises(ValidationError):
                api.SnipeInput(targetId=self.bob.id, crosshair=bad)
