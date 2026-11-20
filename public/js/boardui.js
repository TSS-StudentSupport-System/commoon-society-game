// Projector board HUD (v0.4): day clock, school status, Front A projects, missions, scenario card, votes, end screen.
import { el, $, timerRemaining, fmtTime, setTheme, now } from './common.js';
import { drawAvatar } from './pixel.js';
import { SchoolScene } from './scene.js';

const AREA = { safety: '🛡', trust: '🤝', belonging: '🏠', cooperation: '🧩', wellbeing: '💚' };
const AREA_TH = { safety: 'ปลอดภัย', trust: 'ไว้วางใจ', belonging: 'เป็นส่วนหนึ่ง', cooperation: 'ร่วมมือ', wellbeing: 'สุขภาวะ' };
const SIZE_TH = { small: 'เล็ก', large: 'ใหญ่', huge: 'ใหญ่มาก' };
const avatar = (av) => { const c = el('canvas', { class: 'av' }); drawAvatar(c, av); return c; };
export const fxText = (fx) => Object.entries(fx || {}).map(([k, v]) => `${AREA[k]} ${v > 0 ? '+' : ''}${v}`).join('  ');

export class BoardView {
  constructor(stage, { audio = null } = {}) {
    this.stage = stage;
    this.audio = audio; this.prev = null; this.lastTickSec = null;
    const canvas = el('canvas', { class: 'scene', 'aria-hidden': 'true' });
    stage.append(canvas);
    this.scene = new SchoolScene(canvas);
    this.hud = el('div', { class: 'hud' });
    stage.append(this.hud);
    this.hud.innerHTML = `
      <div class="hud-top">
        <div class="hud-brand pframe"><div class="pixel-title">MOON<br>SCHOOL</div><div class="code"></div></div>
        <div class="hud-phase pframe"><div class="round"></div><div style="flex:1;min-width:0"><div class="ptitle"></div><div class="pdesc"></div></div></div>
        <div class="hud-timer pframe"><div class="t">0:00</div><div class="lab">เวลาที่เหลือ</div></div>
      </div>
      <div class="hud-banners"></div>
      <div class="hud-left">
        <div class="hud-front pframe"><h3>สร้างโรงเรียนปลอดภัย · 5 ด้าน</h3><div class="areas"></div><div class="proj"></div></div>
        <div class="hud-mission pframe hidden"><h3>ภารกิจทูตสัมพันธไมตรี</h3><div class="track"></div><div class="mrule muted"></div></div>
      </div>
      <div class="hud-status pframe"><h3>สถานะโรงเรียน</h3><div class="stats"></div><div class="avgline"></div></div>
      <div class="hud-log pframe"><h3>เกิดอะไรขึ้นบ้าง</h3><ul></ul></div>
      <div class="hud-card pframe hidden"></div>
      <div class="hud-paused hidden"><div>PAUSED</div></div>
      <div class="hud-end hidden"></div>`;
    this.stats = {}; this.seen = {}; this.state = null; this.cardKey = '';
    setInterval(() => this.tick(), 250);
  }

  ensureStats(list) {
    if (Object.keys(this.stats).length) return;
    const box = $('.hud-status .stats', this.hud);
    for (const s of list) {
      const row = el('div', { class: 'stat' }, el('div', { class: 'lab' }, el('span', { text: `${s.icon} ${s.th}` }), el('span', { class: 'val' })), el('div', { class: 'bar' }, el('i')));
      box.append(row); this.stats[s.key] = row;
    }
  }

  update(pub) {
    this.state = pub;
    const g = pub.game;
    $('.hud-brand .code', this.hud).textContent = `ROOM ${pub.code}`;
    this.scene.setStudents(pub.players.map((p) => p.avatar));
    if (!g) return;
    setTheme(g.timeOfDay); this.scene.setTime(g.timeOfDay);
    this.ensureStats(g.status);
    $('.round', this.hud).textContent = g.day ? (g.totalDays ? `วันที่ ${g.day}/${g.totalDays}` : `วันที่ ${g.day} · มาราธอน`) : 'เริ่มต้น';
    $('.ptitle', this.hud).textContent = g.phaseTh;
    $('.pdesc', this.hud).textContent = g.act ? g.act.th : `${g.modeTh}`;

    for (const s of g.status) {
      const row = this.stats[s.key], bar = $('.bar > i', row);
      bar.style.width = `${s.value}%`; bar.className = s.value <= 20 ? 'low' : s.value < 40 ? 'mid' : '';
      $('.val', row).textContent = s.value;
      if (s.change && this.seen[s.key] !== s.change.at) {
        const first = this.seen[s.key] === undefined;
        this.seen[s.key] = s.change.at;
        if (!first) {
          const d = el('span', { class: `delta ${s.change.d > 0 ? 'up' : 'down'}`, text: `${s.change.d > 0 ? '+' : ''}${s.change.d}` });
          $('.val', row).append(d); setTimeout(() => d.remove(), 2600);
          row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
        }
      }
    }
    this.scene.setMood(g.avg);
    $('.avgline', this.hud).textContent = `เฉลี่ย ${g.avg} · เป้าตอนจบ ${g.target} · 2 ด้าน ≤ 20 = โรงเรียนพัง`;

    // Front A
    $('.hud-front .areas', this.hud).replaceChildren(...Object.entries(g.frontA).map(([k, done]) => el('div', { class: `area ${done ? 'done' : ''}`, title: AREA_TH[k] }, AREA[k], el('small', { text: done ? '✔' : AREA_TH[k] }))));
    const pr = g.project, proj = [];
    if (pr) proj.push(el('div', { class: 'ptitle2', text: `โครงการ: ${pr.th} (${SIZE_TH[pr.size]})` }), el('div', { class: 'bar' }, el('i', { style: `width:${Math.min(100, (pr.funded / pr.cost) * 100)}%` })),
      el('div', { class: 'muted small', text: `ลงขันแล้ว ${pr.funded}/${pr.cost} · ${pr.donors} คน · ผล ${fxText(pr.fx)}` }));
    else if (g.offers.length) proj.push(el('div', { class: 'muted small', text: `ประธานกำลังเลือกโครงการ: ${g.offers.map((o) => o.th).join(' / ')}` }));
    if (g.tasks && g.tasks.total) proj.push(el('div', { class: 'small duty-line' , text: `📋 ภารกิจของนักเรียน ${g.tasks.done}/${g.tasks.total} · ครบ 50% และ 100% ทุกด้าน +2` }),
      el('div', { class: 'bar' }, el('i', { style: `width:${Math.min(100, (g.tasks.done / g.tasks.total) * 100)}%` })));
    proj.push(el('div', { class: 'muted small', text: `คลังทรัพยากร ${g.treasury}${g.president ? ` · ผู้ถือ ${g.president}` : ''}` }));
    $('.hud-front .proj', this.hud).replaceChildren(...proj);

    // missions
    const m = g.missions, mbox = $('.hud-mission', this.hud);
    mbox.classList.toggle('hidden', !m);
    if (m) {
      const slots = Math.max(5, m.track.length + 1);
      $('.track', mbox).replaceChildren(...Array.from({ length: slots }, (_, i) => {
        const t = m.track[i];
        return el('div', { class: `slot ${t ? (t.success ? 'ok' : 'bad') : i === m.track.length ? 'now' : ''}` }, t ? (t.success ? '✔' : '✖') : String(i + 1));
      }));
      const ok = m.track.filter((t) => t.success).length, bad = m.track.length - ok;
      $('.mrule', mbox).textContent = `สำเร็จ ${ok}/${m.needSuccess} · ล้มเหลว ${bad}/${m.failLimit} · ${m.today ? 'วันนี้มีภารกิจ' : `ภารกิจถัดไปวันที่ ${m.next}`}`;
    }

    const ul = $('.hud-log ul', this.hud);
    ul.replaceChildren(...(g.log.length ? g.log.slice(0, 6).map((l) => el('li', { class: l.kind, text: l.text })) : [el('li', { class: 'muted', text: 'ยังไม่มีเหตุการณ์' })]));

    const banners = [];
    if (g.news[0] && g.news[0].day === g.day) banners.push(el('div', { class: 'banner pframe ann', text: `📰 ข่าวนิรนาม: ${g.news[0].text}` }));
    if (!g.vote && !g.finished && ['day', 'night', 'propose', 'teamVote', 'mission'].includes(g.phase) && (g.reports || g.motions)) {
      banners.push(el('div', { class: 'banner pframe nc', text: `🚨 แจ้งเหตุ ${g.reports}/4${g.motions ? ` · ⚖️ ญัตติไม่ไว้วางใจ ${g.motions}/4` : ''}${g.voteCooldown ? ` · พักโหวตอีก ${Math.ceil(g.voteCooldown / 1000)} วิ` : ''}` }));
    }
    if (g.silenced.length) banners.push(el('div', { class: 'banner pframe sos', text: `🔇 ถูกตัดความสามารถ: ${g.silenced.join(', ')}` }));
    $('.hud-banners', this.hud).replaceChildren(...banners);

    this.renderCard(g, pub);
    $('.hud-paused', this.hud).classList.toggle('hidden', !g.paused || g.finished);
    this.renderEnd(g);
    this.sound(g);
    this.tick();
  }

  // music + effects driven by state changes
  sound(g) {
    const a = this.audio; if (!a) return;
    const p = this.prev; this.prev = { phase: g.phase, day: g.day, vote: g.vote?.stage || null, voteKind: g.vote?.kind, done: g.projectsDone, missions: g.missions?.track.length || 0, news: g.news[0]?.text, act: g.act?.th, finished: g.finished, status: Object.fromEntries(g.status.map((x) => [x.key, x.value])), bullied: g.dawn?.bullied.length || 0 };
    const music = g.finished ? null : g.vote ? 'vote' : g.phase === 'story' ? 'story' : g.phase === 'night' ? 'night' : g.phase === 'card' ? 'card' : 'day';
    if (music) a.play(music); else a.stop();
    if (!p) return;
    const c = this.prev;
    if (c.finished && !p.finished) return a.sfx(g.winner?.color === 'blue' ? 'win' : 'lose');
    if (c.vote !== p.vote) { if (c.vote === 'talk') a.sfx('voteOpen'); else if (c.vote === 'cast') a.sfx('cast'); else if (c.vote === 'result') a.sfx('gavel'); }
    if (c.phase !== p.phase) {
      if (c.phase === 'card') { a.sfx(c.day > 1 ? 'morning' : 'act'); setTimeout(() => a.sfx(c.bullied ? 'bully' : 'card'), 600); }
      else if (c.phase === 'night') a.sfx('night');
      else if (['propose', 'day'].includes(c.phase)) a.sfx('tick');
    }
    if (c.missions > p.missions) a.sfx(g.missions.track[g.missions.track.length - 1].success ? 'mission' : 'missionFail');
    if (c.done > p.done) a.sfx('project');
    else if (c.news && c.news !== p.news) a.sfx('news');
    else if (c.act !== p.act && c.phase !== 'card') a.sfx('act');
    else if (c.phase === p.phase && !c.vote) {
      const d = Object.keys(c.status).reduce((s, k) => s + (c.status[k] - p.status[k]), 0);
      if (d > 0) a.sfx('up'); else if (d < 0) a.sfx('down');
    }
  }

  renderCard(g, pub) {
    const card = $('.hud-card', this.hud);
    let cls = 'wide-card', body = [];
    const v = g.vote, m = g.missions;
    if (g.phase === 'story' && g.story) {
      const elapsed = g.timer.total - timerRemaining(g.timer);
      const shown = Math.min(g.story.lines.length, 1 + Math.floor(elapsed / (g.timer.total / g.story.lines.length)));
      cls = 'story';
      body = [el('div', { class: 'etype', text: g.story.school }), el('div', { class: 'etitle', text: `🌕 ${g.story.title}` }),
        ...g.story.lines.slice(0, shown).map((t) => el('p', { class: 'storyline', text: t }))];
    } else if (v) {
      cls = 'negative';
      const title = v.kind === 'punish' ? '🗳 โหวตหาคนต้องสงสัย' : '⚖️ ญัตติอภิปรายไม่ไว้วางใจประธาน';
      body = [el('div', { class: 'etype', text: v.stage === 'talk' ? 'พูดคุย 45 วินาที · เวลาในเกมหยุด' : v.stage === 'cast' ? 'ลงคะแนน 5 วินาที!' : 'ผลโหวต' }),
        el('div', { class: 'etitle', text: title }),
        el('div', { class: 'edesc', text: `${v.by ? `เปิดโดยประธาน ${v.by}` : 'เปิดจากการแจ้งเหตุร่วมกัน'}${v.reason ? ` · เหตุผล: ${v.reason}` : ''}` })];
      if (v.stage === 'talk') body.push(el('div', { class: 'edesc', text: v.kind === 'punish' ? 'ใครน่าสงสัย? มีหลักฐานอะไร? คนที่ได้คะแนนสูงสุดคนเดียวจะใช้ความสามารถของคุณลักษณะไม่ได้อีกจนจบเกม' : 'ประธานควรอยู่ต่อหรือไม่? ถ้าผ่าน ประธานเป็นนักเรียนทั่วไป และรองประธานรักษาการแทน' }));
      if (v.stage === 'cast') body.push(el('div', { class: 'meter', text: `ลงคะแนนแล้ว ${v.cast}/${pub.players.length}` }));
      if (v.result) body.push(el('div', { class: 'etitle', text: v.result.text }), v.result.rows ? el('div', { class: 'edesc', text: [...v.result.rows.map((r) => `${r.name} ${r.votes}`), `ไม่ลงคะแนน ${v.result.abstain}`].join(' · ') }) : el('div', { class: 'edesc', text: `เห็นด้วย ${v.result.yes} · ไม่เห็นด้วย ${v.result.no}` }));
    } else if (g.phase === 'card' && g.card?.brief) {
      const pages = g.card.pages, elapsed = g.timer.total - timerRemaining(g.timer);
      const i = Math.min(pages.length - 1, Math.floor(elapsed / (g.timer.total / pages.length)));
      cls = 'positive';
      body = [el('div', { class: 'etype', text: `ภารกิจของเรา · หน้า ${i + 1}/${pages.length}` }), el('div', { class: 'etitle', text: pages[i].title }), el('div', { class: 'edesc', text: pages[i].text })];
    } else if (g.phase === 'card' && g.card) {
      const c = g.card;
      cls = c.tier === 'crisis' ? 'negative' : 'challenge';
      body = [el('div', { class: 'etype', text: `ไพ่สถานการณ์ ${c.id} · ${c.category}${c.tier === 'crisis' ? ' · วิกฤต' : ''}` }),
        el('div', { class: 'etitle', text: c.title }), el('div', { class: 'edesc', text: c.story }),
        el('ol', {}, ...c.choices.map((x) => el('li', { text: x.label }))),
        el('div', { class: 'fact' }, el('b', { text: '💡 รู้ไหม: ' }), c.fact, el('div', { class: 'src', text: `แหล่งข้อมูล: ${c.source}` })),
        el('div', { class: 'meter', text: `เลือกแล้ว ${c.voted}/${pub.players.length} · เลือกบนมือถือ` })];
      if (g.dawn) body.unshift(el('div', { class: 'dawn', text: `🌅 เมื่อคืน: ${g.dawn.bullied.length ? `มีคนถูกกลั่นแกล้ง ${g.dawn.bullied.length} คน (${g.dawn.bullied.join(', ')})` : 'ไม่มีใครถูกกลั่นแกล้ง'}${g.dawn.blocked ? ` · ป้องกันได้ ${g.dawn.blocked}` : ''}${g.dawn.events.length ? ` · ${g.dawn.events.join(' · ')}` : ''}` }));
    } else if (m && g.phase === 'propose') {
      body = [el('div', { class: 'etype', text: 'ภารกิจทูต · เสนอทีม' }), el('div', { class: 'etitle', text: `ผู้นำรอบ: ${m.leader}` }),
        el('div', { class: 'edesc', text: `เลือกทูต ${m.teamSize} คน · ไม่ผ่านแล้ว ${m.rejects}/3` })];
    } else if (m && g.phase === 'teamVote' && m.proposal) {
      body = [el('div', { class: 'etype', text: 'ภารกิจทูต · โหวตรับรองทีม' }), el('div', { class: 'etitle', text: m.proposal.map((x) => x.name).join(' · ') }),
        el('div', { class: 'meter', text: `โหวตแล้ว ${m.teamVoted}/${pub.players.length}${m.rejects === 2 ? ' · ถ้าไม่ผ่านอีก ทีมนี้ถูกส่งไปเลย' : ''}` })];
    } else if (m && g.phase === 'mission' && m.proposal) {
      body = [el('div', { class: 'etype', text: 'ภารกิจทูต · การ์ดลับ' }), el('div', { class: 'etitle', text: m.proposal.map((x) => x.name).join(' · ') }), el('div', { class: 'meter', text: `ส่งการ์ดแล้ว ${m.played}/${m.proposal.length}` })];
    } else if (m?.reveal) {
      const r = m.reveal; cls = r.success ? 'positive' : 'negative';
      body = [el('div', { class: 'etype', text: 'ผลภารกิจทูต' }), el('div', { class: 'cards' }, ...r.cards.map((c, i) => el('div', { class: `mcard ${c === 'sabotage' ? 'bad' : 'ok'}`, style: `animation-delay:${i * 0.4}s` }, c === 'sabotage' ? '✖' : '✔'))),
        el('div', { class: 'etitle', text: r.success ? 'สำเร็จ! ได้ทรัพยากรเข้าคลังส่วนกลาง' : `ล้มเหลว: การ์ดขัดขวาง ${r.sabotage} ใบ` })];
    } else if (g.phase === 'night') {
      cls = 'night';
      body = [el('div', { class: 'etype', text: 'แสงจันทร์ส่องถึงรั้วโรงเรียน' }), el('div', { class: 'etitle', text: '🌙 กลางคืน: ทุกคนก้มดูมือถือ' }), el('div', { class: 'edesc', text: 'คุณลักษณะที่มีความสามารถลับเลือกเป้าหมายได้ตอนนี้ · ทุกคนเสียพลังใจจากคำสาป' })];
    }
    const key = JSON.stringify([g.phase, g.day, cls, body.map((b) => b?.textContent)]);
    if (!body.length) { card.className = 'hud-card pframe hidden'; this.cardKey = ''; return; }
    if (key === this.cardKey) return;
    this.cardKey = key;
    card.className = `hud-card pframe ${cls}`;
    card.replaceChildren(...body.filter(Boolean));
  }

  renderEnd(g) {
    const box = $('.hud-end', this.hud);
    if (!g.finished || !g.winner) { box.classList.add('hidden'); this.endShown = false; return; }
    if (this.endShown) return;
    this.endShown = true;
    box.classList.remove('hidden');
    box.replaceChildren(el('div', { class: 'end-inner pframe' },
      el('div', { class: 'pixel-title', text: 'GAME OVER' }),
      el('h2', { class: `winner ${g.winner.color}`, text: `${g.winner.th}ชนะ` }),
      el('p', { class: 'muted', text: g.winner.reason }),
      el('div', { class: 'reveal-grid' }, ...g.reveal.map((p) => el('div', { class: `rv pframe ${p.color}` }, avatar(p.avatar),
        el('div', {}, el('b', { text: p.name }), el('div', { text: p.role }), el('small', { text: `${p.colorTh} · ${p.trait}${p.changed ? ' (เปลี่ยนใจ)' : ''}${p.silenced ? ' · 🔇' : ''}` })), p.won ? el('span', { class: 'won', text: '★' }) : null))),
      el('div', { class: 'end-cols' },
        el('div', {}, el('h3', { text: '❤ คู่ที่สนิทกันที่สุด' }), el('ol', {}, ...(g.pairs.length ? g.pairs.map((x) => el('li', { text: `${x.a} & ${x.b} · ${x.hearts} หัวใจ` })) : [el('li', { text: 'ยังไม่มีใครส่งหัวใจ' })]))),
        el('div', {}, el('h3', { text: 'ชวนคุยกันต่อ' }), el('ol', {},
          el('li', { text: 'ตอนที่ถูกกลั่นแกล้งในเกม คุณรู้สึกอย่างไร' }), el('li', { text: 'คนที่เห็นเหตุการณ์ช่วยอะไรได้บ้าง' }), el('li', { text: 'การโหวตโดยไม่มีหลักฐานส่งผลอย่างไร' }))))));
  }

  tick() {
    const g = this.state?.game; if (!g) return;
    const ms = timerRemaining(g.timer);
    const t = $('.hud-timer .t', this.hud);
    t.textContent = g.finished ? 'END' : fmtTime(ms);
    const low = ms > 0 && ms <= 10000 && !g.paused && !g.finished;
    t.classList.toggle('low', low);
    const sec = Math.ceil(ms / 1000);
    if (low && sec !== this.lastTickSec && sec <= 5) this.audio?.sfx('tick');
    this.lastTickSec = sec;
    if (g.phase === 'story' || (g.phase === 'card' && g.card?.brief)) this.renderCard(g, this.state);
    void now;
  }
}
