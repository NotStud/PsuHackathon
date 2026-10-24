"""Authoritative rules; no camera or UI dependencies. All times are UTC epoch seconds."""
import secrets
import sqlite3
import time
from contextlib import contextmanager

COOLDOWN_SECONDS = 600
IMMUNITY_SECONDS = 600
ROUND_SECONDS = 7 * 24 * 60 * 60

class RuleError(Exception):
    pass

class Game:
    def __init__(self, path='game.sqlite3', clock=time.time):
        self.path, self.clock = str(path), clock
        with self.db() as c:
            c.executescript('''
            CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, token TEXT UNIQUE NOT NULL);
            CREATE TABLE IF NOT EXISTS rounds(id INTEGER PRIMARY KEY, starts REAL NOT NULL, ends REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS hits(id TEXT PRIMARY KEY, round_id INTEGER NOT NULL, shooter TEXT NOT NULL,
              target TEXT NOT NULL, at REAL NOT NULL, clip TEXT NOT NULL, request_id TEXT NOT NULL,
              UNIQUE(shooter,request_id));
            CREATE TABLE IF NOT EXISTS challenges(
              hit_id TEXT PRIMARY KEY, challenger TEXT NOT NULL, reason TEXT NOT NULL,
              created_at REAL NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','approved')),
              approved_by TEXT, approved_at REAL);
            CREATE VIEW IF NOT EXISTS hit_details AS
              SELECT h.*,
                CASE WHEN ch.status='approved' THEN 'reversed'
                     WHEN ch.status='pending' THEN 'challenged' ELSE 'valid' END AS status,
                ch.reason AS challenge_reason, ch.challenger, ch.created_at AS challenged_at,
                ch.approved_by, ch.approved_at
              FROM hits h LEFT JOIN challenges ch ON ch.hit_id=h.id;
            ''')

    @contextmanager
    def db(self):
        c = sqlite3.connect(self.path, timeout=15)
        c.row_factory = sqlite3.Row
        try:
            with c:
                yield c
        finally:
            c.close()

    def join(self, name):
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 30:
            raise RuleError('Name must contain 1–30 characters.')
        p = dict(id=secrets.token_hex(8), name=name.strip(), token=secrets.token_urlsafe(32))
        try:
            with self.db() as c:
                c.execute('INSERT INTO players VALUES (:id,:name,:token)', p)
        except sqlite3.IntegrityError:
            raise RuleError('That name is already taken. Use your existing session.')
        return p

    def authenticate(self, token):
        with self.db() as c:
            p = c.execute('SELECT id,name FROM players WHERE token=?', (token,)).fetchone()
        if not p:
            raise RuleError('Please join or restore your player token.')
        return dict(p)

    def _round(self, c, now):
        r = c.execute('SELECT * FROM rounds ORDER BY id DESC LIMIT 1').fetchone()
        if not r:
            c.execute('INSERT INTO rounds(starts,ends) VALUES (?,?)', (now, now+ROUND_SECONDS))
        elif now >= r['ends']:
            # Preserve a continuous schedule, even if nobody opens the app for weeks.
            start = r['ends'] + int((now-r['ends'])//ROUND_SECONDS)*ROUND_SECONDS
            c.execute('INSERT INTO rounds(starts,ends) VALUES (?,?)', (start,start+ROUND_SECONDS))
        return c.execute('SELECT * FROM rounds ORDER BY id DESC LIMIT 1').fetchone()

    def _timers(self, c, player, now):
        last_shot = c.execute("SELECT MAX(at) FROM hit_details WHERE shooter=? AND status!='reversed'", (player,)).fetchone()[0]
        last_hit = c.execute("SELECT MAX(at) FROM hit_details WHERE target=? AND status!='reversed'", (player,)).fetchone()[0]
        return {'cooldown_until': (last_shot+COOLDOWN_SECONDS if last_shot is not None else 0),
                'immune_until': (last_hit+IMMUNITY_SECONDS if last_hit is not None else 0)}

    def record_hit(self, shooter, target, clip, request_id):
        if not isinstance(request_id, str) or not 1 <= len(request_id) <= 100:
            raise RuleError('A request_id of 1–100 characters is required.')
        with self.db() as c:
            c.execute('BEGIN IMMEDIATE')  # Concurrent attempts cannot bypass timers.
            now = self.clock()
            old = c.execute('SELECT * FROM hit_details WHERE shooter=? AND request_id=?', (shooter,request_id)).fetchone()
            if old:
                if old['target'] != target:
                    raise RuleError('This request ID was already used for another target.')
                return dict(old)
            if shooter == target:
                raise RuleError('You cannot hit yourself.')
            for pid in (shooter,target):
                if not c.execute('SELECT 1 FROM players WHERE id=?',(pid,)).fetchone():
                    raise RuleError('Both players must have joined this game.')
            if self._timers(c,shooter,now)['cooldown_until'] > now:
                raise RuleError('Your 10-minute cooldown is still active.')
            if self._timers(c,target,now)['immune_until'] > now:
                raise RuleError('That player still has 10-minute immunity.')
            r = self._round(c,now)
            hit = dict(id=secrets.token_hex(12), round_id=r['id'], shooter=shooter,
                       target=target, at=now, clip=clip, request_id=request_id)
            c.execute('INSERT INTO hits VALUES (:id,:round_id,:shooter,:target,:at,:clip,:request_id)',hit)
            return self._hit(c, hit['id'])

    def _hit(self, c, hit_id):
        hit = c.execute('SELECT * FROM hit_details WHERE id=?', (hit_id,)).fetchone()
        if not hit:
            raise RuleError('Hit not found.')
        return dict(hit)

    def challenge_hit(self, player, hit_id, reason):
        """Only the recorded target may challenge. Pending hits still count."""
        if not isinstance(reason, str) or not 1 <= len(reason.strip()) <= 500:
            raise RuleError('Explain the challenge in 1–500 characters.')
        with self.db() as c:
            c.execute('BEGIN IMMEDIATE')
            hit = self._hit(c, hit_id)
            if player != hit['target']:
                raise RuleError('Only the player who was hit can challenge this shot.')
            if hit['status'] != 'valid':
                return hit  # Retrying cannot create another challenge or reopen one.
            c.execute('''INSERT INTO challenges
                (hit_id,challenger,reason,created_at,status) VALUES (?,?,?,?, 'pending')''',
                (hit_id, player, reason.strip(), self.clock()))
            return self._hit(c, hit_id)

    def approve_challenge(self, reviewer, hit_id):
        """One uninvolved player can reverse a challenged hit, exactly once."""
        with self.db() as c:
            c.execute('BEGIN IMMEDIATE')
            hit = self._hit(c, hit_id)
            if not c.execute('SELECT 1 FROM players WHERE id=?', (reviewer,)).fetchone():
                raise RuleError('You must join the game before reviewing a challenge.')
            if reviewer in (hit['shooter'], hit['target']):
                raise RuleError('The reviewer must be someone other than the shooter and the player hit.')
            if hit['status'] == 'valid':
                raise RuleError('The player hit must challenge this shot first.')
            if hit['status'] == 'reversed':
                return hit
            c.execute('''UPDATE challenges SET status='approved', approved_by=?, approved_at=?
                WHERE hit_id=? AND status='pending' ''', (reviewer, self.clock(), hit_id))
            # Scores and timers are derived from non-reversed hits, so no decrement
            # or blanket timer reset can accidentally alter another valid hit.
            return self._hit(c, hit_id)

    def state(self, player):
        with self.db() as c:
            c.execute('BEGIN IMMEDIATE')
            now = self.clock()
            r = dict(self._round(c,now))
            players = [dict(p) for p in c.execute('SELECT id,name FROM players ORDER BY name')]
            for p in players:
                p.update(self._timers(c,p['id'],now))
                p['score'] = c.execute("SELECT COUNT(*) FROM hit_details WHERE shooter=? AND round_id=? AND status!='reversed'",(p['id'],r['id'])).fetchone()[0]
            hits = [dict(h) for h in c.execute('SELECT * FROM hit_details WHERE round_id=? ORDER BY at DESC, id DESC LIMIT 100',(r['id'],))]
            # Include older incoming hits and pending challenges across rounds so
            # rollover/the public feed's 100-hit limit cannot hide a disputed shot.
            my_hits = [dict(h) for h in c.execute('SELECT * FROM hit_details WHERE target=? ORDER BY at DESC, id DESC', (player,))]
            challenges = [dict(h) for h in c.execute("SELECT * FROM hit_details WHERE status='challenged' ORDER BY challenged_at, id")]
            return dict(server_time=now,round=r,me=player,players=players,hits=hits,
                        my_hits=my_hits, pending_challenges=challenges,
                        notifications=my_hits[:100])
