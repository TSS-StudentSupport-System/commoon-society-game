// SchoolScene — the animated pixel-art school (320×180 internal), with smooth day/night.
import { mixHex, drawSprite, rgb } from './pixel.js';

const W = 320, H = 180;
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(20261119);
const STARS = Array.from({ length: 80 }, () => ({ x: Math.floor(rand() * W), y: Math.floor(rand() * 100), p: rand() * 6.28, big: rand() < 0.12 }));
const WINDOW_LIT = Array.from({ length: 60 }, () => rand() < 0.72);
const TUFTS = Array.from({ length: 140 }, () => ({ x: Math.floor(rand() * W), y: 120 + Math.floor(rand() * 58) }));
const FLOWERS = Array.from({ length: 40 }, () => ({ x: Math.floor(rand() * W), y: 171 + Math.floor(rand() * 8), c: ['#EF5350', '#FFD34E', '#FFFFFF', '#FF9B35', '#8E5BD6'][Math.floor(rand() * 5)] }));
const DEFAULT_AVATARS = ['#2457A7', '#43B96D', '#FF9B35', '#EF5350', '#8E5BD6', '#38A9E8', '#F2C14E', '#1FA59A', '#2457A7', '#EF5350']
  .map((shirt, i) => ({ shirt, skin: ['#F2C9A0', '#E0AC7E', '#C68B5B', '#F7D9BC'][i % 4], hair: ['#2B1B12', '#111111', '#5A3A1E', '#A0522D'][i % 4], style: i % 3 }));

export class SchoolScene {
  constructor(canvas) {
    this.c = canvas; canvas.width = W; canvas.height = H; canvas.classList.add('pixel');
    this.ctx = canvas.getContext('2d'); this.ctx.imageSmoothingEnabled = false;
    this.n = 0; this.target = 0;           // night amount 0..1
    this.mood = 0.5; this.eventType = null;
    this.clouds = Array.from({ length: 5 }, (_, i) => ({ x: i * 75 + rand() * 30, y: 12 + rand() * 34, s: 2 + rand() * 3, size: 5 + Math.floor(rand() * 4) }));
    this.confetti = [];
    this.setStudents(DEFAULT_AVATARS);
    this.t = 0; this.last = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  setTime(mode, instant = false) { this.target = mode === 'night' ? 1 : 0; if (instant) this.n = this.target; }
  setMood(avg) { this.mood = Math.max(0, Math.min(1, avg / 100)); }
  setEvent(type) { this.eventType = type || null; }
  setStudents(avatars) {
    const list = (avatars && avatars.length ? avatars : DEFAULT_AVATARS).slice(0, 28);
    const old = this.walkers || [];
    this.walkers = list.map((av, i) => old[i] ? { ...old[i], av } : {
      av, x: rand() * W, y: 152 + Math.floor(rand() * 13), v: 6 + rand() * 10, dir: rand() < 0.5 ? -1 : 1, ph: rand() * 10,
      pause: 0,
    });
  }

  loop(ts) {
    const dt = Math.min(0.1, (ts - this.last) / 1000);
    if (dt >= 1 / 30 || dt < 0) { this.last = ts; this.update(dt); this.draw(); }
    requestAnimationFrame(this.loop);
  }

  update(dt) {
    this.t += dt;
    const d = this.target - this.n;
    this.n += Math.sign(d) * Math.min(Math.abs(d), dt / 2.5);  // 2.5 s smooth transition
    for (const c of this.clouds) { c.x += c.s * dt; if (c.x > W + 30) c.x = -30; }
    for (const w of this.walkers) {
      if (w.pause > 0) { w.pause -= dt; continue; }
      w.x += w.v * w.dir * dt;
      if (w.x < -6) w.x = W + 6; if (w.x > W + 6) w.x = -6;
      if (Math.random() < dt * 0.08) w.pause = 1 + Math.random() * 2;
      if (Math.random() < dt * 0.04) w.dir *= -1;
    }
    if (this.eventType === 'positive' && this.confetti.length < 60 && Math.random() < 0.8) {
      this.confetti.push({ x: 90 + Math.random() * 140, y: 40, vy: 10 + Math.random() * 15, vx: -6 + Math.random() * 12, c: ['#EF5350', '#FFD34E', '#43B96D', '#38A9E8', '#FF9B35'][Math.floor(Math.random() * 5)] });
    }
    this.confetti = this.confetti.filter((p) => { p.y += p.vy * dt; p.x += p.vx * dt; return p.y < 170; });
  }

  R(x, y, w, h, c) { this.ctx.fillStyle = c; this.ctx.fillRect(Math.round(x), Math.round(y), w, h); }
  circle(cx, cy, r, c) { this.ctx.fillStyle = c; for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(r * r - y * y)); this.ctx.fillRect(Math.round(cx - w), Math.round(cy + y), 2 * w + 1, 1); } }
  m(day, night) { return mixHex(day, night, this.n); }

  draw() {
    const { n, ctx } = this;
    const gloom = this.mood < 0.35 ? (0.35 - this.mood) / 0.35 : 0;

    // Sky bands
    const SD = [rgb('#2C8ED9'), rgb('#A8DDF7')], SN = [rgb('#070C18'), rgb('#1E3A63')];
    for (let y = 0; y < 122; y += 4) {
      const t = y / 122, c = [0, 1, 2].map((k) => {
        const d = SD[0][k] + (SD[1][k] - SD[0][k]) * t, nn = SN[0][k] + (SN[1][k] - SN[0][k]) * t;
        return Math.round(d + (nn - d) * n);
      });
      this.R(0, y, W, 4, `rgb(${c})`);
    }
    if (gloom > 0) { ctx.fillStyle = `rgba(90,96,110,${0.35 * gloom * (1 - n * 0.6)})`; ctx.fillRect(0, 0, W, 122); }

    // Stars
    if (n > 0.05) for (const s of STARS) {
      const a = n * (0.55 + 0.45 * Math.sin(this.t * 2 + s.p));
      ctx.fillStyle = `rgba(255,246,210,${a.toFixed(2)})`;
      ctx.fillRect(s.x, s.y, 1, 1);
      if (s.big) { ctx.fillRect(s.x - 1, s.y, 3, 1); ctx.fillRect(s.x, s.y - 1, 1, 3); }
    }
    // Sun & moon
    const sy = 24 + n * 110;
    if (sy < 125) { ctx.fillStyle = 'rgba(255,230,120,.25)'; this.circle(262, sy, 14, 'rgba(255,230,120,.22)'); this.circle(262, sy, 9, '#FFE47A'); this.circle(260, sy - 2, 5, '#FFF4B8'); }
    const my = 132 - n * 104;
    if (my < 125) { this.circle(58, my, 8, 'rgba(255,246,210,.15)'); this.circle(58, my, 6, '#F4F1DE'); this.circle(61, my - 2, 5, this.m('#7FC3EC', '#0D1830')); }

    // Clouds
    const cloudCol = gloom > 0.3 ? '#9AA5B1' : '#FFFFFF';
    for (const c of this.clouds) {
      ctx.globalAlpha = (1 - n) * 0.9 + n * 0.12 + gloom * 0.2;
      const col = n > 0.5 ? '#2A3D63' : cloudCol;
      this.circle(c.x, c.y, c.size, col); this.circle(c.x + c.size, c.y + 2, c.size - 1, col); this.circle(c.x - c.size, c.y + 2, c.size - 2, col);
      this.R(c.x - c.size * 2, c.y + 2, c.size * 4, c.size - 1, col);
      ctx.globalAlpha = 1;
    }

    // Far hills & city
    const hill = this.m('#79C3A0', '#10233D'), hill2 = this.m('#5DAE87', '#0C1C33');
    for (let x = 0; x < W; x++) {
      const y = Math.round(106 - (Math.sin(x * 0.028) * 5 + Math.sin(x * 0.011 + 1) * 6));
      this.R(x, y, 1, 122 - y, hill);
      const y2 = Math.round(114 - (Math.sin(x * 0.05 + 2) * 3 + Math.sin(x * 0.017) * 3));
      this.R(x, y2, 1, 122 - y2, hill2);
    }

    // Ground
    this.R(0, 120, W, 60, this.m('#4CC274', '#163A2C'));
    const tuft = this.m('#3AA35F', '#112E23');
    for (const t of TUFTS) this.R(t.x, t.y, 2, 1, tuft);
    // Courtyard + walkway
    const stone = this.m('#E6D6B0', '#323A55'), stoneDk = this.m('#CDBB92', '#262C44');
    this.R(92, 121, 136, 6, stone); this.R(150, 121, 20, 30, stone);
    this.R(0, 148, W, 19, stone); this.R(0, 148, W, 1, stoneDk); this.R(0, 166, W, 1, stoneDk);
    for (let x = 0; x < W; x += 12) this.R(x, 157, 6, 1, stoneDk);

    this.drawGym(); this.drawLibrary(); this.drawMain();
    this.drawTrees(); this.drawPlayground(); this.drawLamps();

    // Flower bed
    this.R(0, 169, W, 11, this.m('#3B9E5E', '#10291F'));
    for (const f of FLOWERS) { if (gloom > 0.6 && f.x % 3) continue; this.R(f.x, f.y, 1, 1, n > 0.6 ? '#4A5878' : f.c); }

    // Students
    const shade = n * 0.45;
    const sorted = [...this.walkers].sort((a, b) => a.y - b.y);
    sorted.forEach((w, i) => {
      if (n > 0.6 && i % 2) return; // fewer students out at night
      const frame = w.pause > 0 ? 0 : Math.floor((this.t * 6 + w.ph)) % 2;
      drawSprite(ctx, w.x, w.y, w.av, frame, shade);
    });

    // Event overlays
    if (this.eventType === 'positive') {
      for (const p of this.confetti) this.R(p.x, p.y, 1, 2, p.c);
    }
    if (this.eventType === 'negative' || this.eventType === 'challenge') {
      const on = Math.floor(this.t * 2) % 2 === 0;
      const col = this.eventType === 'negative' ? '#EF5350' : '#FF9B35';
      const bx = 196, by = 30 + (on ? 0 : 1);
      this.R(bx, by, 11, 11, '#FFFFFF'); this.R(bx + 1, by + 1, 9, 9, col);
      this.R(bx + 3, by + 11, 3, 2, '#FFFFFF');
      if (this.eventType === 'negative') { this.R(bx + 5, by + 2, 1, 5, '#FFFFFF'); this.R(bx + 5, by + 8, 1, 1, '#FFFFFF'); }
      else { this.R(bx + 4, by + 2, 3, 1, '#FFFFFF'); this.R(bx + 6, by + 3, 1, 2, '#FFFFFF'); this.R(bx + 5, by + 5, 1, 2, '#FFFFFF'); this.R(bx + 5, by + 8, 1, 1, '#FFFFFF'); }
      if (this.eventType === 'negative') {
        const a = 0.10 + 0.08 * Math.sin(this.t * 3);
        const g = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 200);
        g.addColorStop(0, 'rgba(239,83,80,0)'); g.addColorStop(1, `rgba(239,83,80,${a.toFixed(3)})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
    }
    // High mood sparkles
    if (this.mood > 0.7) {
      for (let i = 0; i < 8; i++) {
        const k = (this.t * 0.7 + i * 0.37) % 1;
        const x = 100 + ((i * 53) % 120), y = 60 + ((i * 29) % 50) - k * 10;
        ctx.fillStyle = `rgba(255,236,140,${(1 - k).toFixed(2)})`;
        ctx.fillRect(x, y, 1, 1); ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3);
      }
    }
  }

  win(x, y, w, h, i) {
    const lit = WINDOW_LIT[i % WINDOW_LIT.length];
    const { n, ctx } = this;
    if (lit && n > 0.05) { ctx.fillStyle = `rgba(255,211,78,${(0.22 * n).toFixed(2)})`; ctx.fillRect(x - 2, y - 2, w + 4, h + 4); }
    this.R(x - 1, y - 1, w + 2, h + 2, this.m('#FFFFFF', '#141C33'));
    this.R(x, y, w, h, mixHex('#8ED0F0', lit ? '#FFD34E' : '#16203A', n));
    if (n < 0.5) this.R(x + 1, y + 1, 2, 1, 'rgba(255,255,255,.8)');
    if (lit && n > 0.5) this.R(x, y + h - 2, w, 2, '#F2B43A');
  }

  drawMain() {
    // body
    this.R(98, 58, 124, 64, this.m('#F6E7C8', '#27355A'));
    this.R(98, 58, 4, 64, this.m('#E2CDA6', '#1F2B4B'));
    this.R(218, 58, 4, 64, this.m('#E2CDA6', '#1F2B4B'));
    this.R(96, 118, 128, 4, this.m('#B9A58A', '#1B2440'));
    // roof
    const roof = this.m('#D2573E', '#4E2433'), roofHi = this.m('#E9785D', '#64303F');
    for (let i = 0; i < 10; i++) this.R(104 - i, 48 + i, 112 + i * 2, 1, i === 0 ? roofHi : roof);
    // tower
    this.R(146, 26, 28, 32, this.m('#F6E7C8', '#27355A'));
    for (let i = 0; i < 8; i++) this.R(160 - i - 2, 18 + i, (i + 2) * 2, 1, roof);
    this.circle(160, 37, 6, this.m('#FFFFFF', '#FFE9A8'));
    this.circle(160, 37, 5, this.m('#FFFDF5', '#FFE08A'));
    const ang = this.t * 0.3;
    this.R(160, 33, 1, 4, '#1B2440');
    this.R(160 + Math.round(Math.cos(ang) * 3), 37 + Math.round(Math.sin(ang) * 3), 1, 1, '#1B2440');
    this.R(160, 37, 1, 1, '#EF5350');
    // flag
    this.R(160, 5, 1, 14, '#5A5F6E');
    const wave = Math.floor(this.t * 3) % 2;
    this.R(161, 5 + wave, 9, 2, this.m('#2457A7', '#19365C')); this.R(161, 7 + wave, 9, 2, this.m('#FF9B35', '#B86A22')); this.R(161, 9, 9 - wave, 1, this.m('#43B96D', '#2A6B44'));
    // windows
    let i = 0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) {
      const x = 105 + c * 12.5, y = 63 + r * 17;
      if (r === 2 && (c === 4)) { i++; continue; }
      this.win(Math.round(x), y, 7, 9, i++);
    }
    this.win(155, 42, 10, 6, 7);
    // door + sign
    this.R(150, 98, 20, 24, this.m('#8B5A2B', '#3A2418'));
    this.R(152, 100, 7, 22, this.m('#A86E3A', this.n > 0.5 ? '#F2B43A' : '#4A2E1E'));
    this.R(161, 100, 7, 22, this.m('#A86E3A', this.n > 0.5 ? '#F2B43A' : '#4A2E1E'));
    this.R(144, 93, 32, 4, this.m('#2457A7', '#F28C28'));
    for (let k = 0; k < 7; k++) this.R(146 + k * 4, 94, 2, 2, '#FFFFFF');
  }

  drawGym() {
    const body = this.m('#A9CDEB', '#22385E');
    this.R(12, 86, 78, 36, body);
    const roof = this.m('#2457A7', '#162443');
    for (let x = 10; x < 92; x++) { const h = Math.round(10 * Math.sin(Math.PI * (x - 10) / 82)); this.R(x, 86 - h, 1, h + 2, roof); }
    for (let k = 0; k < 6; k++) this.win(18 + k * 11, 94, 6, 5, 30 + k);
    this.R(40, 104, 22, 18, this.m('#5A6B85', '#151F38'));
    for (let y = 106; y < 122; y += 3) this.R(40, y, 22, 1, this.m('#71839F', '#1C2846'));
  }

  drawLibrary() {
    this.R(230, 74, 78, 48, this.m('#F2B880', '#3A2E4F'));
    this.R(228, 70, 82, 5, this.m('#C98A55', '#2A2140'));
    for (let k = 0; k < 5; k++) this.R(236 + k * 16, 78, 3, 44, this.m('#FBE3C4', '#4A3D63'));
    for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) this.win(242 + k * 16, 82 + r * 18, 6, 9, 40 + r * 4 + k);
  }

  tree(x, y, r) {
    this.R(x - 1, y - 7, 3, 8, this.m('#7A4B26', '#2B1D14'));
    this.circle(x, y - 12, r, this.m('#2E8B57', '#123022'));
    this.circle(x - 2, y - 14, r - 3, this.m('#43B96D', '#183B2B'));
    this.R(x - 3, y - 17, 2, 1, this.m('#7ED69B', '#1F4A35'));
  }
  drawTrees() { this.tree(6, 122, 8); this.tree(95, 122, 6); this.tree(225, 122, 6); this.tree(314, 122, 8); this.tree(30, 146, 7); this.tree(292, 146, 7); }

  drawPlayground() {
    const metal = this.m('#EF5350', '#5A2A35');
    this.R(244, 128, 1, 18, metal); this.R(262, 128, 1, 18, metal); this.R(244, 128, 19, 1, metal);
    const sw = Math.round(Math.sin(this.t * 2) * 2);
    this.R(250 + sw, 129, 1, 10, '#5A5F6E'); this.R(255 + sw, 129, 1, 10, '#5A5F6E'); this.R(249 + sw, 139, 8, 1, this.m('#FFD34E', '#6B5A2A'));
    // goal
    this.R(52, 128, 1, 14, '#FFFFFF'); this.R(72, 128, 1, 14, '#FFFFFF'); this.R(52, 128, 21, 1, '#FFFFFF');
    for (let x = 54; x < 72; x += 3) this.R(x, 129, 1, 13, 'rgba(255,255,255,.35)');
  }

  drawLamps() {
    const { n, ctx } = this;
    for (const x of [18, 84, 136, 184, 236, 302]) {
      if (n > 0.05) {
        const g = ctx.createRadialGradient(x, 132, 1, x, 132, 22);
        g.addColorStop(0, `rgba(242,140,40,${(0.5 * n).toFixed(2)})`); g.addColorStop(1, 'rgba(242,140,40,0)');
        ctx.fillStyle = g; ctx.fillRect(x - 22, 110, 44, 44);
      }
      this.R(x, 132, 1, 17, this.m('#3C4252', '#1A1F2B'));
      this.R(x - 1, 130, 3, 3, n > 0.3 ? '#FFD34E' : '#C9CED8');
    }
  }
}
