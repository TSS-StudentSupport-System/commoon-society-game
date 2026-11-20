import { $, $$, el, call, store, toast, errText, params, getSocket, syncClock, setTheme } from './common.js';
import { drawAvatar } from './pixel.js';
import { BoardView } from './boardui.js';
import { BoardAudio } from './audio.js';
import { ICON } from './icons.js';

const audio = new BoardAudio();

const code = (params.get('room') || '').toUpperCase();
const auth = store.get(`host:${code}`);
const socket = getSocket();
let state = null, board = null;
const MODE = { short: 'ระยะสั้น · 7 วัน (~15 นาที)', medium: 'ระยะกลาง · 15 วัน + ภารกิจทูต (~30 นาที)', marathon: 'มาราธอน · ไม่จำกัดวัน + ภารกิจทูต' };

function fail(msg) {
  $('#connecting').replaceChildren(el('div', { class: 'big', text: msg }), el('p', {}, el('a', { class: 'btn primary', href: '/', text: 'กลับหน้าแรก' })));
  $('#connecting').classList.remove('hidden');
  $('#lobby').classList.add('hidden'); $('#game').classList.add('hidden');
}
if (!code || !auth) fail('เครื่องนี้ไม่ได้เป็นผู้สร้างห้องนี้');

socket.on('connect', async () => {
  if (!auth) return;
  const r = await call('host:attach', { code, hostToken: auth.hostToken });
  if (!r.ok) { store.del(`host:${code}`); fail(errText(r.error)); }
});
socket.on('disconnect', () => toast('การเชื่อมต่อหลุด กำลังเชื่อมใหม่…', 'err'));
socket.on('room:closed', () => { store.del(`host:${code}`); fail('ห้องนี้ถูกปิดแล้ว'); });
socket.on('state:host', (s) => { syncClock(s.serverNow); state = s; render(); });
socket.on('state:public', (s) => syncClock(s.serverNow));

async function cmd(payload) { const r = await call('host:command', payload); if (!r.ok) toast(errText(r.error), 'err'); }

function render() {
  $('#connecting').classList.add('hidden');
  if (state.status === 'lobby') { $('#lobby').classList.remove('hidden'); $('#game').classList.add('hidden'); renderLobby(); }
  else { $('#lobby').classList.add('hidden'); $('#game').classList.remove('hidden'); renderGame(); }
}

// ---------------- Lobby ----------------
let joinUrl = `${location.origin}/?join=${code}`;
$('#roomCode').textContent = code;
$('#joinUrl').textContent = joinUrl.replace(/^https?:\/\//, '');
fetch(`/api/join-url/${code}`).then((r) => r.json()).then((d) => { if (d.ok) { joinUrl = d.url; $('#joinUrl').textContent = joinUrl.replace(/^https?:\/\//, ''); } }).catch(() => {});
$('#qr').src = `/api/qr/${code}`;
$('#boardLink').href = `/board.html?room=${code}`;
$('#playLink').href = `/?join=${code}`;
$('#copyBtn').onclick = async () => { try { await navigator.clipboard.writeText(joinUrl); toast('คัดลอกลิงก์แล้ว'); } catch { toast(joinUrl); } };

function renderLobby() {
  setTheme('day');
  const s = state.settings, players = state.players;
  $('#roomName').textContent = `${s.name} · โฮสต์: ${s.hostName}`;
  $('#pCount').textContent = `${players.length}/${s.maxPlayers}`;
  const need = Math.max(0, s.minPlayers - players.length);
  $('#pReq').textContent = `${MODE[s.mode]} · ${need ? `ต้องการอีก ${need} คน (ขั้นต่ำ ${s.minPlayers})` : `พร้อมเริ่มได้ (สูงสุด ${s.maxPlayers} คน)`}`;
  const grid = $('#playerGrid');
  if (!players.length) grid.replaceChildren(el('div', { class: 'empty', text: 'รอผู้เล่นเข้าร่วม… ให้สแกน QR หรือกรอกรหัสห้อง หรือเติมบอทเพื่อทดลองเล่น' }));
  else grid.replaceChildren(...players.map((p) => {
    const cv = el('canvas'); drawAvatar(cv, p.avatar);
    return el('div', { class: 'pcard pframe' }, cv,
      el('div', { style: 'min-width:0' },
        el('div', { class: 'nick', text: `${p.bot ? '🤖 ' : ''}${p.nickname}` }),
        el('div', { class: 'st' }, el('span', { class: `dot ${p.connected ? 'on' : 'off'}` }), p.bot ? 'บอท' : p.connected ? 'ออนไลน์' : 'ออฟไลน์')),
      el('button', { class: 'kick', title: 'นำออก', 'aria-label': `นำ ${p.nickname} ออก`, onclick: async () => {
        if (!p.bot && !confirm(`นำ "${p.nickname}" ออกจากห้อง?`)) return;
        const r = await call('host:kick', { playerId: p.id }); if (!r.ok) toast(errText(r.error), 'err');
      } }, '✕'));
  }));
  const bots = players.filter((p) => p.bot).length;
  $('#readyInfo').textContent = `คน ${players.length - bots} · บอท ${bots}`;
  const can = players.length >= s.minPlayers;
  $('#startBtn').disabled = !can;
  $('#startBtn').textContent = can ? '▶ เริ่มเกม' : `🔒 ต้องมี ${s.minPlayers} คน`;
}
$$('[data-bots]').forEach((b) => (b.onclick = async () => { const r = await call('host:addBots', { count: Number(b.dataset.bots) }); if (!r.ok) toast(errText(r.error), 'err'); }));
$('#rmBots').onclick = async () => { const r = await call('host:removeBots'); if (!r.ok) toast(errText(r.error), 'err'); };
$('#startBtn').onclick = async () => { const r = await call('host:start'); if (!r.ok) toast(errText(r.error), 'err'); };
$('#closeBtn').onclick = async () => {
  if (!confirm('ปิดห้องนี้? ผู้เล่นทุกคนจะถูกตัดออก')) return;
  await call('host:close'); store.del(`host:${code}`); location.href = '/';
};

// ---------------- Game ----------------
function renderGame() {
  if (!board) board = new BoardView($('#stage'), { audio });
  board.update(state);
  const g = state.game;
  $('#pauseBtn').textContent = g.paused ? '▶ ต่อ' : '⏸ พัก';
  $('#pauseBtn').dataset.cmd = g.paused ? 'resume' : 'pause';
  $('#nextBtn').textContent = g.phase === 'story' ? 'ข้ามเรื่องเล่า ▶' : g.vote ? 'ข้ามขั้นโหวต ▶' : 'ข้ามช่วงนี้ ▶';
  const on = state.players.filter((p) => p.connected).length;
  $('#connCount').textContent = `${on}/${state.players.length} ONLINE`;
  $('#connList').replaceChildren(...state.players.map((p) => el('div', { class: 'row', style: 'gap:.4rem' },
    el('span', { class: `dot ${p.connected ? 'on' : 'off'}` }), `${p.bot ? '🤖 ' : ''}${p.nickname}`, el('small', { class: 'muted', text: p.role ? ` · ${p.role.th}${p.role.acting ? ' (รักษาการ)' : ''}` : '' }))));
  $('#endTools').classList.toggle('hidden', !g.finished);
  if (g.finished) {
    const refl = state.host.reflections || [];
    $('#reflList').replaceChildren(el('strong', { text: `คำตอบสะท้อนคิด ${refl.length}` }),
      ...refl.map((r) => el('div', { class: 'pframe', style: 'padding:.5rem;font-size:.85rem' }, el('b', { text: r.name }), ...r.answers.map((a, i) => el('div', { text: `${i + 1}. ${a || '-'}` })))));
  }
}
$('#dlBtn').onclick = () => {
  const g = state.game;
  const data = { room: state.code, settings: state.settings, endedAt: new Date().toISOString(), winner: g.winner, days: g.day,
    status: g.status.map((s) => ({ key: s.key, th: s.th, value: s.value })), missions: g.missions?.track, history: state.host.history,
    players: g.reveal, pairs: g.pairs, reflections: state.host.reflections };
  const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), download: `moonschool-${state.code}-summary.json` });
  document.body.append(a); a.click(); a.remove();
};
$('#drawer').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cmd]'); if (!b) return;
  if (b.dataset.confirm && !confirm(b.dataset.confirm)) return;
  cmd({ type: b.dataset.cmd, seconds: b.dataset.seconds });
});
const toggleDrawer = (open) => { $('#drawer').classList.toggle('closed', !open); $('#showDrawer').classList.toggle('hidden', open); $('#stage').classList.toggle('with-drawer', open); };
$('#stage').classList.add('with-drawer');
$('#hideDrawer').onclick = () => toggleDrawer(false);
$('#showDrawer').onclick = () => toggleDrawer(true);
document.addEventListener('keydown', (e) => {
  if (!state?.game || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === 'h' || e.key === 'H') toggleDrawer($('#drawer').classList.contains('closed'));
  if (e.key === ' ') { e.preventDefault(); cmd({ type: state.game.paused ? 'resume' : 'pause' }); }
  if (e.key === 'n' || e.key === 'N') cmd({ type: 'next' });
});

// ---------- sound controls ----------
const syncAudioUi = () => {
  for (const [id, on, icon, label] of [['#musicBtn', audio.musicOn, ICON.music, 'เพลง'], ['#sfxBtn', audio.sfxOn, ICON.bell, 'เอฟเฟกต์']]) {
    const b = $(id);
    b.innerHTML = `${icon}<span>${label}</span>`;
    b.classList.toggle('off', !on); b.setAttribute('aria-pressed', String(on)); b.title = `${label}: ${on ? 'เปิด' : 'ปิด'}`;
  }
  $('#volIcon').innerHTML = audio.volume > 0 ? ICON.soundOn : ICON.soundOff;
  $('#volIn').value = Math.round(audio.volume * 100);
};
$('#musicBtn').onclick = () => { audio.unlock(); audio.setMusic(!audio.musicOn); syncAudioUi(); };
$('#sfxBtn').onclick = () => { audio.unlock(); audio.setSfx(!audio.sfxOn); syncAudioUi(); audio.sfx('up'); };
$('#volIn').oninput = (e) => { audio.unlock(); audio.setVolume(Number(e.target.value) / 100); syncAudioUi(); };
syncAudioUi();
