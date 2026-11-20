// Assignment of public roles (บทบาท) and hidden traits (คุณลักษณะ).
import crypto from 'node:crypto';
import { TRAITS, WILL, STATS } from './content.js';
import { shuffle } from './validate.js';

export function colorCounts(n, mode) {
  const red = Math.max(1, Math.floor(n / 4));
  const yellow = mode === 'short' ? (n >= 10 ? 1 : 0) : n >= 14 ? 2 : n >= 8 ? 1 : 0;
  return { blue: n - red - yellow, red, yellow };
}

export function roleList(n) {
  const out = ['president', 'vice', 'opposition', 'rep', 'celeb'].slice(0, Math.min(5, n));
  let rest = n - out.length;
  const angels = n >= 9 ? 3 : 0;
  const athletes = n >= 10 ? Math.min(4, Math.max(2, Math.floor(n / 8))) : 0;
  const academics = n >= 7 ? Math.max(1, Math.floor(n / 8)) : 0;
  for (const [r, k] of [['angel', angels], ['athlete', athletes], ['academic', academics]]) {
    const take = Math.min(k, rest); for (let i = 0; i < take; i++) out.push(r); rest -= take;
  }
  while (rest-- > 0) out.push('student');
  return out;
}

const RED_ORDER = ['aggressive', 'mocking', 'excluder', 'manipulator', 'rumor', 'persuader', 'pretender'];
const RED_REPEAT = ['aggressive', 'mocking', 'excluder', 'manipulator'];
const BLUE_ORDER = ['protector', 'caring', 'observant', 'just', 'changemaker', 'brave', 'compromise', 'alert'];
const BLUE_REPEAT = ['protector', 'observant', 'compromise', 'just', 'caring', 'brave', 'alert'];
const YELLOW = ['newsie', 'timid', 'craver', 'peaceful', 'attention'];

export function traitList(n, mode) {
  const c = colorCounts(n, mode);
  const red = Array.from({ length: c.red }, (_, i) => (i < RED_ORDER.length ? RED_ORDER[i] : RED_REPEAT[(i - RED_ORDER.length) % RED_REPEAT.length]));
  const blue = [];
  if (n >= 8 && c.blue >= 4) blue.push('honest', 'honest');
  for (let i = 0; blue.length < c.blue; i++) blue.push(i < BLUE_ORDER.length ? BLUE_ORDER[i] : BLUE_REPEAT[(i - BLUE_ORDER.length) % BLUE_REPEAT.length]);
  const yellow = shuffle(YELLOW).slice(0, c.yellow);
  return { counts: c, traits: [...red, ...blue, ...yellow] };
}

const SKINS = ['#F2C9A0', '#E0AC7E', '#C68B5B', '#8D5A3B', '#F7D9BC'];
const HAIRS = ['#2B1B12', '#5A3A1E', '#111111', '#A0522D', '#E8C15A', '#4B2E83'];
const SHIRTS = ['#2457A7', '#43B96D', '#FF9B35', '#EF5350', '#8E5BD6', '#38A9E8', '#F2C14E', '#1FA59A'];
export function randomAvatar() {
  const r = (a) => a[crypto.randomInt(a.length)];
  return { skin: r(SKINS), hair: r(HAIRS), shirt: r(SHIRTS), style: crypto.randomInt(3) };
}

/** Writes p.role (public) and p.secret (hidden trait state). */
export function assign(players, mode) {
  const n = players.length;
  const roles = shuffle(roleList(n));
  const { counts, traits } = traitList(n, mode);
  const tr = shuffle(traits);
  players.forEach((p, i) => {
    p.role = roles[i];
    p.secret = {
      trait: tr[i], color: TRAITS[tr[i]].color, origColor: TRAITS[tr[i]].color,
      will: WILL.start, str: STATS.str.start, eco: STATS.eco.start, acc: STATS.acc.start,
      gain: { eco: 0, acc: 0 }, silenced: false, used: false, uses: 0, lastUse: -99, lastTarget: null,
      heartsReceived: 0, wasBullied: false, helped: false, diary: [], knownRed: [], honestWith: null,
    };
  });
  const honest = players.filter((p) => p.secret.trait === 'honest');
  if (honest.length === 2) { honest[0].secret.honestWith = honest[1].id; honest[1].secret.honestWith = honest[0].id; }
  return counts;
}
