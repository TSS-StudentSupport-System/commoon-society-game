// ★ Projection layer — the ONLY place state becomes network payloads.
// Public and host views are built from allow-lists: traits / colours / will never appear during play.
import { STATUS_KEYS, STATUS_META, MODES, ROLES, TRAITS, COLORS, STORY, REASONS, NEWS_FORMS, PAIR_UNLOCK, PAIR_CARD, HEARTS_PER_DAY, REFLECTION_PROMPTS, T, STATS, TASK_TYPES, TASKS } from './content.js';

const publicPlayer = (room, p) => ({
  id: p.id, nickname: p.nickname, ready: p.ready, connected: p.connected || !!p.bot, bot: !!p.bot, avatar: p.avatar,
  role: p.role ? { id: p.role, th: ROLES[p.role].th, acting: !!p.acting, removed: !!p.removed } : null,
});

function publicGame(g) {
  if (!g) return null;
  const c = g.card;
  const v = {
    mode: g.mode, modeTh: MODES[g.mode].th, day: g.day, totalDays: g.cfg.days,
    phase: g.phase, phaseTh: g.phaseTh(), timer: g.timerView(), timeOfDay: g.timeOfDay(), paused: g.paused,
    story: g.phase === 'story' ? STORY : null,
    act: g.act,
    status: STATUS_KEYS.map((k) => ({ key: k, ...STATUS_META[k], value: g.status[k], change: g.lastChange[k] || null })),
    avg: g.avg(), target: g.cfg.endAvg || g.cfg.marathonAvg,
    log: g.log.slice(0, 8),
    card: c ? (c.brief ? { brief: true, pages: c.pages } : {
      id: c.card.id, tier: c.card.tier, category: c.card.category, title: c.card.title, story: c.card.story,
      choices: c.card.choices.map((x) => ({ id: x.id, label: x.label })), fact: c.card.fact, source: c.card.source,
      voted: c.votes.size, result: c.result,
    }) : null,
    dawn: g.dawn && g.dawn.day === g.day - 1 ? g.dawn : null,
    news: g.news,
    silenced: g.silenced,
    frontA: g.frontA(), projectsDone: g.projectsDone.length,
    project: g.project ? { id: g.project.id, th: g.project.th, area: g.project.area, size: g.project.size, fx: g.project.fx, cost: g.project.cost, funded: g.project.funded, donors: g.project.donors.size } : null,
    offers: g.offers.map((o) => ({ id: o.id, th: o.th, area: o.area, size: o.size, fx: o.fx, cost: o.cost })),
    treasury: g.treasury,
    tasks: { done: Math.max(0, g.tasks.real - g.tasks.wrecked), total: g.tasks.total, milestones: TASKS.milestones, reached: g.tasks.milestones },
    president: g.presidentId() ? g.name(g.presidentId()) : null,
    reports: [...g.reports.values()].reduce((a, b) => a + b, 0), motions: [...g.motions.values()].reduce((a, b) => a + b, 0),
    voteCooldown: Math.max(0, g.voteCooldownUntil - g.now()),
    vote: g.vote ? {
      kind: g.vote.kind, stage: g.vote.stage, reason: g.vote.reason, by: g.vote.by ? g.name(g.vote.by) : null,
      cast: g.vote.ballots.size, result: g.vote.stage === 'result' ? g.vote.result : null,
    } : null,
    missions: g.cfg.missions ? {
      needSuccess: g.cfg.needSuccess, failLimit: g.cfg.failLimit, track: g.missions.map((m) => ({ day: m.day, success: m.success, sabotage: m.sabotage })),
      today: g.isMissionDay(), next: g.isMissionDay() ? g.day : g.day + 1,
      leader: ['propose', 'teamVote', 'mission'].includes(g.phase) ? g.name(g.leaderId()) : null,
      teamSize: g.teamSize(), rejects: g.rejects, proposal: g.proposal ? g.proposal.map((id) => ({ id, name: g.name(id) })) : null,
      teamVoted: g.teamVotes.size, lastTeamVote: g.lastTeamVote, played: g.missionCards.size,
      reveal: g.lastReveal && g.lastReveal.day === g.day && g.phase === 'night' ? g.lastReveal : null,
    } : null,
    finished: g.finished, winner: g.winner,
  };
  if (g.finished) {
    v.reveal = g.list().map((p) => ({
      id: p.id, name: p.nickname, avatar: p.avatar, role: ROLES[p.role].th,
      color: p.secret.color, colorTh: COLORS[p.secret.color].th, trait: TRAITS[p.secret.trait].th,
      changed: p.secret.color !== p.secret.origColor, silenced: p.secret.silenced, won: g.won(p),
    }));
    v.pairs = g.topPairs();
  }
  return v;
}

export function publicView(room) {
  return {
    serverNow: Date.now(), code: room.code, status: room.status,
    settings: { name: room.settings.name, mode: room.settings.mode, maxPlayers: room.settings.maxPlayers, minPlayers: room.settings.minPlayers, hostName: room.settings.hostName },
    players: [...room.players.values()].map((p) => publicPlayer(room, p)),
    hostConnected: room.hostSockets.size > 0,
    game: publicGame(room.game),
  };
}

export function hostView(room) {
  const v = publicView(room);
  const g = room.game;
  v.host = {
    history: g?.finished ? g.history : null,
    reflections: g?.finished ? [...room.players.values()].filter((p) => p.reflection).map((p) => ({ name: p.nickname, answers: p.reflection })) : null,
  };
  return v;
}

function ctx(g, p) {
  const s = p.secret, role = p.role, ph = g.phase;
  const others = g.list().filter((x) => x.id !== p.id).map((x) => ({ id: x.id, name: x.nickname }));
  const c = { phase: ph, others };
  if (ph === 'card' && g.card && !g.card.brief) c.myChoice = g.card.votes.get(p.id) || null;
  if (ph === 'propose') { c.amLeader = g.leaderId() === p.id; c.teamSize = g.teamSize(); }
  if (ph === 'teamVote') c.myTeamVote = g.teamVotes.has(p.id) ? g.teamVotes.get(p.id) : null;
  if (ph === 'mission') { c.onTeam = (g.proposal || []).includes(p.id); c.canSabotage = c.onTeam && s.color === 'red'; c.played = g.missionCards.has(p.id); }
  if (ph === 'night') {
    const a = g.nightAction(p);
    c.night = a ? { action: a, chosen: g.nightActs.has(p.id) ? (g.nightActs.get(p.id).target || 'self') : null, notTarget: g.notTarget(p) } : null;
    c.angel = role === 'angel' && !g.angelUsed.has(p.id);
  }
  const cap = HEARTS_PER_DAY + (role === 'student' ? 1 : 0);
  c.hearts = { left: cap - (g.heartsUsed.get(p.id) || 0), cap };
  c.donated = g.donatedToday.has(p.id);
  c.reported = g.reports.has(p.id); c.motioned = g.motions.has(p.id);
  c.isPresident = role === 'president';
  c.canAnalyze = role === 'academic' && !g.analyzed.has(p.id);
  c.canNews = s.trait === 'newsie' && !s.silenced && !g.newsPosted.has(p.id);
  const live = !s.silenced && s.will > 0;
  c.canCompromise = s.trait === 'compromise' && live && s.uses < TRAITS.compromise.limit && ph === 'card' && g.card && !g.card.brief && !g.card.result && !g.card.compromise;
  c.canCalm = s.trait === 'peaceful' && live && s.uses < TRAITS.peaceful.limit;
  c.recruitOffer = g.recruitOffers.has(p.id);
  c.excluded = g.excluded.has(p.id);
  c.donateMax = g.donateMax(p);
  const dayish = ['day', 'propose', 'teamVote', 'mission'].includes(ph) && !g.vote;
  const open = g.tasksOpen();
  c.tasks = (s.tasks || []).map((t, i) => ({ id: t.id, type: t.type, ...TASK_TYPES[t.type], done: t.done, locked: i >= open }));
  c.tasksOpenNow = dayish;
  c.sabotage = dayish && s.color === 'red' && live && !g.sabotaged.size
    ? { steal: !!(g.project && g.project.funded > 0), wreck: g.tasks.real - g.tasks.wrecked > 0 } : null;
  if (g.vote) c.ballot = g.vote.ballots.has(p.id) ? (g.vote.ballots.get(p.id) ?? 'skip') : null;
  c.pairs = [...g.pairs.entries()].filter(([k]) => k.split('|').includes(p.id)).map(([k, h]) => {
    const other = k.split('|').find((x) => x !== p.id);
    return { id: other, name: g.name(other), hearts: h, unlocked: h >= PAIR_UNLOCK, used: g.pairUsed.has(k), requestedBy: g.pairReq.get(k) ? (g.pairReq.get(k) === p.id ? 'me' : 'them') : null };
  }).sort((a, b) => b.hearts - a.hearts);
  if (g.finished) { c.prompts = REFLECTION_PROMPTS; c.reflected = !!p.reflection; c.won = g.won(p); }
  return c;
}

export function privateView(room, p) {
  const v = { playerId: p.id, nickname: p.nickname, avatar: p.avatar, ready: p.ready, cards: null };
  const g = room.game;
  if (!p.secret || !g) return v;
  const s = p.secret, tr = TRAITS[s.trait];
  v.cards = {
    role: { id: p.role, th: ROLES[p.role].th, skill: ROLES[p.role].skill, acting: !!p.acting, removed: !!p.removed },
    trait: { id: s.trait, th: tr.th, skill: tr.skill, color: s.color, colorTh: COLORS[s.color].th, goal: COLORS[s.color].goal, silenced: s.silenced, used: s.used },
    will: s.will,
    stats: [
      { key: 'will', th: 'พลังใจ', icon: '💗', value: s.will },
      { key: 'str', th: STATS.str.th, icon: '💪', value: s.str },
      { key: 'eco', th: STATS.eco.th, icon: '🪙', value: s.eco },
      { key: 'acc', th: STATS.acc.th, icon: '🤝', value: s.acc },
    ],
  };
  v.cards.trait.limit = tr.limitTh; v.cards.trait.win = tr.win || null;
  v.cards.trait.usesLeft = tr.limit ? Math.max(0, tr.limit - s.uses) : null;
  v.allies = s.color === 'red' ? g.list().filter((x) => x.id !== p.id && x.secret.color === 'red').map((x) => x.nickname)
    : s.knownRed.length ? s.knownRed.map((id) => g.name(id)) : [];
  v.alliesLabel = s.color === 'red' ? 'เพื่อนร่วมแก๊งสีแดง' : 'คนที่คุณรู้ว่าเคยอยู่สีแดง';
  if (s.trait === 'honest' && s.honestWith && g.P(s.honestWith)) { v.allies = [g.name(s.honestWith)]; v.alliesLabel = 'เพื่อนซื่อสัตย์ (สีน้ำเงินแน่นอน)'; }
  v.angels = p.role === 'angel' ? g.list().filter((x) => x.id !== p.id && x.role === 'angel').map((x) => x.nickname) : [];
  v.diary = s.diary.slice(-40).reverse();
  v.reasons = REASONS; v.newsForms = NEWS_FORMS.map((f) => ({ id: f.id, text: f.text('…') }));
  v.pairCard = PAIR_CARD.th; v.pairUnlock = PAIR_UNLOCK;
  v.ctx = ctx(g, p);
  v.timings = { voteTalk: T.voteTalk, voteCast: T.voteCast };
  return v;
}
