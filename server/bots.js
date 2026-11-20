// Play-test bots. They act through the same playerAction() API as humans (no shortcuts, no extra info).
import crypto from 'node:crypto';
import { REASONS, NEWS_FORMS } from './content.js';

const chance = (p) => crypto.randomInt(1000) < p * 1000;
const pick = (a) => a[crypto.randomInt(a.length)];
const BOT_NAMES = ['บอทฟ้า', 'บอทเมฆ', 'บอทดาว', 'บอทลม', 'บอทใบไม้', 'บอทภูเขา', 'บอททะเล', 'บอทหมอก', 'บอทแสง', 'บอทจันทร์', 'บอทตะวัน', 'บอทฝน', 'บอทหิน', 'บอทไฟ', 'บอทน้ำ', 'บอทป่า', 'บอทนก', 'บอทปลา', 'บอทแมว', 'บอทหมา'];
export function botName(i) { return `${BOT_NAMES[i % BOT_NAMES.length]}${i >= BOT_NAMES.length ? Math.floor(i / BOT_NAMES.length) + 1 : ''}`; }

const fxSum = (c) => Object.values(c.fx || {}).reduce((s, v) => s + v, 0);

/** One decision step for one bot; called every tick. Light randomness keeps them from acting all at once. */
export function botStep(g, p, rate = 0.35) {
  if (g.finished || !chance(rate)) return;
  const s = p.secret, red = s.color === 'red', others = g.list().filter((x) => x.id !== p.id);
  const act = (d) => g.playerAction(p, d);
  const ph = g.phase;

  if (g.vote) {
    if (g.vote.stage !== 'cast' || g.vote.ballots.has(p.id)) return;
    if (g.vote.kind === 'punish') {
      if (chance(0.5)) return; // stays silent (= abstain)
      const pool = red ? others.filter((x) => x.secret.color !== 'red') : others;
      act({ type: 'ballot', target: pick(pool.length ? pool : others).id });
    } else act({ type: 'ballot', choice: chance(red ? 0.6 : 0.3) ? 'yes' : 'no' });
    return;
  }
  if (ph === 'card' && g.card && !g.card.brief && !g.card.votes.has(p.id)) {
    const ch = [...g.card.card.choices].sort((a, b) => fxSum(b) - fxSum(a));
    const choice = red && chance(0.6) ? ch[ch.length - 1] : chance(0.7) ? ch[0] : pick(ch);
    if (s.trait === 'compromise' && chance(0.2)) act({ type: 'compromise' });
    return act({ type: 'cardVote', choice: choice.id });
  }
  if (ph === 'propose' && g.leaderId() === p.id && !g.proposal) {
    const pool = g.missionPool();
    const team = [p.id, ...others.sort(() => Math.random() - 0.5).map((x) => x.id)].filter((id) => pool.includes(id)).slice(0, g.teamSize());
    return act({ type: 'propose', team });
  }
  if (ph === 'teamVote' && !g.teamVotes.has(p.id)) {
    const hasRed = g.proposal.some((id) => g.P(id).secret.color === 'red');
    return act({ type: 'teamVote', approve: red ? hasRed || chance(0.4) : chance(0.7) });
  }
  if (ph === 'mission' && (g.proposal || []).includes(p.id) && !g.missionCards.has(p.id)) {
    return act({ type: 'missionCard', card: red && chance(0.6) ? 'sabotage' : 'coop' });
  }
  if (ph === 'night') {
    const a = g.nightAction(p);
    if (a && !g.nightActs.has(p.id)) {
      let pool = others;
      if (a === 'bully') pool = others.filter((x) => x.secret.color !== 'red');
      if (['bully', 'rumor', 'pressure', 'recruit'].includes(a)) pool = others.filter((x) => x.secret.color !== 'red');
      const no = g.notTarget(p); if (no) pool = pool.filter((x) => x.id !== no);
      if (a === 'hide') { if (chance(0.15)) act({ type: 'night' }); }
      else if (['restore', 'brave', 'convert', 'rumor', 'recruit'].includes(a) && !chance(0.25)) { /* save one-shot skills for later */ }
      else if (pool.length) act({ type: 'night', target: pick(pool).id });
    }
    if (p.role === 'angel' && !g.angelUsed.has(p.id) && chance(0.5)) act({ type: 'angel', target: pick(others).id });
  }
  if (['day', 'night', 'propose', 'teamVote', 'mission'].includes(ph)) {
    if (p.role === 'president' && !g.project && g.offers.length) act({ type: 'chooseProject', project: g.offers[0].id });
    if (p.role === 'president' && g.project && g.treasury > 0) act({ type: 'useTreasury' });
    if (g.recruitOffers.has(p.id)) act({ type: 'recruitAnswer', accept: chance(0.3) });
    if (s.trait === 'peaceful' && chance(0.02)) act({ type: 'calm' });
    if (s.trait !== 'timid' && g.project && chance(red ? 0.08 : 0.25) && s.will > 30) act({ type: 'donate', amount: Math.min(g.donateMax(p), s.will > 55 ? 10 : 5) });
    if (s.trait !== 'timid' && chance(0.15)) act({ type: 'heart', target: pick(others).id });
    if (chance(0.006)) act({ type: 'report' });
    if (p.role === 'president' && chance(0.004)) act({ type: 'callVote', reason: pick(REASONS).id });
    if (chance(0.004)) act({ type: 'motion' });
    if (p.role === 'academic') act({ type: 'analyze', target: pick(others).id });
    if (s.trait === 'newsie' && chance(0.05)) act({ type: 'postNews', form: pick(NEWS_FORMS).id, target: pick(others).id });
    const pair = [...g.pairs.entries()].find(([k, h]) => h >= 5 && k.split('|').includes(p.id) && !g.pairUsed.has(k));
    if (pair && chance(0.3)) act({ type: 'pairCard', target: pair[0].split('|').find((x) => x !== p.id) });
  }
}
