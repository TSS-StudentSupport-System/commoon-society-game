// Original procedural pixel art: student sprites, avatars, event icons.
const hexCache = new Map();
export function rgb(hex) {
  if (hexCache.has(hex)) return hexCache.get(hex);
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  hexCache.set(hex, v);
  return v;
}
export function mixHex(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
}

function paintMap(ctx, map, x0, y0, colors, scale = 1) {
  for (let y = 0; y < map.length; y++) {
    const row = map[y];
    for (let x = 0; x < row.length; x++) {
      const c = colors[row[x]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x0 + x * scale, y0 + y * scale, scale, scale);
    }
  }
}

const SPRITE = {
  0: ['.HHH.', 'HHHHH', 'HSSSH', '.ESE.', 'TTTTT', 'TTTTT', 'STTTS', '.P.P.'],
  1: ['.HHH.', 'HHHHH', '.SSS.', '.ESE.', 'TTTTT', 'TTTTT', 'STTTS', '.P.P.'],
  2: ['.HHH.', 'HHHHH', 'HSSSH', 'HESEH', 'HTTTH', 'TTTTT', 'STTTS', '.P.P.'],
};
const FEET = ['.B.B.', 'B...B'];

/** Tiny walking student, feet at (x, y). shade 0..1 darkens toward night navy. */
export function drawSprite(ctx, x, y, av, frame = 0, shade = 0) {
  const m = SPRITE[av.style] || SPRITE[0];
  const sh = (c) => (shade > 0 ? mixHex(c, '#0E1A33', shade) : c);
  const colors = { H: sh(av.hair), S: sh(av.skin), E: sh('#1A1A1A'), T: sh(av.shirt), P: sh('#2B3550'), B: sh('#151515') };
  paintMap(ctx, [...m, FEET[frame % 2]], Math.round(x) - 2, Math.round(y) - 9, colors);
}

const PORTRAIT = [
  '....HHHH....',
  '..HHHHHHHH..',
  '.HHHHHHHHHH.',
  '.HHSSSSSSHH.',
  '.HSSSSSSSSH.',
  '.HSEESSEESH.',
  '.HSSSSSSSSH.',
  '..SSSMMSSS..',
  '...SSSSSS...',
  '....TTTT....',
  '..TTTTTTTT..',
  '.TTTWTTWTTT.',
  '.STTTTTTTTS.',
  '.STTTTTTTTS.',
  '..PPP..PPP..',
  '..BBB..BBB..',
];
export function drawAvatar(canvas, av) {
  canvas.width = 14; canvas.height = 18;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 14, 18);
  let map = PORTRAIT.map((r) => r);
  if (av.style === 2) map = map.map((r, i) => (i >= 5 && i <= 9 ? 'H' + r.slice(1, 11) + 'H' : r));
  if (av.style === 1) map[0] = '..H.HH.H....';
  paintMap(ctx, map, 1, 1, { H: av.hair, S: av.skin, E: '#1A1A1A', M: '#C0504D', T: av.shirt, W: 'rgba(255,255,255,.45)', P: '#2B3550', B: '#151515' });
  canvas.classList.add('pixel');
}

const IC = { R: '#EF5350', O: '#FF9B35', Y: '#FFD34E', G: '#43B96D', B: '#2457A7', L: '#9FD8F5', W: '#FFFFFF', K: '#1B2440', S: '#F2C9A0', N: '#8B5A2B', P: '#8E5BD6', D: '#9AA5B1' };
const ICONS = {
  heart: ['.RR..RR.', 'RRRRRRRR', 'RWRRRRRR', 'RRRRRRRR', '.RRRRRR.', '..RRRR..', '...RR...', '........'],
  star: ['...YY...', '...YY...', 'YYYYYYYY', '.YYYYYY.', '..YYYY..', '.YYYYYY.', '.YY..YY.', 'YY....YY'],
  festival: ['...RR...', '..RRRR..', '.RWRWRR.', 'RWRWRWRW', '.O....O.', '.O.YY.O.', '.O.YY.O.', '.O.YY.O.'],
  hands: ['.KK..KK.', '.SS..SS.', '.SS..SS.', 'BBBSSGGG', 'BBB..GGG', '.BB..GG.', '.B....G.', '.K....K.'],
  alone: ['KK...K.K', 'SS...S.S', 'DD..BBGG', 'DD..BBGG', 'DD..BBGG', 'D.D.B.G.', '........', 'RRRRRRRR'],
  phone: ['.KKKKKK.', '.KLLLLK.', '.KLRRLK.', '.KLLLLK.', '.KLRRLK.', '.KLLLLK.', '.KKWWKK.', '.KKKKKK.'],
  alert: ['...RR...', '..RRRR..', '..RWWR..', '.RRWWRR.', '.RRWWRR.', 'RRRRRRRR', 'RRRWWRRR', 'RRRRRRRR'],
  coin: ['..YYYY..', '.YOOOOY.', 'YOYYYYOY', 'YOYOOOOY', 'YOOYYOOY', 'YOOOOYOY', '.YOYYYY.', '..YYYY..'],
  bolt: ['....YY..', '...YY...', '..YY....', '.YYYYYY.', '....YY..', '...YY...', '..YY....', '.Y......'],
  box: ['OOOOOOOO', 'ONNNNNNO', 'ONNOONNO', 'OOOOOOOO', 'ONNNNNNO', 'ONNNNNNO', 'ONNNNNNO', 'OOOOOOOO'],
  scroll: ['NWWWWWWN', '.WKKKKW.', '.WWWWWW.', '.WKKKWW.', '.WWWWWW.', '.WKKKKW.', '.WWWWWW.', 'NWWWWWWN'],
  people: ['.K..K..K', '.S..S..S', 'BB.RR.GG', 'BB.RR.GG', 'BB.RR.GG', '.K..K..K', '........', '........'],
  shield: ['BBBBBBBB', 'BLLLLLLB', 'BLLYYLLB', 'BLYYYYLB', 'BLLYYLLB', '.BLLLLB.', '..BLLB..', '...BB...'],
};
export function drawIcon(canvas, key) {
  canvas.width = 10; canvas.height = 10;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 10, 10);
  paintMap(ctx, ICONS[key] || ICONS.alert, 1, 1, IC);
  canvas.classList.add('pixel');
}
