// Full-game simulations: bots play every phase to a winner in each mode, with leak checks on the public view.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../scripts/simulate.js';
import { publicView } from '../server/views.js';
import { SCENARIOS, parseFx, MODES } from '../server/content.js';
import { roleList, traitList } from '../server/roles.js';

const SECRET = /"(trait|color|will|secret|diary|knownRed|ballots|token)"\s*:/;

test('scenario deck: 100 cards parsed with effects and sources', () => {
  assert.equal(SCENARIOS.length, 100);
  for (const c of SCENARIOS) { assert.ok(c.choices.length >= 2, c.id); assert.ok(c.source, c.id); assert.ok(c.modes.length, c.id); }
  assert.deepEqual(parseFx('ไว้วางใจ-4;เป็นส่วนหนึ่ง+1'), { trust: -4, belonging: 1 });
  assert.deepEqual(parseFx('ไม่มี'), {});
});

test('role and trait lists fit 5 to 50 players', () => {
  for (let n = 5; n <= 50; n++) {
    assert.equal(roleList(n).length, n);
    const t = traitList(n, 'medium');
    assert.equal(t.traits.length, n);
    assert.ok(t.counts.red >= 1 && t.counts.blue > t.counts.red);
  }
});

for (const mode of ['short', 'medium', 'marathon']) {
  test(`${mode}: bots finish a full game without leaking secrets`, () => {
    let checks = 0, sawCard = false, sawNight = false, sawVote = false, sawMission = false;
    const { g } = simulate(mode, 12, {
      onTick: (gg) => {
        if (gg.phase === 'card' && gg.card && !gg.card.brief) sawCard = true;
        if (gg.phase === 'night') sawNight = true;
        if (gg.vote) sawVote = true;
        if (gg.phase === 'mission') sawMission = true;
        if (!gg.finished && checks++ % 25 === 0) {
          const json = JSON.stringify(publicView({ code: 'T', status: 'playing', settings: { mode }, players: gg.room.players, hostSockets: new Set(), game: gg }));
          assert.equal(SECRET.exec(json), null, `leak in ${gg.phase}: ${SECRET.exec(json)?.[0]}`);
        }
      },
    });
    assert.ok(g.finished, 'game reached an end');
    assert.ok(['blue', 'red'].includes(g.winner.color));
    assert.ok(sawCard && sawNight, 'cards and nights happened');
    assert.ok(sawVote, 'at least one vote session');
    assert.equal(sawMission, MODES[mode].missions, 'missions only in medium/marathon');
    if (MODES[mode].days && g.winner.reason.startsWith('ครบ')) assert.equal(g.day, MODES[mode].days);
  });
}
