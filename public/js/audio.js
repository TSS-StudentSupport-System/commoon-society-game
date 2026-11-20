// Procedural 8-bit music + sound effects for the projector board (Web Audio, no audio files, no network).
// Browsers block sound until the first click on the page, so the host's first click unlocks it.
import { store } from './common.js';

const NOTE = (n) => {                      // 'C4', 'F#3', 'Bb4' → Hz ; '-' = rest
  if (!n || n === '-') return 0;
  const m = n.match(/^([A-G])([#b]?)(\d)$/); if (!m) return 0;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * 2 ** ((base + (Number(m[3]) - 4) * 12 - 9) / 12);
};
const seq = (s) => s.trim().split(/\s+/);  // "C4 E4 G4 -" → one note per step

// Original short loops (step = 8th note). lead / bass / drums ('k' kick, 's' snare, 'h' hat, '-' rest)
const SONGS = {
  day: { bpm: 112, wave: 'square', lead: seq('E4 G4 A4 G4 E4 D4 C4 D4 E4 G4 A4 C5 B4 A4 G4 - F4 A4 C5 A4 G4 E4 D4 E4 F4 E4 D4 C4 D4 - C4 -'),
    bass: seq('C3 - G2 - C3 - G2 - A2 - E2 - A2 - E2 - F2 - C3 - F2 - C3 - G2 - D3 - G2 - G2 -'), drums: seq('k h s h k h s h') },
  night: { bpm: 76, wave: 'triangle', lead: seq('A4 - C5 - B4 - E4 - G4 - F4 - E4 - - - D4 - F4 - E4 - A3 - C4 - B3 - A3 - - -'),
    bass: seq('A2 - - - E2 - - - F2 - - - E2 - - - D2 - - - A2 - - - F2 - - - E2 - - -'), drums: seq('k - - - - - h - k - - - - - - -') },
  story: { bpm: 66, wave: 'sine', lead: seq('E5 - - B4 - - C5 - D5 - - A4 - - - - E5 - - B4 - - G5 - F#5 - - - - - - -'),
    bass: seq('E2 - - - - - - - C2 - - - - - - - E2 - - - - - - - B1 - - - - - - -'), drums: seq('- - - - - - - -') },
  vote: { bpm: 132, wave: 'square', lead: seq('E4 - E4 F4 E4 - - - E4 - E4 G4 F4 - - -'),
    bass: seq('E2 E2 E2 E2 E2 E2 E2 E2 F2 F2 F2 F2 E2 E2 E2 E2'), drums: seq('k h h h s h h h') },
  card: { bpm: 90, wave: 'triangle', lead: seq('C5 - G4 - E4 - G4 - D5 - A4 - F4 - A4 -'),
    bass: seq('C3 - - - - - - - D3 - - - - - - -'), drums: seq('- - h - - - h -') },
};

export class BoardAudio {
  constructor({ key = 'audio' } = {}) {
    this.key = key;
    const s = store.get(key) || {};
    this.musicOn = s.musicOn ?? true; this.sfxOn = s.sfxOn ?? true; this.volume = s.volume ?? 0.6;
    this.ctx = null; this.song = null; this.step = 0; this.nextAt = 0; this.timer = null;
    const unlock = () => this.unlock();
    ['pointerdown', 'keydown'].forEach((t) => window.addEventListener(t, unlock, { once: false, passive: true }));
  }
  save() { store.set(this.key, { musicOn: this.musicOn, sfxOn: this.sfxOn, volume: this.volume }); }
  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain(); this.musicBus.connect(this.master);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.master);
      this.applyLevels();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.wanted && !this.timer) this.play(this.wanted, true);
  }
  applyLevels() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volume, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.musicOn ? 0.22 : 0, t, 0.3);
    this.sfxBus.gain.setTargetAtTime(this.sfxOn ? 0.5 : 0, t, 0.05);
  }
  setMusic(on) { this.musicOn = on; this.save(); this.applyLevels(); }
  setSfx(on) { this.sfxOn = on; this.save(); this.applyLevels(); }
  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); this.save(); this.applyLevels(); }

  // ───────── music ─────────
  play(name, force = false) {
    this.wanted = name;
    if (!this.ctx || (!force && this.song === SONGS[name])) return;
    this.song = SONGS[name] || null; this.step = 0;
    this.nextAt = this.ctx.currentTime + 0.12;
    clearInterval(this.timer); this.timer = null;
    if (!this.song) return;
    this.timer = setInterval(() => this.schedule(), 50);
  }
  stop() { this.wanted = null; this.song = null; clearInterval(this.timer); this.timer = null; }
  schedule() {
    const s = this.song; if (!s || !this.ctx) return;
    const stepLen = 60 / s.bpm / 2;
    while (this.nextAt < this.ctx.currentTime + 0.2) {
      const i = this.step, t = this.nextAt;
      const f = NOTE(s.lead[i % s.lead.length]); if (f) this.tone(f, t, stepLen * 0.9, s.wave, 0.35, this.musicBus);
      const b = NOTE(s.bass[i % s.bass.length]); if (b) this.tone(b, t, stepLen * 0.95, 'triangle', 0.5, this.musicBus);
      const d = s.drums[i % s.drums.length];
      if (d === 'k') this.kick(t, this.musicBus); if (d === 's') this.noise(t, 0.08, 0.35, 1800, this.musicBus); if (d === 'h') this.noise(t, 0.03, 0.15, 7000, this.musicBus);
      this.step++; this.nextAt += stepLen;
    }
  }

  // ───────── synth voices ─────────
  tone(freq, t, dur, wave = 'square', gain = 0.3, bus = this.sfxBus, slideTo = null) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = wave; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(t, dur, gain, freq, bus = this.sfxBus) {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(bus); src.start(t);
  }
  kick(t, bus) { this.tone(150, t, 0.15, 'sine', 0.8, bus, 40); }
  arp(notes, step = 0.09, wave = 'square', gain = 0.3) {
    const t0 = this.ctx.currentTime + 0.02;
    notes.forEach((n, i) => { const f = NOTE(n); if (f) this.tone(f, t0 + i * step, step * 1.6, wave, gain); });
  }

  // ───────── sound effects ─────────
  sfx(name) {
    if (!this.ready || !this.sfxOn) return;
    const t = this.ctx.currentTime + 0.02;
    switch (name) {
      case 'morning': return this.arp(['C5', 'E5', 'G5', 'C6'], 0.11, 'triangle', 0.35);          // วันใหม่
      case 'night': return this.arp(['A4', 'E4', 'C4', 'A3'], 0.16, 'sine', 0.35);                 // แสงจันทร์มา
      case 'card': this.noise(t, 0.12, 0.3, 3000); return this.tone(NOTE('G5'), t + 0.08, 0.15, 'square', 0.2); // พลิกไพ่
      case 'tick': return this.tone(NOTE('A5'), t, 0.05, 'square', 0.12);
      case 'up': return this.arp(['E5', 'A5'], 0.07, 'square', 0.2);
      case 'down': return this.arp(['E4', 'Bb3'], 0.09, 'square', 0.22);
      case 'bully': this.kick(t, this.sfxBus); return this.tone(NOTE('C3'), t, 0.5, 'sawtooth', 0.18, this.sfxBus, NOTE('F#2'));
      case 'voteOpen': return this.arp(['E4', '-', 'E4', '-', 'E5'], 0.1, 'square', 0.3);         // ไซเรนแจ้งเหตุ
      case 'cast': return this.arp(['A5', 'A5', 'A5'], 0.12, 'square', 0.25);
      case 'gavel': this.kick(t, this.sfxBus); return this.noise(t, 0.15, 0.6, 900);              // ค้อนประกาศผล
      case 'mission': return this.arp(['C5', 'E5', 'G5', 'C6', 'G5', 'C6'], 0.08, 'square', 0.3);
      case 'missionFail': return this.arp(['G4', 'F#4', 'F4', 'E4'], 0.18, 'sawtooth', 0.2);
      case 'project': return this.arp(['G4', 'C5', 'E5', 'G5', 'E5', 'G5', 'C6'], 0.08, 'triangle', 0.35);
      case 'news': return this.arp(['B5', 'G5', 'B5'], 0.06, 'square', 0.2);
      case 'act': return this.arp(['D5', '-', 'A4', 'D5', 'F5'], 0.14, 'triangle', 0.3);
      case 'win': return this.arp(['C5', 'E5', 'G5', 'C6', '-', 'A5', 'C6', 'E6'], 0.12, 'square', 0.35);
      case 'lose': return this.arp(['A4', 'G4', 'F4', 'E4', '-', 'D4', 'C#4', 'D4'], 0.18, 'triangle', 0.35);
      default: return undefined;
    }
  }
}
