// Minimal pixel-art icons (8×8 grid, currentColor) that match the game's 8-bit look.
const px = (cells) => cells.map(([x, y, w = 1, h = 1]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`).join('');
const svg = (body, label) => `<svg class="pxi" viewBox="0 0 8 8" width="20" height="20" shape-rendering="crispEdges" fill="currentColor" role="img" aria-label="${label}">${body}</svg>`;
const SPEAKER = [[0, 3, 1, 2], [1, 2, 1, 4], [2, 1, 1, 6]];
export const ICON = {
  soundOn: svg(px([...SPEAKER, [4, 3, 1, 2], [5, 2], [5, 5], [6, 1], [6, 6], [7, 2, 1, 4]]), 'เสียงเปิด'),
  soundOff: svg(px([...SPEAKER, [4, 2], [5, 3], [6, 4], [7, 5], [7, 2], [6, 3], [5, 4], [4, 5]]), 'เสียงปิด'),
  music: svg(px([[3, 0, 4, 1], [3, 1, 1, 5], [6, 1, 1, 4], [1, 5, 3, 2], [4, 4, 3, 2]]), 'เพลง'),
  bell: svg(px([[3, 0, 2, 1], [2, 1, 4, 1], [1, 2, 6, 3], [0, 5, 8, 1], [3, 6, 2, 1]]), 'เอฟเฟกต์'),
};
