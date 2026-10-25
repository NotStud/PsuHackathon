"""game.py rules in the league API: bounty rotation timing, reversal-safe timers, and challenge votes."""
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

    def challenge(self, lid, snipe, player, reason='Missed'):
        return api.challenge_snipe(lid, int(snipe['id']), api.ChallengeInput(reason=reason), self.session, player)

    def vote(self, lid, challenged, voter, minutes=0, kind=None):
        challenge = next(c for c in challenged['challenges'] if kind in (None, c['kind']))
        return self.at(minutes, api.vote_on_challenge, lid, int(challenge['id']), self.session, voter)

    def board(self, lid, minutes):
        rows = self.at(minutes, api.leaderboard, lid, self.session, self.players[0])
        return {row['user']['displayName']: row for row in rows}

    def test_reversal_keeps_timers_from_later_valid_snipes(self):
        alice, bob, carol, dave = self.players
        lid = self.league(self.players)
        first = self.snipe(lid, alice, bob, 0)
        self.snipe(lid, carol, bob, 20)    # Bob's immunity from the first hit has expired
        self.snipe(lid, alice, carol, 30)  # Alice's shooter cooldown has expired
        challenged = self.challenge(lid, first, bob)
        self.vote(lid, challenged, dave, minutes=32)

        board = self.board(lid, 33)
        self.assertEqual(board['Bob']['cooldownUntil'], '2026-10-24T12:35:00Z')        # Carol's hit at :20
        self.assertEqual(board['Alice']['shooterCooldownUntil'], '2026-10-24T12:40:00Z')  # Alice's shot at :30
        with self.assertRaises(HTTPException) as error:
            self.snipe(lid, dave, bob, 33)
        self.assertEqual(error.exception.status_code, 409)

    def test_reversing_the_only_snipe_clears_both_timers(self):
        alice, bob, carol, dave = self.players
        lid = self.league(self.players)
        hit = self.snipe(lid, alice, bob, 0)
        challenged = self.challenge(lid, hit, bob)
        self.vote(lid, challenged, dave, minutes=1)
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

    def test_one_yes_vote_reverses_and_restores_scores(self):
        alice, bob, carol, dave = self.players
        lid = self.league(self.players, pointsPerSnipe=10)
        hit = self.snipe(lid, alice, bob, 0)
        self.assertEqual(self.board(lid, 1)['Alice']['points'], 10)
        self.assertEqual(self.board(lid, 1)['Bob']['points'], -1)
        challenged = self.challenge(lid, hit, bob)
        self.assertEqual(challenged['challenges'][0]['votesNeeded'], 1)  # the default
        passed = self.vote(lid, challenged, carol)
        self.assertEqual(passed['status'], 'reversed')
        self.assertEqual(passed['challenges'][0]['status'], 'approved')
        self.assertTrue(passed['challenges'][0]['voted'])
        board = self.board(lid, 1)
        self.assertEqual(board['Alice']['points'], 0)  # back to before the snipe
        self.assertEqual(board['Bob']['points'], 0)
        self.assertEqual(board['Alice']['snipes'], 0)

    def test_two_vote_league_needs_two_yes_votes(self):
        alice, bob, carol, dave = self.players
        lid = self.league(self.players, pointsPerSnipe=10, challengeVotes=2)
        challenged = self.challenge(lid, self.snipe(lid, alice, bob, 0), bob)
        one = self.vote(lid, challenged, carol)
        self.assertEqual(one['status'], 'challenged')  # one yes isn't enough
        self.assertEqual(self.board(lid, 1)['Alice']['points'], 10)
        self.assertEqual(self.vote(lid, challenged, dave)['status'], 'reversed')
        self.assertEqual(self.board(lid, 1)['Alice']['points'], 0)

    def test_three_vote_league_needs_three_yes_votes(self):
        players = self.players + [self.signup('Erin')]
        alice, bob, carol, dave, erin = players
        lid = self.league(players, challengeVotes=3)
        challenged = self.challenge(lid, self.snipe(lid, alice, bob, 0), bob)
        self.vote(lid, challenged, carol)
        self.assertEqual(self.vote(lid, challenged, dave)['status'], 'challenged')
        self.assertEqual(self.vote(lid, challenged, erin)['status'], 'reversed')

    def test_without_a_yes_vote_the_snipe_stands(self):
        alice, bob, carol, dave = self.players
        lid = self.league(self.players, pointsPerSnipe=10)
        challenged = self.challenge(lid, self.snipe(lid, alice, bob, 0), bob)
        self.assertEqual(challenged['status'], 'challenged')
        self.assertEqual(challenged['challenges'][0]['yesVotes'], 0)
        self.assertFalse(challenged['challenges'][0]['voted'])
        board = self.board(lid, 60)  # nobody votes, however long it's been
        self.assertEqual((board['Alice']['points'], board['Bob']['points']), (10, -1))

    def test_voting_twice_counts_once(self):
        alice, bob, carol, dave = self.players
        lid = self.league(self.players, challengeVotes=2)
        challenged = self.challenge(lid, self.snipe(lid, alice, bob, 0), bob)
        self.vote(lid, challenged, carol)
        again = self.vote(lid, challenged, carol)
        self.assertEqual(again['challenges'][0]['yesVotes'], 1)
        self.assertEqual(again['status'], 'challenged')

    def test_no_more_votes_once_passed(self):
        alice, bob, carol, dave = self.players
        lid = self.league(self.players)
        challenged = self.challenge(lid, self.snipe(lid, alice, bob, 0), bob)
        self.vote(lid, challenged, carol)
        with self.assertRaises(HTTPException) as closed:
            self.vote(lid, challenged, dave)
        self.assertEqual(closed.exception.status_code, 409)

    def test_shooter_headshot_claim_adds_the_bonus_when_upheld(self):
        alice, bob, carol, dave = self.players
        lid = self.league(self.players, pointsPerSnipe=10, headshotBonusPoints=5)
        hit = self.snipe(lid, alice, bob, 0)
        claimed = self.challenge(lid, hit, alice, reason='That was a headshot')
        self.assertEqual(claimed['challenges'][0]['kind'], 'headshot')
        self.assertFalse(claimed['headshot'])
        upheld = self.vote(lid, claimed, carol)
        self.assertTrue(upheld['headshot'])
        self.assertEqual(upheld['status'], 'valid')
        self.assertEqual(upheld['points'], 15)
        self.assertEqual(self.board(lid, 1)['Alice']['points'], 15)

    def test_headshots_from_the_app_get_the_bonus(self):
        alice, bob = self.players[:2]
        lid = self.league([alice, bob], pointsPerSnipe=10, headshotBonusPoints=5)
        hit = self.at(0, api.submit_snipe, lid, api.SnipeInput(targetId=bob.id, headshot=True), self.session, alice)
        self.assertTrue(hit['headshot'])
        self.assertEqual(hit['points'], 15)
        with self.assertRaises(HTTPException) as already:
            self.challenge(lid, hit, alice, reason='Headshot')
        self.assertEqual(already.exception.status_code, 409)

    def test_target_and_shooter_challenges_are_separate(self):
        alice, bob, carol, dave = self.players
        lid = self.league(self.players, pointsPerSnipe=10, headshotBonusPoints=5)
        hit = self.snipe(lid, alice, bob, 0)
        self.challenge(lid, hit, alice, reason='Headshot')
        both = self.challenge(lid, hit, bob)
        self.assertEqual(sorted(c['kind'] for c in both['challenges']), ['headshot', 'reverse'])
        reversed_hit = self.vote(lid, both, carol, kind='reverse')
        self.assertEqual(reversed_hit['status'], 'reversed')
        self.assertEqual(self.board(lid, 1)['Alice']['points'], 0)

    def test_who_can_challenge_and_vote(self):
        alice, bob, carol, dave = self.players
        lid = self.league(self.players)
        hit = self.snipe(lid, alice, bob, 0)
        with self.assertRaises(HTTPException) as outsider:
            self.challenge(lid, hit, carol)
        self.assertEqual(outsider.exception.status_code, 403)
        with self.assertRaises(HTTPException) as wrong_kind:
            api.challenge_snipe(lid, int(hit['id']), api.ChallengeInput(reason='Headshot', kind='headshot'),
                                self.session, bob)
        self.assertEqual(wrong_kind.exception.status_code, 403)
        challenged = self.challenge(lid, hit, bob)
        for player in (alice, bob):
            with self.assertRaises(HTTPException) as own:
                self.vote(lid, challenged, player)
            self.assertEqual(own.exception.status_code, 403)

    def test_small_league_needs_only_the_voters_it_has(self):
        alice, bob, carol = self.players[:3]
        lid = self.league([alice, bob, carol])
        challenged = self.challenge(lid, self.snipe(lid, alice, bob, 0), bob)
        self.assertEqual(challenged['challenges'][0]['votesNeeded'], 1)  # Carol is the only one who can vote
        self.assertEqual(self.vote(lid, challenged, carol)['status'], 'reversed')

    def miss(self, lid, shooter, target, minutes, reason='The detector missed him'):
        return self.at(minutes, api.submit_snipe, lid,
                       api.SnipeInput(targetId=target.id, missed=True, challengeReason=reason), self.session, shooter)

    def test_a_challenged_miss_counts_only_after_a_yes_vote(self):
        alice, bob, carol, dave = self.players
        lid = self.league(self.players, pointsPerSnipe=10)
        sent = self.miss(lid, alice, bob, 0)
        self.assertTrue(sent['missed'])
        self.assertEqual(sent['status'], 'challenged')
        self.assertEqual(sent['points'], 0)
        self.assertEqual([(c['kind'], c['challengerId'], c['reason']) for c in sent['challenges']],
                         [('hit', str(alice.id), 'The detector missed him')])
        board = self.board(lid, 1)
        self.assertEqual((board['Alice']['points'], board['Bob']['points']), (0, 0))
        self.assertEqual((board['Alice']['snipes'], board['Bob']['timesSniped']), (0, 0))
        self.assertIsNone(board['Bob']['cooldownUntil'])  # a miss doesn't make Bob immune
        counted = self.vote(lid, sent, carol, minutes=2)
        self.assertEqual(counted['status'], 'valid')
        self.assertEqual(counted['points'], 10)
        board = self.board(lid, 3)
        self.assertEqual((board['Alice']['points'], board['Bob']['points']), (10, -1))
        self.assertEqual(board['Bob']['cooldownUntil'], '2026-10-24T12:15:00Z')  # immune from when it was fired

    def test_a_miss_can_be_sent_without_a_reason(self):
        alice, bob = self.players[:2]
        lid = self.league([alice, bob])
        sent = self.miss(lid, alice, bob, 0, reason='  ')
        self.assertEqual([(c['kind'], c['reason']) for c in sent['challenges']], [('hit', '')])

    def test_an_uncounted_miss_cannot_be_reversed_or_claimed_as_a_headshot(self):
        alice, bob, carol, dave = self.players
        lid = self.league(self.players)
        sent = self.miss(lid, alice, bob, 0)
        for player in (bob, alice):
            with self.assertRaises(HTTPException) as error:
                self.challenge(lid, sent, player)
            self.assertEqual(error.exception.status_code, 409)
        self.vote(lid, sent, carol)
        reversal = self.challenge(lid, sent, bob)  # once it counts, Bob can challenge it like any hit
        self.assertEqual(reversal['status'], 'challenged')

    def test_challenges_list_who_voted_yes(self):
        players = self.players + [self.signup('Erin')]
        alice, bob, carol, dave, erin = players
        lid = self.league(players, challengeVotes=2)
        challenged = self.challenge(lid, self.snipe(lid, alice, bob, 0), bob)
        self.vote(lid, challenged, dave)
        result = self.vote(lid, challenged, carol)
        self.assertEqual(result['challenges'][0]['voterIds'], [str(dave.id), str(carol.id)])

    def test_claiming_a_headshot_when_sending_a_hit(self):
        alice, bob, carol, dave = self.players
        lid = self.league(self.players, pointsPerSnipe=10, headshotBonusPoints=5)
        sent = self.at(0, api.submit_snipe, lid, api.SnipeInput(targetId=bob.id, claimHeadshot=True,
                                                                challengeReason='Between the eyes'), self.session, alice)
        self.assertEqual(sent['points'], 10)  # the hit counts now; the bonus waits for the vote
        self.assertFalse(sent['headshot'])
        self.assertEqual([(c['kind'], c['claimsHeadshot']) for c in sent['challenges']], [('headshot', True)])
        upheld = self.vote(lid, sent, carol)
        self.assertEqual((upheld['points'], upheld['headshot']), (15, True))
        self.assertEqual(self.board(lid, 1)['Alice']['points'], 15)

    def test_claiming_a_headshot_without_a_reason(self):
        alice, bob = self.players[:2]
        lid = self.league([alice, bob])
        sent = self.at(0, api.submit_snipe, lid, api.SnipeInput(targetId=bob.id, claimHeadshot=True), self.session, alice)
        self.assertEqual([(c['kind'], c['reason']) for c in sent['challenges']], [('headshot', '')])

    def test_a_miss_claimed_as_a_headshot_gets_the_hit_and_the_bonus(self):
        alice, bob, carol, dave = self.players
        lid = self.league(self.players, pointsPerSnipe=10, headshotBonusPoints=5)
        sent = self.at(0, api.submit_snipe, lid, api.SnipeInput(targetId=bob.id, missed=True, claimHeadshot=True,
                                                                challengeReason='Clean headshot'), self.session, alice)
        self.assertEqual((sent['points'], sent['status']), (0, 'challenged'))
        self.assertEqual([(c['kind'], c['claimsHeadshot']) for c in sent['challenges']], [('hit', True)])
        with self.assertRaises(HTTPException):
            self.challenge(lid, sent, alice, reason='Headshot')  # the miss claim already says headshot
        counted = self.vote(lid, sent, dave)
        self.assertEqual((counted['points'], counted['headshot'], counted['status']), (15, True, 'valid'))
        board = self.board(lid, 1)
        self.assertEqual((board['Alice']['points'], board['Bob']['points']), (15, -1))

    def test_challenging_from_the_feed_without_a_reason(self):
        alice, bob, carol, dave = self.players
        lid = self.league(self.players)
        challenged = self.challenge(lid, self.snipe(lid, alice, bob, 0), bob, reason='')
        self.assertEqual(challenged['challenges'][0]['reason'], '')

    def test_no_headshot_keeps_the_hit_and_drops_the_bonus(self):
        alice, bob, carol, dave = self.players
        lid = self.league(self.players, pointsPerSnipe=10, headshotBonusPoints=5)
        hit = self.at(0, api.submit_snipe, lid, api.SnipeInput(targetId=bob.id, headshot=True), self.session, alice)
        self.assertEqual(hit['points'], 15)
        challenged = api.challenge_snipe(lid, int(hit['id']), api.ChallengeInput(kind='no-headshot'), self.session, bob)
        self.assertEqual([c['kind'] for c in challenged['challenges']], ['no-headshot'])
        self.assertEqual(challenged['points'], 15)  # until someone votes yes
        passed = self.vote(lid, challenged, carol)
        self.assertEqual((passed['points'], passed['headshot'], passed['status']), (10, False, 'valid'))
        board = self.board(lid, 1)
        self.assertEqual((board['Alice']['points'], board['Bob']['points']), (10, -1))  # still a hit
        self.assertIsNotNone(board['Bob']['cooldownUntil'])
        with self.assertRaises(HTTPException) as again:  # and the shooter can't claim it back
            self.challenge(lid, passed, alice, reason='It was')
        self.assertEqual(again.exception.status_code, 409)

    def test_no_headshot_on_an_upheld_headshot_claim(self):
        alice, bob, carol, dave = self.players
        lid = self.league(self.players, pointsPerSnipe=10, headshotBonusPoints=5)
        sent = self.at(0, api.submit_snipe, lid, api.SnipeInput(targetId=bob.id, claimHeadshot=True), self.session, alice)
        self.assertEqual(self.vote(lid, sent, carol)['points'], 15)
        challenged = api.challenge_snipe(lid, int(sent['id']), api.ChallengeInput(kind='no-headshot'), self.session, bob)
        self.assertEqual(self.vote(lid, challenged, dave, kind='no-headshot')['points'], 10)

    def test_no_headshot_needs_a_headshot(self):
        alice, bob = self.players[:2]
        lid = self.league([alice, bob])
        hit = self.snipe(lid, alice, bob, 0)
        with self.assertRaises(HTTPException) as error:
            api.challenge_snipe(lid, int(hit['id']), api.ChallengeInput(kind='no-headshot'), self.session, bob)
        self.assertEqual(error.exception.status_code, 409)
        with self.assertRaises(HTTPException) as shooter:
            api.challenge_snipe(lid, int(hit['id']), api.ChallengeInput(kind='no-headshot'), self.session, alice)
        self.assertEqual(shooter.exception.status_code, 403)
