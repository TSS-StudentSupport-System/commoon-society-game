// Shared client helpers. All user text is inserted via textContent (no innerHTML with data).
/* global io */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}

export const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
};

export const ERRORS = {
  no_room: 'ไม่พบห้องนี้ ตรวจสอบรหัสห้องอีกครั้ง',
  room_full: 'ห้องเต็มแล้ว',
  game_started: 'เกมเริ่มไปแล้ว เข้าร่วมใหม่ไม่ได้',
  nickname_taken: 'ชื่อนี้มีคนใช้แล้ว ลองชื่ออื่น',
  bad_nickname: 'กรุณาใส่ชื่อเล่น',
  not_enough_players: 'ผู้เล่นยังไม่ครบจำนวนขั้นต่ำ',
  not_host: 'คุณไม่ใช่ผู้ดูแลห้องนี้',
  kicked: 'คุณถูกนำออกจากห้องนี้',
  bad_session: 'เซสชันหมดอายุ กรุณาเข้าร่วมใหม่',
  rate_limited: 'ช้าลงหน่อยนะ ลองใหม่อีกครั้ง',
  timeout: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้',
  server_error: 'เกิดข้อผิดพลาด ลองอีกครั้ง',
};
export const errText = (e) => ERRORS[e] || e || 'เกิดข้อผิดพลาด';

let socket;
export function getSocket() {
  if (!socket) socket = io({ transports: ['websocket', 'polling'], reconnectionDelayMax: 3000 });
  return socket;
}
export function call(event, payload = {}) {
  return new Promise((resolve) => {
    getSocket().timeout(8000).emit(event, payload, (err, res) => resolve(err ? { ok: false, error: 'timeout' } : res));
  });
}

export function toast(msg, kind = '') {
  let box = $('#toasts');
  if (!box) { box = el('div', { id: 'toasts' }); document.body.append(box); }
  const t = el('div', { class: `toast pframe ${kind}`, text: msg, role: 'status' });
  box.append(t);
  setTimeout(() => t.remove(), 3500);
}

// Server clock offset so every screen counts down together.
let clockOffset = 0;
export const syncClock = (serverNow) => { if (serverNow) clockOffset = serverNow - Date.now(); };
export const now = () => Date.now() + clockOffset;
export function timerRemaining(timer) {
  if (!timer) return 0;
  return timer.paused ? timer.remaining : Math.max(0, timer.endsAt - now());
}
export const fmtTime = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function setTheme(mode) {
  document.documentElement.dataset.theme = mode;
  document.body.dataset.theme = mode;
}

export const params = new URLSearchParams(location.search);
export function openModal(id) { $(id).classList.remove('hidden'); }
export function closeModal(id) { $(id).classList.add('hidden'); }
