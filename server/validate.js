import crypto from 'node:crypto';

const seg = new Intl.Segmenter('th', { granularity: 'grapheme' });
export const graphemeLength = (s) => [...seg.segment(s)].length;
export const graphemeSlice = (s, n) => [...seg.segment(s)].slice(0, n).map((x) => x.segment).join('');

export function cleanText(input, maxGraphemes) {
  if (typeof input !== 'string') return '';
  // strip control chars & bidi overrides, collapse whitespace
  let s = input.replace(/[\u0000-\u001F\u007F‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim();
  if (graphemeLength(s) > maxGraphemes) s = graphemeSlice(s, maxGraphemes);
  return s;
}

export const newToken = () => crypto.randomBytes(16).toString('hex');
export const newId = () => crypto.randomBytes(6).toString('base64url');

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export const int = (v, min, max, dflt) => {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return dflt;
  return Math.min(max, Math.max(min, n));
};
export const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Simple per-socket rate limiter (token bucket).
export function rateLimiter(capacity = 20, refillPerSec = 10) {
  let tokens = capacity, last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(capacity, tokens + ((now - last) / 1000) * refillPerSec);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}
