// v0.4.4: the 21 hidden traits and the 4 personal stats.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { assign, randomAvatar, traitList } from '../server/roles.js';
import { TRAITS, DEALT_TRAITS, STATS } from '../server/content.js';

function setup(n = 12, mode = 'medium') {
  let t = 0;
  const players = new Map();
  for (let i = 0; i < n; i++) players.set(`p${i}`, { id: `p${i}`, nickname: `P${i}`, avatar: randomAvatar(), sockets: new Set() });
  assign([...players.values()], mode);
  const g = new Game({ settings: { mode }, players }, { clock: () => t });
  const list = [...players.values()];
  const give = (p, trait) => { p.secret.trait = trait; p.secret.color = TRAITS[trait].color; };
  const toNight = () => { g.day = 3; g.enter('night', 20); };
  return { g, list, give, toNight };
}

test('21 dealt traits; every trait is dealt somewhere between 5 and 50 players', () => {
  assert.equal(DEALT_TRAITS.length, 21);
  const seen = new Set();
  for (let n = 5; n <= 50; n++) for (let k = 0; k < 6; k++) for (const t of traitList(n, 'medium').traits) seen.add(t);
  assert.deepEqual([...seen].sort(), [...DEALT_TRAITS].sort());
});

test('honest pair appears from 8 players and they see each other', () => {
  const { g, list } = setup(10);
  const h = list.filter((p) => p.secret.trait === 'honest');
  assert.equal(h.length, 2);
  assert.equal(h[0].secret.honestWith, h[1].id);
  assert.equal(traitList(7, 'medium').traits.includes('honest'), false);
  assert.ok(g);
});

test('pretender looks blue and attention-seeker looks red to the just', () => {
  const { g, list, give, toNight } = setup();
  const [just, pre, att] = list;
  give(just, 'just'); give(pre, 'pretender'); give(att, 'attention');
  toNight();
  assert.equal(g.playerAction(just, { type: 'night', target: pre.id }), null);
  g.resolveNight();
  assert.match(just.secret.diary.at(-1).text, /สีน้ำเงิน/);
  g.day = 4; g.enter('night', 20);
  assert.equal(g.playerAction(just, { type: 'night', target: att.id }), 'no_skill', 'only every 2 nights');
  g.day = 5; g.enter('night', 20);
  g.playerAction(just, { type: 'night', target: att.id }); g.resolveNight();
  assert.match(just.secret.diary.at(-1).text, /สีแดง/);
});

test('aggressive lowers strength and leaves a shirt clue; brave stops bullying and announces the type', () => {
  const { g, list, give, toNight } = setup();
  const [agg, victim, brave, v2] = list;
  give(agg, 'aggressive'); give(brave, 'brave'); give(victim, 'protector'); give(v2, 'protector');
  toNight();
  g.playerAction(agg, { type: 'night', target: victim.id });
  g.resolveNight();
  assert.equal(victim.secret.str, STATS.str.start - 15);
  assert.match(victim.secret.diary.at(-1).text, /เสื้อสี/);
  g.day = 4; g.enter('night', 20);
  g.playerAction(agg, { type: 'night', target: v2.id });
  g.playerAction(brave, { type: 'night', target: v2.id });
  g.resolveNight();
  assert.equal(v2.secret.str, STATS.str.start);
  assert.ok(g.log.some((e) => /กล้าหาญหยุดการรังแกทางกาย/.test(e.text)));
  assert.equal(g.nightAction(brave), null, 'brave is once per game');
});

test('excluded player cannot join the next diplomatic team; timid hide blocks everything', () => {
  const { g, list, give, toNight } = setup();
  const [exc, victim, timid, mock] = list;
  give(exc, 'excluder'); give(timid, 'timid'); give(mock, 'mocking');
  toNight();
  g.playerAction(exc, { type: 'night', target: victim.id });
  g.playerAction(timid, { type: 'night' });
  g.playerAction(mock, { type: 'night', target: timid.id });
  g.resolveNight();
  assert.equal(timid.secret.wasBullied, false, 'hidden: untouched');
  assert.ok(g.excluded.has(victim.id));
  assert.equal(victim.secret.acc, STATS.acc.start - 10);
  g.enter('propose', 15);
  const leader = g.P(g.leaderId());
  const team = [victim.id, ...list.filter((p) => p.id !== victim.id).map((p) => p.id)].slice(0, g.teamSize());
  assert.equal(g.playerAction(leader, { type: 'propose', team }), 'excluded');
});

test('manipulator stops a protector; persuader recruits only low-acceptance players, who may refuse or accept', () => {
  const { g, list, give, toNight } = setup();
  const [man, prot, agg, victim, per, lonely] = list;
  give(man, 'manipulator'); give(prot, 'protector'); give(agg, 'aggressive'); give(per, 'persuader'); give(lonely, 'caring');
  toNight();
  g.playerAction(man, { type: 'night', target: prot.id });
  g.playerAction(prot, { type: 'night', target: victim.id });
  g.playerAction(agg, { type: 'night', target: victim.id });
  lonely.secret.acc = 20;
  g.playerAction(per, { type: 'night', target: lonely.id });
  g.resolveNight();
  assert.equal(victim.secret.str, STATS.str.start - 15, 'protection was blocked by pressure');
  assert.ok(g.recruitOffers.has(lonely.id));
  g.day = 4; g.enter('day', 40);
  assert.equal(g.playerAction(lonely, { type: 'recruitAnswer', accept: true }), null);
  assert.equal(lonely.secret.color, 'red');
  assert.equal(lonely.secret.trait, 'recruited');
});

test('compromise halves the bad effects of the morning card', () => {
  const { g, list, give } = setup();
  const [c] = list; give(c, 'compromise');
  for (const p of list) p.role = 'student'; // no celeb backlash in this check
  g.startDay(2);
  const card = g.card.card;
  const choice = card.choices.find((x) => Object.values(x.fx).some((v) => v < 0)) || card.choices[0];
  const before = { ...g.status };
  assert.equal(g.playerAction(c, { type: 'compromise' }), null);
  for (const p of list) g.playerAction(p, { type: 'cardVote', choice: choice.id });
  g.resolveCard();
  for (const [k, v] of Object.entries(choice.fx)) {
    const want = v < 0 ? (Math.trunc(v / 2) || 0) : v;
    assert.equal(g.status[k] - before[k], Math.max(-before[k], Math.min(100 - before[k], want)), k);
  }
});

test('personal stats: daily caps, strength limits donations, economy scales them', () => {
  const { g, list } = setup();
  const [a, b] = list;
  g.startDay(2);
  const eco0 = a.secret.eco;
  for (let i = 0; i < 10; i++) g.addStat(a, 'eco', 5);
  assert.equal(a.secret.eco, eco0 + (STATS.eco.cap - a.secret.gain.eco + (a.secret.eco - eco0)), 'capped');
  assert.ok(a.secret.gain.eco <= STATS.eco.cap);
  b.secret.str = 20; assert.equal(g.donateMax(b), 5);
  b.secret.str = 60; b.secret.eco = 80; assert.equal(g.donateMax(b), 15);
  const acc0 = a.secret.acc;
  g.enter('day', 40);
  g.playerAction(a, { type: 'heart', target: b.id });
  assert.equal(a.secret.acc, acc0 + STATS.acc.heartGive);
});
