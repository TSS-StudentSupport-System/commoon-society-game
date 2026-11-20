// COMMOON SOCIETY v0.4 game engine (server-authoritative).
// Day = card pause (45 s) → game clock 60 s [day 40 + night 20] or mission day [propose 15, team vote 10, mission 10, night 25].
// Vote sessions (punish / no-confidence) freeze the game clock: talk 45 s → cast 5 s → result.
import crypto from 'node:crypto';
import {
  STATUS_KEYS, STATUS_META, STATUS_START, COLLAPSE_AT, COLLAPSE_COUNT, MODES, T, MISSION_EVERY, MAX_REJECTS,
  REPORTS_TO_OPEN, WILL, HEARTS_PER_DAY, PAIR_UNLOCK, PAIR_CARD, TRAITS, ROLES, BULLY_FX, NEWS_FORMS,
  PROJECTS, PROJECT_COST, DONATE_PER_DAY, PROJECT_DONE_WILL, PROJECT_OFFERS, MISSION_RESOURCE, SCENARIOS, STORY, briefing, REASONS, COLORS,
  STATS, ecoMultiplier, SHIRT_TH,
} from './content.js';
import { shuffle, cleanText } from './validate.js';

const CLOCK_PHASES = new Set(['day', 'night', 'propose', 'teamVote', 'mission']);
const PHASE_TH = {
  story: 'ตำนานของโรงเรียน', card: 'เช้า · ไพ่สถานการณ์', brief: 'วันแรก · ภารกิจของเรา', day: 'กลางวัน', night: 'กลางคืน · แสงจันทร์',
  propose: 'ภารกิจทูต · เสนอทีม', teamVote: 'ภารกิจทูต · โหวตทีม', mission: 'ภารกิจทูต · การ์ดลับ', end: 'จบเกม',
};
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const rnd = (n) => crypto.randomInt(n);
const pick = (a) => a[rnd(a.length)];

export class Game {
  constructor(room, { clock = Date.now } = {}) {
    this.room = room;
    this.clock = clock;
    this.mode = room.settings.mode;
    this.cfg = MODES[this.mode];
    this.order = shuffle([...room.players.keys()]);
    this.n = this.order.length;
    this.status = Object.fromEntries(STATUS_KEYS.map((k) => [k, STATUS_START]));
    this.lastChange = {};
    this.log = [];                 // public "what changed" log
    this.history = [];             // full public timeline (end report)
    this.day = 0;
    this.deck = shuffle(SCENARIOS.filter((c) => c.modes.includes(this.mode)));
    this.card = null;              // { card, votes: Map, result }
    this.dawn = null;              // morning news
    this.news = [];                // anonymous news (newsie)
    this.silenced = [];            // names whose trait skill was cut by vote
    this.reports = new Map();      // per day: id -> weight
    this.motions = new Map();      // per day: no-confidence supporters
    this.vote = null;              // active vote session
    this.voteCooldownUntil = 0;
    this.heartsUsed = new Map();   // per day
    this.pairs = new Map();        // pairKey -> hearts
    this.pairUsed = new Set();
    this.pairReq = new Map();      // pairKey -> requester id
    this.nightActs = new Map();
    this.angelUsed = new Set();
    this.analyzed = new Set();     // academics, per day
    this.newsPosted = new Set();   // newsies, per day
    this.lastNightBullies = new Set();
    this.excluded = new Set();      // can't join the next diplomatic team (ชอบกีดกัน)
    this.recruitOffers = new Map(); // targetId -> persuader id (ชักจูง), answered during the day
    this.calmNext = false;          // รักสงบ: next morning has no crisis card
    this.reporters = new Set();     // who reported today (reward if the vote silences someone)
    // projects / Front A
    this.costScale = Math.max(5, this.n) / 10;
    this.projectsDone = [];        // project ids
    this.project = null;           // { id, funded, cost, donors:Set }
    this.offers = [];
    this.treasury = 0;
    this.donatedToday = new Map(); // id -> amount (athlete bonus)
    // missions
    this.missions = [];
    this.leaderIx = rnd(this.n);
    this.rejects = 0; this.proposal = null; this.teamVotes = new Map(); this.missionCards = new Map(); this.lastTeamVote = null; this.lastReveal = null;
    this.finished = false; this.winner = null;
    this.paused = false;
    this.act = null;
    this.refreshOffers();
    this.enter('story', T.story);
  }

  // ───────── helpers ─────────
  now() { return this.clock(); }
  P(id) { return this.room.players.get(id); }
  list() { return this.order.map((id) => this.P(id)).filter(Boolean); }
  name(id) { return this.P(id)?.nickname ?? '?'; }
  roleOf(id) { return this.P(id)?.role; }
  idsWithRole(r) { return this.order.filter((id) => this.roleOf(id) === r); }
  presidentId() { return this.idsWithRole('president')[0] || null; }
  diary(p, text, kind = 'info') { p.secret.diary.push({ day: this.day, text, kind }); if (p.secret.diary.length > 120) p.secret.diary.shift(); }
  pub(text, kind = '') { const e = { day: this.day, text, kind }; this.log.unshift(e); this.log = this.log.slice(0, 12); this.history.push(e); }
  avg() { return Math.round(STATUS_KEYS.reduce((s, k) => s + this.status[k], 0) / STATUS_KEYS.length); }
  isMissionDay(d = this.day) { return this.cfg.missions && d >= 2 && d % MISSION_EVERY === 0; }
  clockRunning() { return CLOCK_PHASES.has(this.phase) && !this.vote && !this.paused && !this.finished; }

  applyStatus(fx, why) {
    const parts = [];
    for (const [k, v] of Object.entries(fx || {})) {
      if (!v || !(k in this.status)) continue;
      const before = this.status[k];
      this.status[k] = Math.max(0, Math.min(100, before + v));
      const d = this.status[k] - before;
      if (d) { this.lastChange[k] = { d, at: this.now() }; parts.push(`${STATUS_META[k].th} ${d > 0 ? '+' : ''}${d}`); }
    }
    if (parts.length && why) this.pub(`${why}: ${parts.join(' · ')}`, Object.values(fx).some((v) => v < 0) ? 'bad' : 'good');
    return parts;
  }
  addWill(p, d) { p.secret.will = Math.max(0, Math.min(WILL.max, p.secret.will + d)); }
  /** Personal stat change. eco/acc gains are capped per day (STATS.*.cap). Returns the real change. */
  addStat(p, key, d) {
    const s = p.secret; if (!d) return 0;
    if (key === 'will') { const b = s.will; this.addWill(p, d); return s.will - b; }
    if (d > 0 && STATS[key].cap) { d = Math.min(d, STATS[key].cap - s.gain[key]); if (d <= 0) return 0; s.gain[key] += d; }
    const b = s[key]; s[key] = Math.max(0, Math.min(100, b + d)); return s[key] - b;
  }
  /** colour seen by investigate skills (เสแสร้ง looks blue, ชอบเป็นจุดสนใจ looks red) */
  apparentColor(p) { return TRAITS[p.secret.trait].appears || p.secret.color; }

  // ───────── timer ─────────
  enter(phase, seconds) {
    this.phase = phase;
    this.duration = seconds * 1000;
    this.endsAt = this.now() + this.duration;
    this.frozen = null;
    const fn = this[`on_${phase}`]; if (fn) fn.call(this);
  }
  remaining() {
    if (this.vote) return this.vote.frozenMain ?? 0;
    if (this.paused) return this.frozen ?? 0;
    return Math.max(0, this.endsAt - this.now());
  }
  timerView() {
    if (this.vote) return { phase: true, endsAt: this.vote.endsAt, paused: this.paused, remaining: Math.max(0, (this.paused ? this.vote.frozen : this.vote.endsAt - this.now())), total: this.vote.duration };
    return { endsAt: this.endsAt, paused: this.paused, remaining: this.remaining(), total: this.duration };
  }

  /** Called ~2.5×/s. Returns true when state changed. */
  tick() {
    if (this.finished || this.paused) return false;
    const t = this.now();
    if (this.vote) { if (t >= this.vote.endsAt) { this.advanceVote(); return true; } return false; }
    if (t >= this.endsAt || this.allDone()) { this.advance(); return true; }
    return this.pendingVotes();
  }
  allDone() {
    const act = this.list();
    if (this.phase === 'card' && this.card && !this.card.brief) return act.every((p) => this.card.votes.has(p.id));
    if (this.phase === 'propose') return !!this.proposal;
    if (this.phase === 'teamVote') return act.every((p) => this.teamVotes.has(p.id));
    if (this.phase === 'mission') return (this.proposal || []).every((id) => this.missionCards.has(id));
    return false;
  }

  advance() {
    switch (this.phase) {
      case 'story': return this.startDay(1);
      case 'card':
        if (this.card && !this.card.brief) this.resolveCard();
        if (this.checkWin()) return;
        return this.isMissionDay() ? this.enter('propose', T.propose) : this.enter('day', T.day);
      case 'day':
        if (!this.project && this.offers.length) this.chooseProject(this.offers[0].id, null);
        return this.enter('night', T.night);
      case 'propose':
        if (!this.proposal) this.proposal = shuffle(this.missionPool()).slice(0, this.teamSize());
        return this.enter('teamVote', T.teamVote);
      case 'teamVote': return this.resolveTeamVote();
      case 'mission': this.resolveMission(); if (this.finished) return; return this.enter('night', T.missionNight);
      case 'night':
        this.resolveNight();
        if (this.checkWin()) return;
        if (this.cfg.days && this.day >= this.cfg.days) return this.endByTime();
        return this.startDay(this.day + 1);
      default: return undefined;
    }
  }

  startDay(d) {
    this.day = d;
    this.reports.clear(); this.motions.clear(); this.heartsUsed.clear(); this.analyzed.clear(); this.newsPosted.clear();
    this.donatedToday.clear(); this.angelUsed.clear(); this.nightActs.clear();
    this.rejects = 0; this.proposal = null; this.teamVotes.clear(); this.missionCards.clear(); this.lastTeamVote = null;
    this.reporters.clear();
    for (const p of this.list()) {
      p.secret.gain = { eco: 0, acc: 0 };
      if (d > 1) {
        this.addWill(p, 3); // morning sun
        this.addStat(p, 'str', STATS.str.regen);
        this.addStat(p, 'eco', p.role === 'student' ? STATS.eco.studentDaily : STATS.eco.daily);
      }
    }
    this.updateAct();
    if (d === 1) { this.card = { brief: true, pages: briefing(this.mode) }; return this.enter('card', T.card); }
    const crisisOk = !this.calmNext && (this.cfg.days ? d / this.cfg.days >= 0.4 : d >= 5);
    this.calmNext = false;
    let i = this.deck.findIndex((c) => crisisOk || c.tier !== 'crisis');
    if (i < 0) { this.deck = shuffle(SCENARIOS.filter((c) => c.modes.includes(this.mode))); i = 0; }
    const card = this.deck.splice(i, 1)[0];
    this.card = { card, votes: new Map(), result: null };
    this.enter('card', T.card);
  }
  updateAct() {
    const frac = this.cfg.days ? (this.day - 1) / this.cfg.days : this.day >= 12 ? 0.7 : this.day >= 6 ? 0.4 : 0;
    const a = [...STORY.acts].reverse().find((x) => frac >= x.at);
    if (a && a !== this.act) { this.act = a; this.pub(`${a.th}: ${a.text}`, 'story'); }
  }

  // ───────── scenario card ─────────
  resolveCard() {
    const c = this.card; if (!c || c.result) return;
    const tally = Object.fromEntries(c.card.choices.map((x) => [x.id, 0]));
    const voters = Object.fromEntries(c.card.choices.map((x) => [x.id, []]));
    for (const [pid, ch] of c.votes) {
      const w = ['rep', 'celeb'].includes(this.roleOf(pid)) ? 2 : 1;
      tally[ch] += w; voters[ch].push(pid);
    }
    const max = Math.max(...Object.values(tally));
    let winners = c.card.choices.filter((x) => tally[x.id] === max);
    const choice = winners.length === 1 ? winners[0] : pick(winners);
    let fx = { ...choice.fx };
    const sum = (x) => Object.values(x.fx).reduce((s, v) => s + v, 0);
    const worst = Math.min(...c.card.choices.map(sum));
    const celeb = this.idsWithRole('celeb')[0];
    let backlash = false;
    if (celeb && voters[choice.id].includes(celeb) && sum(choice) === worst && worst < 0) {
      backlash = true; for (const k of Object.keys(fx)) if (fx[k] < 0) fx[k] *= 2;
    }
    if (!c.votes.size) fx = Object.fromEntries(Object.entries(choice.fx).map(([k, v]) => [k, v > 0 ? 0 : v])); // nobody chose: only the bad part sticks
    if (c.compromise) fx = Object.fromEntries(Object.entries(fx).map(([k, v]) => [k, v < 0 ? Math.trunc(v / 2) : v]));
    this.applyStatus(fx, `ไพ่ "${c.card.title}" → ${choice.label}${backlash ? ' (Backlash จากเซเลบ)' : ''}${c.compromise ? ' (ประนีประนอม ผลเสียลดครึ่ง)' : ''}`);
    c.result = { choiceId: choice.id, label: choice.label, tally, backlash, none: !c.votes.size, compromise: !!c.compromise };
    for (const p of this.list()) { const v = c.votes.get(p.id); if (v) this.diary(p, `ไพ่ "${c.card.title}": คุณเลือก "${c.card.choices.find((x) => x.id === v).label}"`, 'choice'); }
  }

  // ───────── missions ─────────
  teamSize() { return Math.min(3, Math.max(2, this.missionPool().length - 2)); }
  missionPool() { const ok = this.order.filter((id) => !this.excluded.has(id)); return ok.length >= 4 ? ok : this.order; }
  leaderId() { return this.order[this.leaderIx % this.n]; }
  on_propose() { this.proposal = null; this.teamVotes.clear(); }
  resolveTeamVote() {
    for (const id of this.teamVotes.keys()) this.addStat(this.P(id), 'acc', STATS.acc.vote);
    const yes = [...this.teamVotes.values()].filter(Boolean).length;
    const total = this.n, abstain = total - this.teamVotes.size;
    const approve = yes + abstain;              // silence = consent, so the game never stalls
    const passed = approve > total / 2;
    this.lastTeamVote = { yes: approve, no: total - approve, passed };
    this.leaderIx++;
    if (passed || this.rejects + 1 >= MAX_REJECTS) {
      if (!passed) { this.pub(`ทีมทูตไม่ผ่าน ${MAX_REJECTS} ครั้ง ทีมสุดท้ายถูกส่งไปโดยบังคับ`, 'bad'); this.applyStatus({ cooperation: -2 }, 'ความขัดแย้งในสภา'); }
      this.missionCards.clear();
      return this.enter('mission', T.mission);
    }
    this.rejects++;
    this.pub(`ทีมทูตไม่ผ่านการโหวต (${this.rejects}/${MAX_REJECTS}) ผู้นำคนถัดไปเสนอใหม่`);
    return this.enter('propose', T.propose);
  }
  resolveMission() {
    const cards = (this.proposal || []).map((id) => this.missionCards.get(id) || 'coop');
    const sabotage = cards.filter((c) => c === 'sabotage').length;
    const success = sabotage === 0;
    this.missions.push({ day: this.day, success, sabotage });
    this.lastReveal = { success, sabotage, cards: shuffle(cards), day: this.day };
    if (success) {
      const r = Math.round(MISSION_RESOURCE * this.costScale);
      this.treasury += r;
      this.pub(`ภารกิจทูตสำเร็จ! ได้ทรัพยากร ${r} เข้าคลังส่วนกลาง`, 'good');
      this.applyStatus({ cooperation: 3 }, 'ภารกิจทูตสำเร็จ');
    } else {
      this.pub(`ภารกิจทูตล้มเหลว (การ์ดขัดขวาง ${sabotage} ใบ)`, 'bad');
      this.applyStatus({ trust: -3 }, 'ภารกิจทูตล้มเหลว');
    }
    for (const id of this.proposal) {
      this.diary(this.P(id), `ไปภารกิจทูต: ${success ? `สำเร็จ · เศรษฐกิจ +${this.addStat(this.P(id), 'eco', STATS.eco.mission)}` : 'ล้มเหลว'}`, 'mission');
    }
    if (this.excluded.size) { this.excluded.clear(); }
    this.checkWin();
  }

  // ───────── night ─────────
  nightAction(p) {
    const s = p.secret, t = TRAITS[s.trait];
    if (!t.action || s.silenced || s.will <= 0) return null;
    if (t.limit && s.uses >= t.limit) return null;
    if (t.every && this.day - s.lastUse < t.every) return null;
    return t.action;
  }
  /** id of the player this action may not pick tonight (same target twice in a row) */
  notTarget(p) {
    const t = TRAITS[p.secret.trait];
    return t.action === 'protect' || t.kind === 'exclude' ? p.secret.lastTarget : null;
  }
  on_night() {
    for (const [tid, by] of this.recruitOffers) { // unanswered offers expire = refused
      this.diary(this.P(by), `${this.name(tid)} ไม่ตอบรับคำชวน`, 'night');
      this.diary(this.P(tid), 'คุณไม่ได้ตอบรับคำชวนเข้าแก๊ง คำชวนหมดอายุแล้ว', 'info');
    }
    this.recruitOffers.clear();
  }
  resolveNight() {
    const acts = [...this.nightActs.entries()].map(([key, a]) => ({ ...a, by: a.by || key, p: this.P(a.by || key), t: a.target ? this.P(a.target) : null }));
    const of = (...kinds) => acts.filter((a) => kinds.includes(a.action) && a.p);
    const dawn = { bullied: [], blocked: 0, healed: 0, events: [], excluded: [] };
    const victims = [];                       // { name, type } for ช่างสังเกต
    const actorsDone = [];                    // { name, what } for ตื่นตัว
    const redsTouched = new Set();            // ids targeted by red actions (ตื่นตัว exposure)
    const use = (a) => { a.p.secret.uses++; a.p.secret.lastUse = this.day; };
    const hidden = new Set(of('hide').map((a) => { use(a); a.p.secret.lastTarget = null; this.diary(a.p, 'คืนนี้คุณซ่อนตัว ไม่มีใครทำอะไรคุณได้', 'night'); return a.by; }));
    const reach = (a) => a.t && !hidden.has(a.t.id);
    // 1) pressure (ชอบบงการ) — blocks the target's helping skills tonight
    const pressured = new Set();
    for (const a of of('pressure')) {
      a.p.secret.lastTarget = a.target; redsTouched.add(a.target);
      if (!reach(a)) { this.diary(a.p, `คุณหา ${a.t?.nickname} ไม่เจอ`, 'night'); continue; }
      pressured.add(a.target); actorsDone.push({ id: a.by, what: 'กดดันใครบางคน' });
      this.diary(a.p, `คุณกดดัน ${a.t.nickname}`, 'night');
    }
    const HELP = new Set(['restore', 'protect', 'brave', 'angel', 'convert']);
    const blockedHelp = (a) => HELP.has(a.action) && pressured.has(a.by);
    for (const a of acts) if (blockedHelp(a)) this.diary(a.p, 'เมื่อคืนคุณรู้สึกถูกกดดัน จึงช่วยใครไม่ได้', 'hurt');
    // 2) protection
    const protectedIds = new Set(), braveBy = new Map();
    for (const a of of('protect')) { if (blockedHelp(a)) continue; a.p.secret.lastTarget = a.target; if (reach(a)) protectedIds.add(a.target); a.p.secret.helped = true; this.diary(a.p, `คุณปกป้อง ${a.t?.nickname}`, 'night'); actorsDone.push({ id: a.by, what: 'ปกป้องใครบางคน' }); }
    for (const a of of('brave')) { if (blockedHelp(a)) continue; use(a); this.addWill(a.p, -10); a.p.secret.helped = true; if (reach(a)) braveBy.set(a.target, a.p); actorsDone.push({ id: a.by, what: 'ยืนเฝ้าเพื่อนอย่างกล้าหาญ' }); }
    // 3) bullying + rumours
    const bulliesTonight = new Set();
    for (const a of of('bully', 'rumor')) {
      const kind = a.action === 'rumor' ? 'rumor' : TRAITS[a.p.secret.trait].kind, fx = BULLY_FX[kind];
      if (a.action === 'rumor') use(a);
      a.p.secret.lastTarget = a.target; bulliesTonight.add(a.by); redsTouched.add(a.target);
      actorsDone.push({ id: a.by, what: a.action === 'rumor' ? 'ปล่อยข่าวลือ' : 'ออกไปรังแกคนอื่น' });
      if (!reach(a)) { this.diary(a.p, `คุณหา ${a.t?.nickname ?? 'เป้าหมาย'} ไม่เจอ`, 'night'); continue; }
      const target = a.t;
      if (braveBy.has(target.id)) {
        dawn.blocked++; dawn.events.push(`มีคนกล้าหาญหยุดการรังแก${fx.typeTh}ได้ทัน`);
        this.diary(braveBy.get(target.id), `คุณหยุดการรังแก${fx.typeTh}ต่อ ${target.nickname} ได้`, 'help');
        this.diary(a.p, `คุณเล็ง ${target.nickname} แต่มีคนกล้าหาญเข้ามาหยุด`, 'night'); continue;
      }
      if (protectedIds.has(target.id)) { dawn.blocked++; this.diary(target, 'เมื่อคืนมีคนปกป้องคุณจากการรังแก', 'help'); this.diary(a.p, `คุณเล็ง ${target.nickname} แต่มีคนปกป้องไว้`, 'night'); continue; }
      const d = this.addStat(target, fx.stat, -fx.amount);
      this.applyStatus(fx.status, fx.th);
      target.secret.wasBullied = true;
      dawn.bullied.push(target.nickname); victims.push({ name: target.nickname, type: fx.typeTh });
      const statTh = fx.stat === 'will' ? 'พลังใจ' : STATS[fx.stat].th;
      let note = `เมื่อคืน${fx.th.replace('มีคน', 'คุณ')} ${statTh} ${d}`;
      if (kind === 'physical') note += ` · คุณเห็นเสื้อสี${SHIRT_TH[a.p.avatar?.shirt] || 'เข้ม'}แวบ ๆ`;
      if (kind === 'exclude') { this.excluded.add(target.id); dawn.excluded.push(target.nickname); note += ' · ไปภารกิจทูตรอบหน้าไม่ได้'; }
      if (kind === 'rumor') { const text = `ข่าวลือเกี่ยวกับ ${target.nickname} แพร่ไปทั่วโรงเรียน`; this.news.unshift({ day: this.day, text }); this.news = this.news.slice(0, 5); this.pub(`📰 ${text}`, 'news'); }
      this.diary(target, note, 'hurt');
      this.diary(a.p, `คุณ${kind === 'rumor' ? 'ปล่อยข่าวลือเกี่ยวกับ' : 'รังแก'} ${target.nickname}`, 'night');
    }
    // 4) other skills
    for (const a of acts) {
      if (!a.p || blockedHelp(a)) continue;
      const p = a.p, target = a.t;
      if (a.action === 'restore' || a.action === 'angel') {
        if (a.action === 'restore') use(a);
        p.secret.helped = true; actorsDone.push({ id: a.by, what: 'ดูแลใจเพื่อน' });
        if (!reach(a)) { this.diary(p, `คุณหา ${target?.nickname} ไม่เจอ`, 'night'); continue; }
        const v = a.action === 'restore' ? WILL.max - target.secret.will : WILL.gangHeal;
        this.addWill(target, v); dawn.healed++;
        this.diary(target, a.action === 'restore' ? 'มีคนดูแลใจคุณ พลังใจเต็มหลอด' : `มีคนดูแลใจคุณ พลังใจ +${v}`, 'help');
        this.diary(p, `คุณดูแล ${target.nickname}`, 'help');
      }
      if (a.action === 'investigate') {
        if (TRAITS[p.secret.trait].every) p.secret.lastUse = this.day;
        actorsDone.push({ id: a.by, what: 'สืบหาความจริง' });
        if (!reach(a)) { this.diary(p, `คุณหา ${target?.nickname} ไม่เจอ`, 'night'); continue; }
        this.diary(p, `คุณสืบได้ว่า ${target.nickname} อยู่${COLORS[this.apparentColor(target)].th}`, 'info');
      }
      if (a.action === 'convert') {
        use(a); p.secret.used = true; actorsDone.push({ id: a.by, what: 'ชวนเพื่อนเปลี่ยนใจ' });
        if (!reach(a)) { this.diary(p, `คุณหา ${target?.nickname} ไม่เจอ ความสามารถถูกใช้ไปแล้ว`, 'night'); continue; }
        const was = target.secret.color;
        if (was === 'blue') this.diary(p, `${target.nickname} เป็นสีน้ำเงินอยู่แล้ว การเปลี่ยนแปลงไม่ได้ผล`, 'info');
        else {
          if (was === 'red') target.secret.knownRed = this.order.filter((id) => this.P(id).secret.color === 'red' && id !== target.id);
          target.secret.color = 'blue'; target.secret.trait = 'reformed';
          this.diary(target, 'มีคนทำให้คุณเปลี่ยนใจ ตอนนี้คุณเป็นสีน้ำเงิน (คุณลักษณะ: กลับใจ)', 'help');
          this.diary(p, `คุณเปลี่ยน ${target.nickname} ให้เป็นสีน้ำเงินได้สำเร็จ`, 'help');
          dawn.events.push('มีคนหนึ่งในโรงเรียนเปลี่ยนใจกลับมาช่วยโรงเรียน');
        }
      }
      if (a.action === 'recruit') {
        use(a); redsTouched.add(a.target); actorsDone.push({ id: a.by, what: 'ชวนใครบางคนเข้ากลุ่ม' });
        if (!reach(a)) { this.diary(p, `คุณหา ${target?.nickname} ไม่เจอ ความสามารถถูกใช้ไปแล้ว`, 'night'); continue; }
        if (target.secret.color === 'red') { this.diary(p, `${target.nickname} อยู่สีแดงอยู่แล้ว`, 'info'); continue; }
        if (target.secret.acc >= STATS.acc.lonely) { this.diary(p, `${target.nickname} มีเพื่อนยอมรับมากพอ ชวนไม่สำเร็จ`, 'info'); continue; }
        this.recruitOffers.set(target.id, p.id);
        this.diary(target, 'มีคนชวนคุณเข้าแก๊งสีแดง ตอบรับหรือปฏิเสธได้ในแท็บ "ตอนนี้" ก่อนหมดวัน', 'info');
        this.diary(p, `คุณส่งคำชวนถึง ${target.nickname} แล้ว รอคำตอบ`, 'night');
      }
    }
    if (dawn.healed) this.applyStatus({ wellbeing: 1 }, 'การดูแลกันในยามค่ำคืน');
    // ตื่นตัว exposed if a red skill touched them
    for (const id of redsTouched) {
      const t = this.P(id); if (!t || t.secret.trait !== 'alert' || t.secret.exposed) continue;
      t.secret.exposed = true;
      for (const r of this.list().filter((x) => x.secret.color === 'red')) this.diary(r, `แก๊งรู้แล้วว่า ${t.nickname} คือคนที่ตื่นตัว คอยดูว่าใครทำอะไรตอนกลางคืน`, 'info');
    }
    // morning info for passive traits
    for (const p of this.list()) {
      const tr = TRAITS[p.secret.trait];
      if (!tr.passive || p.secret.silenced || p.secret.will <= 0) continue;
      if (tr.passive === 'victims') this.diary(p, victims.length ? `เช้านี้คุณสังเกตเห็น: ${victims.map((v) => `${v.name} (${v.type})`).join(', ')}` : 'เช้านี้คุณไม่เห็นใครถูกรังแก', 'info');
      if (tr.passive === 'actor') {
        const pool = actorsDone.filter((x) => x.id !== p.id);
        const x = pool.length ? pick(pool) : null;
        this.diary(p, x ? `เมื่อคืนคุณเห็น ${this.name(x.id)} ${x.what}` : 'เมื่อคืนคุณไม่เห็นใครออกไปทำอะไร', 'info');
      }
    }
    // the curse of moonlight
    for (const p of this.list()) this.addWill(p, -WILL.curse);
    const blues = this.list().filter((p) => p.secret.color === 'blue');
    const low = blues.filter((p) => p.secret.will < WILL.low).length;
    if (low >= 3) this.applyStatus({ wellbeing: -3 }, `ฝ่ายดีหมดแรงใจ ${low} คน`);
    else if (blues.length && blues.reduce((s, p) => s + p.secret.will, 0) / blues.length >= 70) this.applyStatus({ wellbeing: 1 }, 'ทุกคนยังมีแรงใจ');
    this.lastNightBullies = bulliesTonight;
    this.dawn = { day: this.day, ...dawn };
    this.pub(dawn.bullied.length ? `คืนที่ ${this.day}: มีคนถูกรังแก ${dawn.bullied.length} คน${dawn.blocked ? ` · ป้องกันได้ ${dawn.blocked}` : ''}` : `คืนที่ ${this.day}: ไม่มีใครถูกรังแก${dawn.blocked ? ` (ป้องกันได้ ${dawn.blocked})` : ''}`, dawn.bullied.length ? 'bad' : 'good');
    for (const e of dawn.events) this.pub(e, 'good');
    this.nightActs = new Map();
  }

  // ───────── projects ─────────
  refreshOffers() {
    const doneSet = new Set(this.projectsDone);
    const pool = PROJECTS.filter((p) => !doneSet.has(p.id) && !(p.size === 'huge' && doneSet.has(p.id)));
    const missingAreas = new Set(STATUS_KEYS.filter((k) => !this.frontA()[k]));
    const prefer = shuffle(pool.filter((p) => missingAreas.has(p.area)));
    const others = shuffle(pool.filter((p) => !missingAreas.has(p.area)));
    this.offers = [...prefer.slice(0, 2), ...others, ...prefer.slice(2)].slice(0, PROJECT_OFFERS).map((p) => ({ ...p, cost: Math.round(PROJECT_COST[p.size] * this.costScale) }));
  }
  frontA() {
    const out = Object.fromEntries(STATUS_KEYS.map((k) => [k, false]));
    for (const id of this.projectsDone) out[PROJECTS.find((p) => p.id === id).area] = true;
    return out;
  }
  chooseProject(id, by) {
    const o = this.offers.find((x) => x.id === id); if (!o) return 'bad_project';
    this.project = { ...o, funded: 0, donors: new Map() };
    this.offers = [];
    this.pub(`${by ? `${this.name(by)} (ประธาน)` : 'ระบบ'} เปิดโครงการ "${o.th}" ต้องการ ${o.cost}`);
    return null;
  }
  fund(amount, who) {
    const pr = this.project; if (!pr) return;
    pr.funded += amount;
    if (who) pr.donors.set(who, (pr.donors.get(who) || 0) + amount);
    if (pr.funded >= pr.cost) {
      this.projectsDone.push(pr.id);
      this.applyStatus(pr.fx, `โครงการ "${pr.th}" สำเร็จ`);
      for (const p of this.list()) this.addWill(p, PROJECT_DONE_WILL);
      this.project = null;
      this.refreshOffers();
      this.checkWin();
    }
  }

  // ───────── vote sessions ─────────
  canOpenVote() { return CLOCK_PHASES.has(this.phase) && !this.vote && !this.finished && this.now() >= this.voteCooldownUntil; }
  openVote(kind, by, reason) {
    this.vote = { kind, by, reason, reporters: by ? [] : [...this.reporters], stage: 'talk', duration: T.voteTalk * 1000, endsAt: this.now() + T.voteTalk * 1000, frozenMain: this.remaining(), ballots: new Map(), result: null };
    const label = kind === 'punish' ? 'โหวตหาคนต้องสงสัย' : 'ญัตติอภิปรายไม่ไว้วางใจประธาน';
    this.pub(`${label} เปิดโดย${by ? ` ${this.name(by)} (ประธาน)` : 'การแจ้งเหตุร่วมกัน'}${reason ? ` · เหตุผล: ${reason}` : ''}`, 'vote');
  }
  advanceVote() {
    const v = this.vote;
    if (v.stage === 'talk') { v.stage = 'cast'; v.duration = T.voteCast * 1000; v.endsAt = this.now() + v.duration; return; }
    if (v.stage === 'cast') { this.resolveVote(); v.stage = 'result'; v.duration = T.voteResult * 1000; v.endsAt = this.now() + v.duration; this.voteCooldownUntil = this.now() + T.voteCooldown * 1000; return; }
    // result shown → resume main clock
    this.endsAt = this.now() + (v.frozenMain || 0);
    this.vote = null;
    this.checkWin();
  }
  resolveVote() {
    const v = this.vote;
    if (v.kind === 'punish') {
      const tally = new Map();
      for (const t of v.ballots.values()) if (t) tally.set(t, (tally.get(t) || 0) + 1);
      const abstain = this.n - [...v.ballots.values()].filter(Boolean).length;
      const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
      const top = sorted[0], second = sorted[1];
      const rows = sorted.map(([id, c]) => ({ name: this.name(id), votes: c }));
      if (!top || (second && second[1] === top[1]) || abstain >= top[1]) {
        v.result = { rows, abstain, silenced: null, text: !top || abstain >= top[1] ? 'ไม่ลงคะแนนมากที่สุด ไม่มีใครถูกตัดความสามารถ' : 'คะแนนเท่ากัน ไม่มีใครถูกตัดความสามารถ' };
      } else {
        const p = this.P(top[0]);
        p.secret.silenced = true; p.secret.punished = true;
        this.silenced.push(p.nickname);
        for (const id of v.reporters) { const r = this.P(id); if (r) this.diary(r, `การแจ้งเหตุของคุณนำไปสู่ผลโหวต · การยอมรับ +${this.addStat(r, 'acc', STATS.acc.report)}`, 'help'); }
        this.diary(p, 'คุณถูกโหวต ใช้ความสามารถของคุณลักษณะไม่ได้อีกจนจบเกม', 'hurt');
        v.result = { rows, abstain, silenced: p.nickname, text: `${p.nickname} ถูกตัดความสามารถของคุณลักษณะจนจบเกม` };
      }
    } else {
      const yes = [...v.ballots.values()].filter((b) => b === 'yes').length;
      const no = [...v.ballots.values()].filter((b) => b === 'no').length;
      const pres = this.presidentId();
      const passed = yes > no && yes >= 3 && pres;
      v.result = { yes, no, passed: !!passed, text: passed ? `ญัตติผ่าน! ${this.name(pres)} พ้นจากตำแหน่งประธาน` : 'ญัตติไม่ผ่าน ประธานคนเดิมยังอยู่' };
      if (passed) {
        this.P(pres).role = 'student'; this.P(pres).removed = true;
        this.diary(this.P(pres), 'คุณถูกถอดจากตำแหน่งประธาน ตอนนี้เป็นนักเรียนทั่วไป', 'hurt');
        const vice = this.idsWithRole('vice')[0];
        if (vice) { this.P(vice).role = 'president'; this.P(vice).acting = true; v.result.text += ` · ${this.name(vice)} เป็นรักษาการประธาน`; }
        this.applyStatus({ trust: -2 }, 'การเปลี่ยนผู้นำ');
      }
    }
    for (const id of v.ballots.keys()) if (v.ballots.get(id)) this.addStat(this.P(id), 'acc', STATS.acc.vote);
    this.pub(v.result.text, 'vote');
  }

  // ───────── win ─────────
  checkWin() {
    if (this.finished) return true;
    const low = STATUS_KEYS.filter((k) => this.status[k] <= COLLAPSE_AT).length;
    if (low >= COLLAPSE_COUNT) return this.finish('red', `โรงเรียนพัง: สถานะ ${low} ด้านลดลงถึง ${COLLAPSE_AT}`);
    if (this.cfg.missions) {
      const fails = this.missions.filter((m) => !m.success).length;
      if (fails >= this.cfg.failLimit) return this.finish('red', `ภารกิจทูตล้มเหลว ${fails} ครั้ง`);
    }
    const okMissions = !this.cfg.missions || this.missions.filter((m) => m.success).length >= this.cfg.needSuccess;
    const fa = Object.values(this.frontA()).every(Boolean);
    if (fa && okMissions) return this.finish('blue', 'สร้างโรงเรียนปลอดภัยได้ครบ 5 ด้าน แสงพระอาทิตย์กลับมาแล้ว');
    if (this.mode === 'marathon' && okMissions && this.avg() >= this.cfg.marathonAvg) return this.finish('blue', `ภารกิจทูตสำเร็จครบและสถานะเฉลี่ย ${this.avg()}`);
    return false;
  }
  endByTime() {
    const a = this.avg();
    if (a >= this.cfg.endAvg) return this.finish('blue', `ครบ ${this.cfg.days} วัน สถานะเฉลี่ย ${a} ถึงเป้า ${this.cfg.endAvg}`);
    return this.finish('red', `ครบ ${this.cfg.days} วัน สถานะเฉลี่ย ${a} ไม่ถึงเป้า ${this.cfg.endAvg}`);
  }
  finish(color, reason) {
    this.finished = true; this.vote = null;
    this.winner = { color, th: COLORS[color].th, reason };
    this.yellow = this.list().filter((p) => p.secret.color === 'yellow').map((p) => {
      const t = p.secret.trait;
      const s = p.secret;
      const won = t === 'newsie' ? s.will >= WILL.low
        : t === 'timid' ? !s.wasBullied && !s.helped
        : t === 'craver' ? s.acc >= STATS.acc.craverWin
        : t === 'peaceful' ? STATUS_KEYS.every((k) => this.status[k] >= 30)
        : t === 'attention' ? !!s.punished : false;
      return { id: p.id, won };
    });
    this.phase = 'end'; this.endsAt = this.now();
    this.pub(`จบเกม: ${COLORS[color].th}ชนะ · ${reason}`, color === 'blue' ? 'good' : 'bad');
    return true;
  }
  won(p) {
    if (!this.finished) return false;
    if (p.secret.color === 'yellow') return !!this.yellow.find((y) => y.id === p.id)?.won;
    return p.secret.color === this.winner.color;
  }
  topPairs() {
    return [...this.pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, h]) => { const [a, b] = k.split('|'); return { a: this.name(a), b: this.name(b), hearts: h }; });
  }

  // ───────── player actions ─────────
  playerAction(p, d) {
    if (this.finished) return d.type === 'reflect' ? this.reflect(p, d) : 'game_over';
    const s = p.secret, type = d.type, t = this.P(d.target);
    const freeOk = CLOCK_PHASES.has(this.phase) && !this.vote;
    switch (type) {
      case 'cardVote': {
        if (this.phase !== 'card' || !this.card || this.card.brief) return 'wrong_phase';
        if (!this.card.card.choices.some((c) => c.id === d.choice)) return 'bad_choice';
        this.card.votes.set(p.id, d.choice); return null;
      }
      case 'propose': {
        if (this.phase !== 'propose' || this.leaderId() !== p.id) return 'not_leader';
        const team = [...new Set(Array.isArray(d.team) ? d.team : [])].filter((id) => this.P(id));
        if (team.length !== this.teamSize()) return 'bad_team';
        if (team.some((id) => this.excluded.has(id)) && this.missionPool() !== this.order) return 'excluded';
        this.proposal = team; this.pub(`${p.nickname} เสนอทีมทูต: ${team.map((id) => this.name(id)).join(', ')}`); return null;
      }
      case 'teamVote': if (this.phase !== 'teamVote') return 'wrong_phase'; this.teamVotes.set(p.id, !!d.approve); return null;
      case 'missionCard': {
        if (this.phase !== 'mission') return 'wrong_phase';
        if (!(this.proposal || []).includes(p.id)) return 'not_on_team';
        if (!['coop', 'sabotage'].includes(d.card)) return 'bad_card';
        if (d.card === 'sabotage' && s.color !== 'red') return 'not_allowed';
        this.missionCards.set(p.id, d.card); return null;
      }
      case 'night': {
        if (this.phase !== 'night' || this.vote) return 'wrong_phase';
        const action = this.nightAction(p);
        if (!action) return 'no_skill';
        if (action === 'hide') { this.nightActs.set(p.id, { action, target: null }); return null; }
        if (!t || t.id === p.id) return 'bad_target';
        if (this.notTarget(p) === t.id) return 'same_target';
        this.nightActs.set(p.id, { action, target: t.id }); return null;
      }
      case 'angel': {
        if (this.phase !== 'night' || this.vote) return 'wrong_phase';
        if (this.roleOf(p.id) !== 'angel' || this.angelUsed.has(p.id)) return 'no_skill';
        if (!t || t.id === p.id) return 'bad_target';
        this.angelUsed.add(p.id);
        this.nightActs.set(`angel:${p.id}`, { action: 'angel', target: t.id, by: p.id });
        return null;
      }
      case 'heart': {
        if (!freeOk && this.phase !== 'card') return 'wrong_phase';
        if (!t || t.id === p.id) return 'bad_target';
        const cap = HEARTS_PER_DAY + (this.roleOf(p.id) === 'student' ? 1 : 0);
        const used = this.heartsUsed.get(p.id) || 0; if (used >= cap) return 'no_hearts';
        this.heartsUsed.set(p.id, used + 1);
        const k = pairKey(p.id, t.id); this.pairs.set(k, (this.pairs.get(k) || 0) + 1);
        t.secret.heartsReceived++; s.helped = true;
        this.addStat(p, 'acc', STATS.acc.heartGive);
        this.addStat(t, 'acc', STATS.acc.heartGet * (t.secret.trait === 'craver' ? 2 : 1));
        this.diary(t, `${p.nickname} ส่งหัวใจให้คุณ ❤`, 'help'); return null;
      }
      case 'pairCard': {
        if (!freeOk) return 'wrong_phase';
        if (!t || t.id === p.id) return 'bad_target';
        const k = pairKey(p.id, t.id);
        if ((this.pairs.get(k) || 0) < PAIR_UNLOCK || this.pairUsed.has(k)) return 'locked';
        const req = this.pairReq.get(k);
        if (!req) { this.pairReq.set(k, p.id); this.diary(t, `${p.nickname} ชวนใช้ "${PAIR_CARD.th}" กดยืนยันในแท็บความสัมพันธ์`, 'help'); return null; }
        if (req === p.id) return 'waiting_partner';
        this.pairUsed.add(k); this.pairReq.delete(k);
        this.addWill(p, PAIR_CARD.will); this.addWill(t, PAIR_CARD.will); s.helped = true; t.secret.helped = true;
        for (const x of [p, t]) this.addStat(x, 'acc', STATS.acc.pair * (x.secret.trait === 'craver' ? 2 : 1));
        this.applyStatus(PAIR_CARD.status, `${p.nickname} และ ${t.nickname} ใช้${PAIR_CARD.th}`);
        return null;
      }
      case 'report': {
        if (!freeOk) return 'wrong_phase';
        if (this.reports.has(p.id)) return 'already';
        this.reports.set(p.id, this.roleOf(p.id) === 'opposition' ? 2 : 1); this.reporters.add(p.id);
        const sum = [...this.reports.values()].reduce((a, b) => a + b, 0);
        if (sum >= REPORTS_TO_OPEN) {
          if (!this.canOpenVote()) return null; // counted; opens when cooldown ends (see tickReports)
          this.reports.clear(); this.openVote('punish', null, null);
        }
        return null;
      }
      case 'motion': {
        if (!freeOk) return 'wrong_phase';
        if (!this.presidentId() || this.presidentId() === p.id) return 'not_allowed';
        if (this.motions.has(p.id)) return 'already';
        this.motions.set(p.id, this.roleOf(p.id) === 'opposition' ? 2 : 1);
        const sum = [...this.motions.values()].reduce((a, b) => a + b, 0);
        if (sum >= REPORTS_TO_OPEN && this.canOpenVote()) { this.motions.clear(); this.openVote('noconf', null, null); }
        return null;
      }
      case 'callVote': {
        if (this.roleOf(p.id) !== 'president') return 'not_president';
        if (!this.canOpenVote()) return this.vote ? 'vote_active' : 'cooldown';
        const r = REASONS.find((x) => x.id === d.reason); if (!r) return 'bad_reason';
        this.openVote('punish', p.id, r.th); return null;
      }
      case 'ballot': {
        const v = this.vote; if (!v || v.stage !== 'cast') return 'wrong_phase';
        if (v.kind === 'punish') { if (d.target && !t) return 'bad_target'; v.ballots.set(p.id, d.target || null); }
        else { if (!['yes', 'no'].includes(d.choice)) return 'bad_choice'; v.ballots.set(p.id, d.choice); }
        return null;
      }
      case 'chooseProject':
        if (this.roleOf(p.id) !== 'president') return 'not_president';
        if (this.project) return 'project_active';
        return this.chooseProject(d.project, p.id);
      case 'donate': {
        if (!freeOk) return 'wrong_phase';
        if (!this.project) return 'no_project';
        const amt = [5, 10, 15].includes(Number(d.amount)) ? Number(d.amount) : 0;
        if (!amt || s.will < amt) return 'not_enough';
        if (amt > this.donateMax(p)) return 'too_weak';
        if (this.donatedToday.has(p.id) && DONATE_PER_DAY <= 1) return 'already';
        this.addWill(p, -amt);
        this.donatedToday.set(p.id, (this.donatedToday.get(p.id) || 0) + amt);
        s.helped = true;
        let value = amt * (this.roleOf(p.id) === 'vice' ? 1.5 : 1) * ecoMultiplier(s.eco);
        this.addStat(p, 'eco', STATS.eco.donateBack);
        const athletes = this.idsWithRole('athlete').filter((id) => this.donatedToday.has(id)).length;
        if (athletes >= 2) value *= 1.2;
        this.diary(p, `คุณลงขันพลังใจ ${amt} ให้โครงการ "${this.project.th}"`, 'help');
        this.fund(Math.round(value), p.id); return null;
      }
      case 'useTreasury': {
        if (this.roleOf(p.id) !== 'president') return 'not_president';
        if (!this.project) return 'no_project';
        if (this.treasury <= 0) return 'empty';
        const use = Math.min(this.treasury, this.project.cost - this.project.funded);
        this.treasury -= use; this.pub(`ประธานใช้ทรัพยากร ${use} กับโครงการ "${this.project.th}"`, 'good');
        this.fund(use, null); return null;
      }
      case 'analyze': {
        if (!freeOk || this.roleOf(p.id) !== 'academic') return 'no_skill';
        if (this.analyzed.has(p.id)) return 'already';
        if (!t || t.id === p.id) return 'bad_target';
        this.analyzed.add(p.id);
        let truth = this.lastNightBullies.has(t.id);
        if (rnd(10) >= 7) truth = !truth;
        this.diary(p, `ผลวิเคราะห์ (แม่น 70%): เมื่อคืน ${t.nickname} ${truth ? 'น่าจะกลั่นแกล้งคนอื่น' : 'น่าจะไม่ได้ทำร้ายใคร'}`, 'info');
        return null;
      }
      case 'postNews': {
        if (!freeOk || s.trait !== 'newsie' || s.silenced) return 'no_skill';
        if (this.newsPosted.has(p.id)) return 'already';
        const f = NEWS_FORMS.find((x) => x.id === d.form); if (!f || !t) return 'bad_choice';
        this.newsPosted.add(p.id);
        const text = f.text(t.nickname);
        this.news.unshift({ day: this.day, text }); this.news = this.news.slice(0, 5);
        this.pub(`📰 ข่าวนิรนาม: ${text}`, 'news'); return null;
      }
      case 'compromise': {
        if (s.trait !== 'compromise' || s.silenced || s.will <= 0) return 'no_skill';
        if (s.uses >= TRAITS.compromise.limit) return 'used_up';
        if (this.phase !== 'card' || !this.card || this.card.brief || this.card.result) return 'wrong_phase';
        if (this.card.compromise) return 'already';
        this.card.compromise = true; s.uses++;
        this.pub('มีคนเสนอทางประนีประนอม ผลเสียของไพ่วันนี้จะลดลงครึ่งหนึ่ง', 'good');
        this.diary(p, `คุณใช้ประนีประนอม (เหลือ ${TRAITS.compromise.limit - s.uses} ครั้ง)`, 'help'); return null;
      }
      case 'calm': {
        if (s.trait !== 'peaceful' || s.silenced || s.will <= 0) return 'no_skill';
        if (s.uses >= TRAITS.peaceful.limit) return 'used_up';
        if (!freeOk && this.phase !== 'card') return 'wrong_phase';
        s.uses++; this.calmNext = true;
        const lowest = STATUS_KEYS.reduce((m, k) => (this.status[k] < this.status[m] ? k : m), STATUS_KEYS[0]);
        this.applyStatus({ [lowest]: 3 }, 'ความตึงเครียดในโรงเรียนลดลง');
        this.diary(p, 'คุณช่วยลดความตึงเครียด เช้าพรุ่งนี้จะไม่มีไพ่วิกฤต', 'help'); return null;
      }
      case 'recruitAnswer': {
        const by = this.recruitOffers.get(p.id); if (!by) return 'no_offer';
        this.recruitOffers.delete(p.id);
        if (d.accept) {
          s.color = 'red'; s.trait = 'recruited';
          this.diary(p, 'คุณตอบรับคำชวน ตอนนี้คุณอยู่สีแดง (คุณลักษณะ: ถูกชักจูง)', 'info');
          this.diary(this.P(by), `${p.nickname} ตอบรับคำชวน เข้าแก๊งแล้ว`, 'night');
        } else {
          this.diary(p, 'คุณปฏิเสธคำชวนเข้าแก๊ง', 'help');
          this.diary(this.P(by), `${p.nickname} ปฏิเสธคำชวน`, 'night');
        }
        return null;
      }
      default: return 'bad_action';
    }
  }
  donateMax(p) {
    if (p.secret.str < STATS.str.low) return 5;
    return p.secret.eco >= STATS.eco.rich ? 15 : 10;
  }
  reflect(p, d) {
    if (!Array.isArray(d.answers)) return 'bad_answers';
    p.reflection = d.answers.slice(0, 5).map((a) => cleanText(String(a ?? ''), 300));
    return null;
  }

  /** reports that crossed the threshold during a cooldown open the vote once allowed */
  pendingVotes() {
    if (!this.canOpenVote()) return false;
    const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
    if (sum(this.reports) >= REPORTS_TO_OPEN) { this.reports.clear(); this.openVote('punish', null, null); return true; }
    if (sum(this.motions) >= REPORTS_TO_OPEN && this.presidentId()) { this.motions.clear(); this.openVote('noconf', null, null); return true; }
    return false;
  }

  // ───────── host ─────────
  hostCommand(d) {
    const t = this.now();
    switch (d.type) {
      case 'pause':
        if (this.paused) return { ok: true };
        this.paused = true;
        if (this.vote) this.vote.frozen = Math.max(0, this.vote.endsAt - t); else this.frozen = Math.max(0, this.endsAt - t);
        return { ok: true };
      case 'resume':
        if (!this.paused) return { ok: true };
        this.paused = false;
        if (this.vote) this.vote.endsAt = t + (this.vote.frozen || 0); else this.endsAt = t + (this.frozen || 0);
        return { ok: true };
      case 'next':
        if (this.finished) return { ok: false, error: 'game_over' };
        if (this.vote) { this.vote.endsAt = t; this.advanceVote(); return { ok: true }; }
        this.paused = false; this.advance(); return { ok: true };
      case 'addTime': {
        const ms = Math.min(120, Math.max(5, Number(d.seconds) || 30)) * 1000;
        if (this.vote) this.vote.endsAt += ms; else if (this.paused) this.frozen += ms; else this.endsAt += ms;
        return { ok: true };
      }
      case 'endGame':
        if (this.finished) return { ok: false, error: 'game_over' };
        if (this.cfg.days || this.mode === 'marathon') { const a = this.avg(); this.finish(a >= (this.cfg.endAvg || this.cfg.marathonAvg) ? 'blue' : 'red', `ผู้ดูแลห้องจบเกม สถานะเฉลี่ย ${a}`); }
        return { ok: true };
      default: return { ok: false, error: 'bad_command' };
    }
  }

  phaseTh() {
    if (this.phase === 'card' && this.card?.brief) return PHASE_TH.brief;
    return PHASE_TH[this.phase] || this.phase;
  }
  timeOfDay() { return this.phase === 'night' ? 'night' : this.phase === 'story' ? 'night' : 'day'; }
}

export { PHASE_TH, ROLES };
