// End-to-end multiplayer test over Socket.IO: rooms, lobby limits, bots, start, story skip, secret isolation, host controls.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as ioc } from 'socket.io-client';

process.env.PORT = '0';
const { server } = await import('../server/index.js');
await new Promise((r) => (server.listening ? r() : server.once('listening', r)));
const URL = `http://localhost:${server.address().port}`;
const SECRET_KEYS = ['trait', 'color', 'will', 'secret', 'token', 'hostToken', 'diary', 'knownRed', 'ballots'];

const clients = [];
function client() {
  const s = ioc(URL, { transports: ['websocket'], forceNew: true });
  s.last = {};
  for (const ev of ['state:public', 'state:host', 'state:private']) s.on(ev, (d) => (s.last[ev] = d));
  clients.push(s);
  return new Promise((r) => s.on('connect', () => r(s)));
}
const emit = (s, ev, data = {}) => new Promise((r) => s.emit(ev, data, r));
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
function findSecret(obj, path = '') {
  if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEYS.includes(k)) return `${path}.${k}`;
    const f = findSecret(v, `${path}.${k}`); if (f) return f;
  }
  return null;
}

let host, code; const players = [];
after(() => { clients.forEach((c) => c.close()); server.close(); setTimeout(() => process.exit(0), 50); });

test('host creates a room with a name and a mode', async () => {
  host = await client();
  const r = await emit(host, 'room:create', { settings: { hostName: 'ครูไก่', mode: 'short' } });
  assert.ok(r.ok); assert.match(r.code, /^[A-Z0-9]{5}$/); code = r.code;
  await wait();
  const st = host.last['state:host'];
  assert.equal(st.settings.minPlayers, 5); assert.equal(st.settings.maxPlayers, 50); assert.equal(st.settings.hostName, 'ครูไก่');
});

test('players join; duplicate names and bad codes rejected', async () => {
  for (const n of ['มะลิ', 'Ton', 'ฟ้าใส']) {
    const s = await client();
    const r = await emit(s, 'room:join', { code: code.toLowerCase(), nickname: n });
    assert.ok(r.ok, r.error); s.session = r; players.push(s);
  }
  assert.equal((await emit(await client(), 'room:join', { code, nickname: 'ton' })).error, 'nickname_taken');
  assert.equal((await emit(await client(), 'room:join', { code: 'ZZZZZ', nickname: 'x' })).error, 'no_room');
});

test('start is locked below 5 players', async () => {
  assert.equal((await emit(host, 'host:start')).error, 'not_enough_players');
});

test('non-host cannot add bots or start', async () => {
  assert.equal((await emit(players[0], 'host:addBots', { count: 3 })).error, 'not_host');
  assert.equal((await emit(players[0], 'host:start')).error, 'not_host');
});

test('host adds bots, then starts; story is shown and can be skipped', async () => {
  const r = await emit(host, 'host:addBots', { count: 5 });
  assert.ok(r.ok); assert.equal(r.added, 5);
  assert.ok((await emit(host, 'host:start')).ok);
  assert.equal((await emit(await client(), 'room:join', { code, nickname: 'late' })).error, 'game_started');
  await wait();
  const g = host.last['state:host'].game;
  assert.equal(g.phase, 'story'); assert.ok(g.story.lines.length >= 3);
  assert.ok((await emit(host, 'host:command', { type: 'next' })).ok);
  await wait();
  const g2 = host.last['state:host'].game;
  assert.equal(g2.phase, 'card'); assert.equal(g2.day, 1); assert.ok(g2.card.brief, 'day 1 is a briefing, not a scenario');
});

test('no secret leaks in public/host views; each phone sees only its own trait', async () => {
  await wait(300);
  for (const s of [host, ...players]) {
    const pub = s.last['state:public'] || s.last['state:host'];
    assert.equal(findSecret(pub), null, `leak ${findSecret(pub)}`);
  }
  assert.equal(findSecret(host.last['state:host']), null);
  for (const p of players) {
    const priv = p.last['state:private'];
    assert.ok(priv.cards.trait.th && priv.cards.role.th);
    assert.ok(['blue', 'red', 'yellow'].includes(priv.cards.trait.color));
    for (const o of priv.ctx.others) assert.equal(Object.keys(o).sort().join(), 'id,name');
  }
});

test('free actions validate server-side', async () => {
  // move to the first game-clock phase
  await emit(host, 'host:command', { type: 'next' });
  await wait();
  const p = players[0], other = players[1].session.playerId;
  assert.equal((await emit(p, 'player:action', { type: 'heart', target: p.session.playerId })).error, 'bad_target');
  assert.ok((await emit(p, 'player:action', { type: 'heart', target: other })).ok);
  assert.ok((await emit(p, 'player:action', { type: 'report' })).ok);
  assert.equal((await emit(p, 'player:action', { type: 'report' })).error, 'already');
  assert.equal((await emit(p, 'player:action', { type: 'missionCard', card: 'sabotage' })).error, 'wrong_phase');
  assert.equal((await emit(p, 'player:action', { type: 'donate', amount: 999 })).ok, false);
});

test('host pause / resume / add time', async () => {
  assert.ok((await emit(host, 'host:command', { type: 'pause' })).ok);
  await wait();
  assert.equal(host.last['state:host'].game.paused, true);
  assert.ok((await emit(host, 'host:command', { type: 'addTime', seconds: 30 })).ok);
  assert.ok((await emit(host, 'host:command', { type: 'resume' })).ok);
  assert.ok((await emit(host, 'host:command', { type: 'endGame' })).ok);
  await wait();
  const g = host.last['state:host'].game;
  assert.ok(g.finished); assert.equal(g.reveal.length, 8);
});
