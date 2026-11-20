// v0.5: daily duty, red daytime sabotage, moonlight erodes the school.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { assign, randomAvatar } from '../server/roles.js';
import { TRAITS, TASKS, TASK_TYPES } from '../server/content.js';
import { privateView, publicView } from '../server/views.js';

function setup(n = 10) {
  const players = new Map();
  for (let i = 0; i < n; i++) players.set(`p${i}`, { id: `p${i}`, nickname: `P${i}`, avatar: randomAvatar(), sockets: new Set() });
  assign([...players.values()], 'short');
  const room = { code: 'TEST', settings: { mode: 'short', maxPlayers: 50 }, players, status: 'playing', banned: new Set(), hostSockets: new Set() };
  const g = new Game(room, { clock: () => 0 }); room.game = g;
  const list = [...players.values()];
  const give = (p, trait) => { p.secret.trait = trait; p.secret.color = TRAITS[trait].color; };
  return { g, list, give, room };
}

test('personal tasks: unlock by day, real ones help the school, red ones only look done', () => {
  const { g, list, give, room } = setup(10);
  give(list[0], 'aggressive');
  for (const p of list.slice(1)) give(p, 'protector');
  g.setupTasks();
  assert.equal(list[1].secret.tasks.length, TASKS.perMode.short);
  g.startDay(1); g.enter('day', 40);
  const open1 = g.tasksOpen();
  assert.ok(open1 >= 1 && open1 < TASKS.perMode.short);
  const locked = list[1].secret.tasks[open1];
  assert.equal(g.playerAction(list[1], { type: 'task', id: locked.id }), 'locked');
  // red: looks done, no progress
  const rt = list[0].secret.tasks[0];
  assert.equal(g.playerAction(list[0], { type: 'task', id: rt.id }), null);
  assert.equal(g.tasks.real, 0);
  assert.equal(privateView(room, list[0]).ctx.tasks[0].done, true);
  // blue: progress + area points
  const t = list[1].secret.tasks[0];
  assert.equal(g.playerAction(list[1], { type: 'task', id: t.id }), null);
  assert.equal(g.playerAction(list[1], { type: 'task', id: t.id }), 'already');
  assert.equal(g.tasks.real, 1);
  assert.equal(publicView(room).game.tasks.done, 1);
  // a whole area fills up → +1
  const area = TASK_TYPES[t.type].area, before = g.status[area];
  const every = Math.max(2, Math.round(10 * TASKS.areaEvery));
  g.tasks.pts[area] = every - 1;
  const t2 = list[2].secret.tasks.find((x) => TASK_TYPES[x.type].area === area);
  if (t2 && list[2].secret.tasks.indexOf(t2) < open1) { g.playerAction(list[2], { type: 'task', id: t2.id }); assert.ok(g.status[area] >= before + 1); }
  // milestone at 50%
  g.tasks.real = Math.ceil(g.tasks.total / 2) - 1; const b2 = g.status.trust;
  const t3 = list[3].secret.tasks[0]; g.playerAction(list[3], { type: 'task', id: t3.id });
  assert.ok(g.status.trust >= b2 + TASKS.milestoneBonus);
  assert.equal(g.tasks.milestones, 1);
});

test('sabotage: once a day for the whole red team, only red, blocked when silenced', () => {
  const { g, list, give, room } = setup(10);
  give(list[0], 'aggressive'); give(list[1], 'mocking'); give(list[2], 'protector');
  g.startDay(2); g.enter('day', 40);
  g.chooseProject(g.offers[0].id, null); g.project.funded = 50;
  assert.equal(g.playerAction(list[2], { type: 'sabotage', kind: 'steal' }), 'no_skill');
  assert.ok(privateView(room, list[0]).ctx.sabotage);
  assert.equal(privateView(room, list[2]).ctx.sabotage, null);
  assert.equal(g.playerAction(list[0], { type: 'sabotage', kind: 'steal' }), null);
  assert.ok(g.project.funded < 50);
  assert.equal(g.playerAction(list[1], { type: 'sabotage', kind: 'wreck' }), 'already');
  g.startDay(3); g.enter('day', 40);
  list[1].secret.silenced = true;
  assert.equal(g.playerAction(list[1], { type: 'sabotage', kind: 'wreck' }), 'no_skill');
  g.tasks.real = 5;
  assert.equal(g.playerAction(list[0], { type: 'sabotage', kind: 'wreck' }), null);
  assert.ok(g.tasks.wrecked >= 2);
});

test('moonlight erodes every school area each night', () => {
  const { g } = setup(10);
  g.startDay(2); g.day = 2; g.enter('night', 20);
  for (const p of g.list()) p.secret.color = 'blue';
  const before = { ...g.status };
  g.resolveNight();
  for (const k of Object.keys(before)) assert.ok(g.status[k] <= before[k] - 1 + 1, k); // −1 (night healing may add +1 to wellbeing)
  assert.ok(Object.keys(before).filter((k) => g.status[k] === before[k] - 1).length >= 4);
});
