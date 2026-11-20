import { $, $$, call, store, toast, errText, params, openModal, setTheme } from './common.js';
import { SchoolScene } from './scene.js';

const scene = new SchoolScene($('#bg'));
let mode = 'night';
const applyTheme = () => { setTheme(mode); scene.setTime(mode); };
setInterval(() => { mode = mode === 'day' ? 'night' : 'day'; applyTheme(); }, 14000);

const nameIn = $('#nameIn');
nameIn.value = store.get('nickname') || '';
const getName = () => {
  const n = nameIn.value.trim();
  if (!n) { toast('ตั้งชื่อตัวละครก่อนนะ', 'err'); nameIn.focus(); return null; }
  store.set('nickname', n); return n;
};

$('#createBtn').onclick = () => { if (getName()) openModal('#createModal'); };
$('#joinBtn').onclick = () => { if (getName()) { openModal('#joinModal'); $('#jCode').focus(); } };
$('#howBtn').onclick = () => openModal('#howModal');
$('#aboutBtn').onclick = () => openModal('#aboutModal');
$$('[data-close]').forEach((b) => (b.onclick = () => { b.closest('.modal').classList.add('hidden'); stopScan(); }));
$$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) { m.classList.add('hidden'); stopScan(); } }));

$$('[data-mode]').forEach((b) => (b.onclick = async () => {
  const hostName = getName(); if (!hostName) return;
  $$('[data-mode]').forEach((x) => (x.disabled = true));
  const res = await call('room:create', { settings: { mode: b.dataset.mode, hostName } });
  $$('[data-mode]').forEach((x) => (x.disabled = false));
  if (!res.ok) return toast(errText(res.error), 'err');
  store.set(`host:${res.code}`, { hostToken: res.hostToken });
  location.href = `/host.html?room=${res.code}`;
}));

async function join(code) {
  const nickname = getName(); if (!nickname) return;
  code = code.trim().toUpperCase();
  const saved = store.get(`player:${code}`);
  if (saved) {
    const r = await call('player:resume', { code, playerId: saved.playerId, token: saved.token });
    if (r.ok) return (location.href = `/play.html?room=${code}`);
    store.del(`player:${code}`);
  }
  const res = await call('room:join', { code, nickname });
  if (!res.ok) return toast(errText(res.error), 'err');
  store.set(`player:${res.code}`, { playerId: res.playerId, token: res.token });
  location.href = `/play.html?room=${res.code}`;
}
$('#joinForm').onsubmit = (e) => { e.preventDefault(); join($('#jCode').value); };

// QR scanning (BarcodeDetector where supported; otherwise use the phone's camera app)
let stream = null, scanTimer = null;
function stopScan() { clearInterval(scanTimer); stream?.getTracks().forEach((t) => t.stop()); stream = null; $('#scanVideo').classList.add('hidden'); }
$('#scanBtn').onclick = async () => {
  if (!('BarcodeDetector' in window)) return toast('เครื่องนี้สแกนในหน้าเว็บไม่ได้ ใช้แอปกล้องสแกน QR แทน', 'err');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const v = $('#scanVideo'); v.srcObject = stream; v.classList.remove('hidden'); await v.play();
    const det = new window.BarcodeDetector({ formats: ['qr_code'] });
    scanTimer = setInterval(async () => {
      const codes = await det.detect(v).catch(() => []);
      const raw = codes[0]?.rawValue; if (!raw) return;
      const m = raw.match(/join=([A-Z0-9]+)/i) || raw.match(/^([A-Z0-9]{4,8})$/i);
      if (m) { stopScan(); $('#jCode').value = m[1].toUpperCase(); join(m[1]); }
    }, 400);
  } catch { toast('เปิดกล้องไม่ได้', 'err'); stopScan(); }
};

const joinCode = params.get('join');
if (joinCode) { $('#jCode').value = joinCode.toUpperCase(); if (nameIn.value) openModal('#joinModal'); else { nameIn.focus(); toast('ตั้งชื่อตัวละคร แล้วกด "เข้าร่วมห้อง"'); } }
applyTheme();
