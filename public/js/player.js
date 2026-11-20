// Player phone (v0.4): role + hidden trait, morning cards, missions, night skills, hearts, votes, projects.
import { $, $$, el, call, store, toast, errText, params, getSocket, syncClock, setTheme, timerRemaining, fmtTime } from './common.js';
import { drawAvatar } from './pixel.js';

const code = (params.get('room') || '').toUpperCase();
const socket = getSocket();
let pub = null, me = null;
const ui = { tab: 'act', team: new Set(), reason: 'saw', newsForm: 'suspect', newsTarget: null, analyzeTarget: null, key: '', handKey: '', reflect: ['', '', ''] };
const views = ['connecting', 'joinView', 'lobbyView', 'gameView', 'msgView'];
const show = (id) => { views.forEach((v) => $(`#${v}`).classList.toggle('hidden', v !== id)); $('#tabbar').classList.toggle('hidden', id !== 'gameView'); };
$('#roomTag').textContent = code ? `ROOM ${code}` : '';
const message = (text) => { show('msgView'); $('#msgText').textContent = text; };
const ERR = {
  not_allowed: 'ทำแบบนี้ไม่ได้', wrong_phase: 'ยังไม่ใช่ช่วงนี้', no_skill: 'ตอนนี้ใช้ความสามารถไม่ได้', same_target: 'ปกป้องคนเดิมติดกันไม่ได้',
  bad_team: 'เลือกทูตให้ครบตามจำนวน', already: 'ใช้สิทธิ์นี้แล้ววันนี้', no_hearts: 'หัวใจวันนี้หมดแล้ว', not_enough: 'พลังใจไม่พอ',
  cooldown: 'ต้องรอ 45 วินาทีหลังโหวตครั้งก่อน', vote_active: 'กำลังโหวตอยู่', locked: 'ยังปลดล็อกไม่ได้', waiting_partner: 'รอเพื่อนกดยืนยัน',
  no_project: 'ยังไม่มีโครงการ', project_active: 'มีโครงการอยู่แล้ว', empty: 'คลังว่าง', not_president: 'เฉพาะประธาน', bad_target: 'เลือกคนนี้ไม่ได้',
};
async function act(d) {
  const r = await call('player:action', d);
  if (!r.ok) toast(ERR[r.error] || errText(r.error), 'err');
  return r.ok;
}

// ---------- session ----------
async function resume() {
  const saved = store.get(`player:${code}`);
  if (!code) return show('joinView');
  if (!saved) { $('#jCode').value = code; $('#jNick').value = store.get('nickname') || ''; show('joinView'); return; }
  const r = await call('player:resume', { code, playerId: saved.playerId, token: saved.token });
  if (!r.ok) {
    store.del(`player:${code}`);
    if (r.error === 'kicked') return message(errText('kicked'));
    if (r.error === 'no_room') return message('ไม่พบห้องนี้ หรือห้องถูกปิดแล้ว');
    $('#jCode').value = code; show('joinView');
  }
}
socket.on('connect', resume);
socket.on('disconnect', () => toast('การเชื่อมต่อหลุด กำลังเชื่อมใหม่…', 'err'));
socket.on('player:kicked', () => { store.del(`player:${code}`); message(errText('kicked')); });
socket.on('room:closed', () => { store.del(`player:${code}`); message('ห้องถูกปิดแล้ว ขอบคุณที่ร่วมเล่น!'); });
socket.on('state:public', (s) => { syncClock(s.serverNow); pub = s; render(); });
socket.on('state:private', (p) => { me = p; render(); });

$('#joinView').onsubmit = async (e) => {
  e.preventDefault();
  const r = await call('room:join', { code: $('#jCode').value.trim().toUpperCase(), nickname: $('#jNick').value });
  if (!r.ok) return toast(errText(r.error), 'err');
  store.set('nickname', $('#jNick').value.trim());
  store.set(`player:${r.code}`, { playerId: r.playerId, token: r.token });
  if (r.code !== code) location.href = `/play.html?room=${r.code}`;
};
$('#readyBtn').onclick = async () => { const r = await call('player:ready', { ready: !me?.ready }); if (!r.ok) toast(errText(r.error), 'err'); };
$('#leaveBtn').onclick = async () => { if (!confirm('ออกจากห้องนี้?')) return; await call('player:leave'); store.del(`player:${code}`); location.href = '/'; };
$$('#tabbar button').forEach((b) => (b.onclick = () => { ui.tab = b.dataset.tab; ui.key = ''; renderTabs(); render(); }));

let wakeLock = null;
async function keepAwake() { try { if (!wakeLock && 'wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => (wakeLock = null)); } } catch { /* unsupported */ } }

// ---------- small builders ----------
const card = (...c) => el('div', { class: 'gcard pframe' }, ...c);
const kind = (t) => el('div', { class: 'kind', text: t });
const title = (t) => el('div', { class: 'name', text: t });
const para = (t, cls = '') => el('p', { class: `pp ${cls}`, text: t });
const btn = (label, onclick, cls = 'primary', extra = {}) => el('button', { class: `btn ${cls}`, onclick, ...extra }, label);
const AREA = { safety: '🛡', trust: '🤝', belonging: '🏠', cooperation: '🧩', wellbeing: '💚' };
const fxText = (fx) => Object.entries(fx || {}).map(([k, v]) => `${AREA[k]}${v > 0 ? '+' : ''}${v}`).join(' ');
function picker(list, selected, onPick, { multi = false, exclude = [] } = {}) {
  return el('div', { class: 'picker' }, ...list.filter((o) => !exclude.includes(o.id)).map((o) => {
    const on = multi ? selected.has(o.id) : selected === o.id;
    const p = pub.players.find((x) => x.id === o.id);
    const c = el('canvas', { class: 'mini-av' }); if (p) drawAvatar(c, p.avatar);
    return el('button', { class: `pick ${on ? 'on' : ''}`, onclick: () => onPick(o.id) }, c, el('span', { text: o.name }), el('small', { text: p?.role ? p.role.th.replace('นักเรียน', '') : '' }));
  }));
}

// ---------- render ----------
function renderTabs() {
  $$('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
  ['act', 'hand', 'friends', 'diary'].forEach((t) => $(`#tab-${t}`).classList.toggle('hidden', t !== ui.tab));
}

function render() {
  if (!pub || !me) return;
  const g = pub.game;
  if (!g) {
    setTheme('day'); show('lobbyView');
    drawAvatar($('#meAvatar'), me.avatar);
    $('#meNick').textContent = me.nickname;
    const b = $('#readyBtn');
    b.textContent = me.ready ? '✔ พร้อมแล้ว (แตะเพื่อยกเลิก)' : 'แตะเพื่อ “พร้อม”';
    b.className = `btn ready-btn ${me.ready ? 'go' : 'primary'}`;
    const need = Math.max(0, pub.settings.minPlayers - pub.players.length);
    $('#lobbyCount').textContent = `ในห้อง ${pub.players.length} คน${need ? ` · ต้องการอีก ${need} คน` : ' · รอโฮสต์กดเริ่มเกม'}`;
    $('#lobbyList').replaceChildren(...pub.players.map((p) => el('span', { class: p.ready ? 'r' : '', text: `${p.bot ? '🤖' : ''}${p.nickname}` })));
    return;
  }
  if (!me.cards) return;
  show('gameView'); keepAwake(); setTheme(g.timeOfDay); renderTabs();
  $('#gRound').textContent = g.day ? `วันที่ ${g.day}${g.totalDays ? `/${g.totalDays}` : ''} · ${g.modeTh}` : g.modeTh;
  $('#gPhase').textContent = g.finished ? 'จบเกมแล้ว' : g.vote ? (g.vote.kind === 'punish' ? 'กำลังโหวต' : 'ญัตติไม่ไว้วางใจ') : g.phaseTh;
  $('#attrStrip').replaceChildren(el('div', { class: 'stat-mini' }, ...me.cards.stats.map((x) => el('div', { class: `sm ${x.value < 30 ? 'low' : ''}`, title: x.th },
      el('span', { text: `${x.icon} ${x.value}` }), el('div', { class: 'bar' }, el('i', { class: x.value < 20 ? 'low' : x.value < 50 ? 'mid' : '', style: `width:${x.value}%` }))))),
    el('div', { class: 'ab' }, el('span', { text: `🎭 ${me.cards.role.th}` })), el('div', { class: 'ab' }, el('span', { text: `❤ เหลือ ${me.ctx.hearts.left}` })));
  if (ui.tab === 'act') renderAct(g);
  if (ui.tab === 'hand') renderHand();
  if (ui.tab === 'friends') renderFriends(g);
  if (ui.tab === 'diary') renderDiary();
}

function phaseBlocks(g) {
  const c = me.ctx, out = [];
  const v = g.vote;
  if (g.finished) return renderEndBlocks(g);
  if (v) {
    if (v.stage === 'talk') out.push(card(kind(v.kind === 'punish' ? 'โหวตหาคนต้องสงสัย · พูดคุย 45 วิ' : 'ญัตติไม่ไว้วางใจประธาน · พูดคุย 45 วิ'),
      title(v.reason ? `เหตุผล: ${v.reason}` : 'คุยกันก่อนลงคะแนน'), para(v.kind === 'punish' ? 'อีกไม่กี่วินาทีจะลงคะแนน 5 วินาที เตรียมตัดสินใจว่าจะเลือกใคร หรือไม่ลงคะแนน' : 'ถ้าผ่าน ประธานจะเป็นนักเรียนทั่วไป และรองประธานรักษาการแทน', 'muted')));
    if (v.stage === 'cast') {
      if (v.kind === 'punish') out.push(card(kind('ลงคะแนน 5 วินาที!'), title(c.ballot ? `✔ ลงคะแนนแล้ว` : 'เลือกคนที่คุณสงสัย'),
        picker(c.others, c.ballot, (id) => act({ type: 'ballot', target: id })),
        btn('ไม่ลงคะแนน', () => act({ type: 'ballot', target: null }), c.ballot === 'skip' ? 'go wide' : 'wide')));
      else out.push(card(kind('ลงคะแนน 5 วินาที!'), title('ถอดประธานออกจากตำแหน่ง?'), el('div', { class: 'yn' },
        btn('เห็นด้วย', () => act({ type: 'ballot', choice: 'yes' }), c.ballot === 'yes' ? 'go' : 'danger'), btn('ไม่เห็นด้วย', () => act({ type: 'ballot', choice: 'no' }), c.ballot === 'no' ? 'go' : 'primary'))));
    }
    if (v.stage === 'result' && v.result) out.push(card(kind('ผลโหวต'), title(v.result.text)));
    return out;
  }
  if (g.phase === 'story' && g.story) out.push(card(kind(g.story.school), title(`🌕 ${g.story.title}`), ...g.story.lines.map((t) => para(t))));
  if (g.phase === 'card' && g.card?.brief) out.push(card(kind('วันที่ 1 · ภารกิจของเรา'), ...g.card.pages.map((p) => el('div', { class: 'ab' }, el('b', { text: p.title }), el('div', { text: p.text })))));
  if (g.phase === 'card' && g.card && !g.card.brief) {
    const k = g.card;
    if (g.dawn) out.push(card(kind('🌅 ข่าวเช้า'), para(g.dawn.bullied.length ? `เมื่อคืนมีคนถูกกลั่นแกล้ง ${g.dawn.bullied.length} คน: ${g.dawn.bullied.join(', ')}` : 'เมื่อคืนไม่มีใครถูกกลั่นแกล้ง')));
    out.push(card(kind(`ไพ่สถานการณ์ ${k.id} · ${k.category}`), title(k.title), para(k.story),
      el('div', { class: 'choices' }, ...k.choices.map((x) => btn(`${c.myChoice === x.id ? '✔ ' : ''}${x.label}`, () => act({ type: 'cardVote', choice: x.id }), `choice ${c.myChoice === x.id ? 'go' : ''}`))),
      c.canCompromise ? btn('🤝 ใช้ประนีประนอม: ลดผลเสียไพ่นี้ครึ่งหนึ่ง', () => confirm('ใช้ประนีประนอมกับไพ่นี้?') && act({ type: 'compromise' }), 'warm wide') : null,
      el('div', { class: 'ab' }, `💡 ${k.fact}`, el('div', { class: 'muted', style: 'font-size:.8rem', text: `แหล่งข้อมูล: ${k.source}` }))));
  }
  if (g.phase === 'propose') {
    if (c.amLeader) {
      out.push(card(kind('ภารกิจทูต · คุณเป็นผู้นำรอบ'), title(`เลือกทูต ${c.teamSize} คน (${ui.team.size}/${c.teamSize})`),
        picker([{ id: me.playerId, name: `${me.nickname} (คุณ)` }, ...c.others], ui.team, (id) => { if (ui.team.has(id)) ui.team.delete(id); else if (ui.team.size < c.teamSize) ui.team.add(id); ui.key = ''; render(); }, { multi: true }),
        btn('เสนอทีมนี้', async () => { if (await act({ type: 'propose', team: [...ui.team] })) ui.team.clear(); }, 'go wide', { disabled: ui.team.size !== c.teamSize })));
    } else out.push(card(kind('ภารกิจทูต'), title(`${g.missions.leader} กำลังเลือกทีม`), para('คุยกันได้ว่าควรส่งใคร', 'muted')));
    if (c.excluded) out.push(card(kind('ถูกกีดกัน'), para('รอบนี้คุณไปภารกิจทูตไม่ได้ เพราะถูกกีดกันจากกลุ่ม', 'warn')));
  }
  if (g.phase === 'teamVote' && g.missions?.proposal) out.push(card(kind('โหวตรับรองทีมทูต'), title(g.missions.proposal.map((x) => x.name).join(' · ')),
    el('div', { class: 'yn' }, btn('✔ เห็นชอบ', () => act({ type: 'teamVote', approve: true }), c.myTeamVote === true ? 'go' : 'primary'), btn('✖ ไม่เห็นชอบ', () => act({ type: 'teamVote', approve: false }), c.myTeamVote === false ? 'go' : 'danger'))));
  if (g.phase === 'mission') {
    if (c.onTeam) out.push(card(kind('คุณอยู่ในทีมทูต · การ์ดลับ'), title(c.played ? '✔ ส่งการ์ดแล้ว' : 'เลือกการ์ด 1 ใบ'), el('div', { class: 'mission-cards' },
      el('button', { class: 'mc ok', disabled: c.played, onclick: () => act({ type: 'missionCard', card: 'coop' }) }, '✔', el('span', { text: 'ร่วมมือ' })),
      el('button', { class: 'mc bad', disabled: c.played || !c.canSabotage, onclick: () => confirm('ขัดขวางภารกิจ?') && act({ type: 'missionCard', card: 'sabotage' }) }, '✖', el('span', { text: c.canSabotage ? 'ขัดขวาง' : 'เฉพาะสีแดง' })))));
    else out.push(card(kind('ภารกิจทูต'), title('ทีมทูตกำลังเลือกการ์ดลับ')));
  }
  if (g.phase === 'night') {
    const n = c.night;
    const LABEL = { restore: '💚 ฟื้นพลังใจเพื่อนจนเต็ม (ครั้งเดียว)', brave: '🦁 ยืนเฝ้าเพื่อนอย่างกล้าหาญ (ครั้งเดียว · พลังใจ −10)', protect: '🛡 ปกป้อง', investigate: '🕵️ สืบสี',
      convert: '✨ เปลี่ยนให้เป็นสีน้ำเงิน (ครั้งเดียว)', bully: '😈 รังแก', rumor: '📢 ปล่อยข่าวลือ', pressure: '🎭 กดดันให้ช่วยใครไม่ได้', recruit: '🤝 ชวนเข้าแก๊ง (ครั้งเดียว)', hide: '🫣 ซ่อนตัวคืนนี้ (ครั้งเดียว)' };
    if (n && n.action === 'hide') out.push(card(kind('🌙 ความสามารถลับของคุณลักษณะ'), title(LABEL.hide), para(n.chosen ? '✔ คืนนี้คุณซ่อนตัวแล้ว' : 'ไม่มีใครทำอะไรคุณได้คืนนี้ ใช้ได้ครั้งเดียว', 'muted'),
      btn(n.chosen ? '✔ ซ่อนตัวแล้ว' : 'ซ่อนตัว', () => act({ type: 'night' }), n.chosen ? 'go wide' : 'primary wide', { disabled: !!n.chosen })));
    else if (n) out.push(card(kind('🌙 ความสามารถลับของคุณลักษณะ'), title(LABEL[n.action] || n.action), para(n.chosen ? `เลือกแล้ว: ${pub.players.find((p) => p.id === n.chosen)?.nickname}` : 'เลือก 1 คน (เปลี่ยนได้จนหมดเวลา)', 'muted'),
      picker(c.others, n.chosen, (id) => act({ type: 'night', target: id }), { exclude: n.notTarget ? [n.notTarget] : [] })));
    else out.push(card(kind('🌙 กลางคืน'), title(me.cards.trait.silenced ? '🔇 คุณถูกตัดความสามารถแล้ว' : 'คืนนี้คุณไม่มีอะไรต้องทำ'), para('แสงจันทร์ทำให้ทุกคนเสียพลังใจ 5', 'muted')));
    if (c.angel) out.push(card(kind('แก๊งนางฟ้า · No One Left Behind'), title('ดูแลเพื่อน +10 พลังใจ (คืนละครั้ง)'), picker(c.others, null, (id) => act({ type: 'angel', target: id }))));
  }
  if (g.phase === 'day') out.push(card(kind('☀️ กลางวัน'), title('คุย ช่วยกัน และลงขันทำโครงการ'), para('ส่งหัวใจในแท็บ "เพื่อน" · แจ้งเหตุถ้าเห็นอะไรน่าสงสัย', 'muted')));
  return out;
}

function freeBlocks(g) {
  const c = me.ctx, out = [];
  if (g.finished || g.vote || !['day', 'night', 'propose', 'teamVote', 'mission'].includes(g.phase)) return out;
  if (c.recruitOffer) out.push(card(kind('มีคนชวนคุณเข้าแก๊งสีแดง'), para('ถ้าตอบรับ คุณจะย้ายไปอยู่สีแดงและเสียความสามารถเดิม ถ้าไม่ตอบก่อนกลางคืน ถือว่าปฏิเสธ', 'muted'),
    el('div', { class: 'yn' }, btn('ปฏิเสธ', () => act({ type: 'recruitAnswer', accept: false }), 'go'), btn('ตอบรับ', () => confirm('ย้ายไปอยู่สีแดง?') && act({ type: 'recruitAnswer', accept: true }), 'danger'))));
  if (c.canCalm) out.push(card(kind('🕊 รักสงบ · ใช้ได้ครั้งเดียว'), para('เช้าพรุ่งนี้จะไม่มีไพ่วิกฤต และด้านที่ต่ำที่สุดของโรงเรียน +3', 'muted'),
    btn('ลดความตึงเครียด', () => confirm('ใช้ความสามารถรักสงบ?') && act({ type: 'calm' }), 'warm wide')));
  const pr = g.project;
  const proj = [kind('🏗 โครงการสร้างโรงเรียนปลอดภัย')];
  if (pr) {
    proj.push(title(`${pr.th}`), para(`ลงขันแล้ว ${pr.funded}/${pr.cost} · ผล ${fxText(pr.fx)}`, 'muted'),
      el('div', { class: 'yn' }, ...[5, 10, 15].filter((a) => a <= c.donateMax).map((a) => btn(`ลงขัน ${a} 💗`, () => act({ type: 'donate', amount: a }), a === 5 ? 'primary' : 'go', { disabled: c.donated }))));
    if (c.donateMax === 5) proj.push(para('💪 ความแข็งแรงต่ำกว่า 30 วันนี้ลงขันได้แค่ 5', 'warn'));
    else if (c.donateMax === 15) proj.push(para('🪙 เศรษฐกิจตั้งแต่ 70 ลงขันได้ถึง 15', 'muted'));
    if (c.donated) proj.push(para('✔ วันนี้คุณลงขันแล้ว', 'ok'));
    if (c.isPresident && g.treasury > 0) proj.push(btn(`ใช้ทรัพยากรในคลัง (${g.treasury})`, () => act({ type: 'useTreasury' }), 'warm wide'));
  } else if (c.isPresident) {
    proj.push(title('เลือกโครงการ 1 จาก 3'), el('div', { class: 'choices' }, ...g.offers.map((o) => btn(`${o.th} · ${fxText(o.fx)} · ต้องการ ${o.cost}`, () => act({ type: 'chooseProject', project: o.id }), 'choice'))));
  } else proj.push(para(`รอประธาน${g.president ? ` (${g.president})` : ''} เลือกโครงการ`, 'muted'));
  out.push(card(...proj));

  const tools = [kind('🚨 แจ้งเหตุ · โหวต')];
  tools.push(para(`แจ้งเหตุวันนี้ ${g.reports}/4${g.voteCooldown ? ` · พักโหวตอีก ${Math.ceil(g.voteCooldown / 1000)} วิ` : ''}`, 'muted'),
    btn(c.reported ? '✔ แจ้งเหตุแล้ววันนี้' : '🚨 แจ้งเหตุ (ครบ 4 คนเปิดโหวต)', () => act({ type: 'report' }), 'danger wide', { disabled: c.reported }));
  if (g.president && !c.isPresident) tools.push(btn(c.motioned ? '✔ ยื่นญัตติแล้ว' : `⚖️ ยื่นญัตติไม่ไว้วางใจประธาน (${g.motions}/4)`, () => act({ type: 'motion' }), 'wide', { disabled: c.motioned }));
  if (c.isPresident) {
    tools.push(el('div', { class: 'ab' }, el('b', { text: 'ประธาน: เปิดโหวตทันที' }), el('div', { class: 'choices' }, ...me.reasons.map((r) => btn(`${ui.reason === r.id ? '● ' : ''}${r.th}`, () => { ui.reason = r.id; ui.key = ''; render(); }, 'choice small')))),
      btn('🗳 เปิดโหวตตอนนี้', () => confirm('เปิดโหวตหาคนต้องสงสัย?') && act({ type: 'callVote', reason: ui.reason }), 'warm wide'));
  }
  out.push(card(...tools));

  if (c.canAnalyze) out.push(card(kind('📚 นักเรียนสายวิชาการ · วิเคราะห์วันละครั้ง'), para('เลือก 1 คน ระบบบอกว่าเมื่อคืนเขาน่าจะกลั่นแกล้งคนอื่นไหม (แม่น 70%) ผลอยู่ในบันทึก', 'muted'),
    picker(c.others, null, (id) => act({ type: 'analyze', target: id }).then((ok) => ok && toast('ดูผลในแท็บบันทึก')))));
  if (c.canNews) out.push(card(kind('📰 กระจายข่าว · ส่งข่าวนิรนามขึ้นจอ (วันละครั้ง)'),
    el('div', { class: 'choices' }, ...me.newsForms.map((f) => btn(`${ui.newsForm === f.id ? '● ' : ''}${f.text}`, () => { ui.newsForm = f.id; ui.key = ''; render(); }, 'choice small'))),
    picker(c.others, ui.newsTarget, (id) => { ui.newsTarget = id; ui.key = ''; render(); }),
    btn('ส่งข่าว', () => ui.newsTarget && act({ type: 'postNews', form: ui.newsForm, target: ui.newsTarget }), 'warm wide', { disabled: !ui.newsTarget })));
  return out;
}

function renderEndBlocks(g) {
  const c = me.ctx;
  const mine = g.reveal.find((r) => r.id === me.playerId);
  return [
    card(kind('GAME OVER'), title(`${g.winner.th}ชนะ`), para(g.winner.reason, 'muted'), para(c.won ? '★ คุณชนะในครั้งนี้' : 'ครั้งนี้คุณไม่ได้ชนะ', c.won ? 'ok' : ''),
      mine ? para(`คุณคือ ${mine.role} · ${mine.colorTh} (${mine.trait})`) : null),
    card(kind('เปิดเผยทุกคน'), para('ตัวละครไม่ใช่ตัวคุณ สีแดงเป็นแค่บทสมมติในเกม', 'muted'),
      el('div', { class: 'reveal-list' }, ...g.reveal.map((r) => el('div', { class: `rl ${r.color}` }, el('b', { text: r.name }), el('small', { text: `${r.role} · ${r.colorTh} · ${r.trait}` }))))),
    c.reflected ? card(kind('สะท้อนคิด'), para('✔ ส่งคำตอบแล้ว ขอบคุณ', 'ok'))
      : el('form', { class: 'gcard pframe', onsubmit: async (e) => { e.preventDefault(); if (await act({ type: 'reflect', answers: ui.reflect })) toast('ส่งแล้ว'); } },
        kind('สะท้อนคิด'), ...c.prompts.map((q, i) => el('label', { class: 'field' }, el('span', { text: `${i + 1}. ${q}` }), el('textarea', { rows: 3, maxlength: 300, oninput: (e) => (ui.reflect[i] = e.target.value) }))),
        btn('ส่งคำตอบ', null, 'primary wide', { type: 'submit' })),
  ];
}

function renderAct(g) {
  const key = JSON.stringify([g.phase, g.day, g.vote, g.card?.result, g.card?.id, g.project, g.offers, g.reports, g.motions, Math.ceil(g.voteCooldown / 5000), g.missions?.proposal, g.finished, me.ctx, me.cards, [...ui.team], ui.reason, ui.newsForm, ui.newsTarget]);
  if (key === ui.key) return;
  if (g.finished && (ui.key.startsWith('END') || !me.ctx.prompts)) return; // keep the reflection form while typing; wait for private end state
  const blocks = [...phaseBlocks(g), ...freeBlocks(g)];
  ui.key = g.finished ? `END${key}` : key;
  $('#tab-act').replaceChildren(...blocks);
}

function secretCard(label, build) {
  const c = el('div', { class: 'gcard pframe secret', tabindex: '0' });
  c.append(el('div', { class: 'cover' }, el('div', {}, el('div', { class: 'pixel-title', text: 'TOP SECRET' }), el('div', { style: 'margin-top:.6rem;font-weight:700', text: label }), el('div', { style: 'font-size:.9rem;opacity:.85', text: 'กดค้างไว้เพื่อดู · ปล่อยเพื่อซ่อน' }))), ...build().filter(Boolean));
  const on = (e) => { e.preventDefault(); c.classList.add('revealed'); }, off = () => c.classList.remove('revealed');
  c.addEventListener('pointerdown', on);
  ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach((t) => c.addEventListener(t, off));
  c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') c.classList.toggle('revealed'); });
  c.addEventListener('contextmenu', (e) => e.preventDefault());
  return c;
}

const STAT_NOTE = {
  will: 'แสงจันทร์ลดคืนละ 5 · ถูกเยาะเย้ย −10 · ถ้าเหลือ 0 ใช้ความสามารถลับไม่ได้',
  str: 'ถูกรังแกทางกาย −15 · ฟื้นเช้าละ 5 · ต่ำกว่า 30 ลงขันได้แค่ 5',
  eco: 'ได้เช้าละ 5 (นักเรียนทั่วไป 8) · ภารกิจทูตสำเร็จ +10 · ลงขันได้คืน 3 · ยิ่งสูงยิ่งลงขันได้มาก · ได้ไม่เกิน 15 ต่อวัน',
  acc: 'ให้หัวใจ +3 · ได้หัวใจ +1 · ลงคะแนน +2 · แจ้งเหตุที่ได้ผล +5 · ถูกกีดกันหรือปล่อยข่าว −10 · ต่ำกว่า 30 อาจถูกชวนเข้าแก๊ง · ได้ไม่เกิน 15 ต่อวัน',
};

function renderHand() {
  const c = me.cards, key = JSON.stringify([c, me.allies, me.angels]);
  if (key === ui.handKey) return;
  ui.handKey = key;
  const a = el('canvas', { style: 'width:56px;height:72px;float:right;border:3px solid var(--line);background:var(--panel-2)' });
  drawAvatar(a, me.avatar);
  const t = c.trait;
  $('#hand').replaceChildren(
    el('div', { class: 'gcard pframe' }, a, kind('ตัวละคร'), title(me.nickname), el('div', { class: 'en', text: 'นักเรียนโรงเรียนมูนสคูล' })),
    el('div', { class: 'gcard pframe role' }, kind('บทบาท · ทุกคนเห็น'), title(`${c.role.th}${c.role.acting ? ' (รักษาการ)' : ''}`), el('div', { class: 'ab', text: c.role.skill }),
      c.role.removed ? para('คุณถูกถอดจากตำแหน่งประธาน ตอนนี้ใช้สกิลนักเรียนทั่วไป', 'warn') : null,
      me.angels.length ? el('div', { class: 'ab', text: `แก๊งนางฟ้าของคุณ: ${me.angels.join(', ')}` }) : null),
    secretCard('คุณลักษณะ · ความลับ', () => [kind('คุณลักษณะ · ห้ามให้ใครเห็น'), el('div', { class: `name color-${t.color}`, text: `${t.colorTh} · ${t.th}` }),
      el('div', { class: 'ab', text: `ความสามารถลับ: ${t.skill}` }), t.limit && t.limit !== '-' ? el('div', { class: 'ab', text: `ข้อจำกัด: ${t.limit}${t.usesLeft != null ? ` · เหลือ ${t.usesLeft} ครั้ง` : ''}` }) : null,
      el('div', { class: 'ab', text: `เป้าหมาย: ${t.win || t.goal}` }),
      t.silenced ? para('🔇 ถูกโหวต: ใช้ความสามารถของคุณลักษณะไม่ได้อีกจนจบเกม', 'warn') : null,
      t.used ? para('ใช้ความสามารถครั้งเดียวไปแล้ว', 'muted') : null,
      me.allies.length ? el('div', { class: 'ab', text: `${me.alliesLabel}: ${me.allies.join(', ')}` }) : null]),
    el('div', { class: 'gcard pframe' }, kind('ค่าสถานะของตัวละคร'), ...c.stats.map((x) => el('div', { class: 'stat-row' },
        el('div', { class: 'stat-head' }, el('span', { text: `${x.icon} ${x.th}` }), el('b', { text: `${x.value}/100` })),
        el('div', { class: 'bar' }, el('i', { class: x.value < 20 ? 'low' : x.value < 50 ? 'mid' : '', style: `width:${x.value}%` })),
        el('div', { class: 'muted stat-note', text: STAT_NOTE[x.key] }))),
      para('เป็นค่าสมมติของตัวละคร ไม่ใช่การประเมินตัวคุณ', 'muted')),
  );
}

function renderFriends(g) {
  const c = me.ctx;
  const key = JSON.stringify([c.hearts, c.pairs, g.phase, !!g.vote, g.finished]);
  if (key === ui.friendsKey) return;
  ui.friendsKey = key;
  const can = !g.finished && !g.vote && ['day', 'night', 'propose', 'teamVote', 'mission', 'card'].includes(g.phase);
  const pairs = c.pairs.filter((p) => p.unlocked && !p.used);
  $('#tab-friends').replaceChildren(
    card(kind(`❤ ส่งหัวใจ · วันนี้เหลือ ${c.hearts.left}/${c.hearts.cap}`), para('หัวใจคือคะแนนความสัมพันธ์ ครบ 5 ดวงระหว่างสองคน ปลดล็อกการ์ดช่วยเหลือร่วมกัน', 'muted'),
      can && c.hearts.left > 0 ? picker(c.others, null, (id) => act({ type: 'heart', target: id }).then((ok) => ok && toast('ส่งหัวใจแล้ว ❤'))) : para(can ? 'หัวใจวันนี้หมดแล้ว' : 'ส่งหัวใจได้ช่วงกลางวัน กลางคืน และตอนเช้า', 'muted')),
    pairs.length ? card(kind(`🤝 ${me.pairCard}`), para('ทั้งสองคนต้องกดยืนยัน · ทั้งคู่ได้พลังใจ +15 และโรงเรียนได้ความรู้สึกเป็นส่วนหนึ่ง', 'muted'),
      ...pairs.map((p) => btn(p.requestedBy === 'them' ? `ยืนยันกับ ${p.name}` : p.requestedBy === 'me' ? `รอ ${p.name} ยืนยัน…` : `ชวน ${p.name} ใช้การ์ด`, () => act({ type: 'pairCard', target: p.id }), 'go wide', { disabled: p.requestedBy === 'me' || !can }))) : null,
    card(kind('ความสัมพันธ์ของคุณ'), ...(c.pairs.length ? c.pairs.map((p) => el('div', { class: 'row', style: 'justify-content:space-between' }, el('span', { text: p.name }), el('span', { text: `${'❤'.repeat(Math.min(p.hearts, 10))} ${p.hearts}${p.used ? ' · ใช้การ์ดแล้ว' : ''}` }))) : [para('ยังไม่มีหัวใจ', 'muted')])),
  );
}

function renderDiary() {
  const ICON = { hurt: '💔', help: '💚', info: '🔎', mission: '🧭', choice: '✋', night: '🌙' };
  $('#diary').replaceChildren(el('div', { class: 'kind', text: 'บันทึกตัวละคร · สิ่งที่เกิดขึ้นกับคุณ' }),
    ...(me.diary.length ? me.diary.map((d) => el('div', { class: `dl ${d.kind}` }, el('span', { class: 'r', text: `D${d.day}` }), `${ICON[d.kind] || '•'} ${d.text}`)) : [para('ยังไม่มีบันทึก', 'muted')]));
}

function tick() {
  const g = pub?.game; if (!g) return;
  const ms = timerRemaining(g.timer);
  $('#gTimer').textContent = g.finished ? '—' : g.paused ? '⏸' : fmtTime(ms);
}
setInterval(tick, 300);
if (!code) show('joinView');
