// Headless bot play-test: node scripts/simulate.js [games=50] [players=20]
// Runs full games with a fake clock (no waiting) and prints balance numbers per mode.
import { Game } from '../server/game.js';
import { assign, randomAvatar } from '../server/roles.js';
import { botStep, botName } from '../server/bots.js';

export function simulate(mode, n, { onTick, maxSteps = 200000 } = {}) {
  let t = 0;
  const players = new Map();
  for (let i = 0; i < n; i++) players.set(`b${i}`, { id: `b${i}`, nickname: botName(i), avatar: randomAvatar(), bot: true, sockets: new Set() });
  const room = { settings: { mode }, players };
  assign([...players.values()], mode);
  const g = new Game(room, { clock: () => t });
  let steps = 0;
  while (!g.finished && steps++ < maxSteps) {
    t += 400;
    g.tick();
    for (const p of players.values()) botStep(g, p);
    onTick?.(g);
    if (mode === 'marathon' && g.day > 60) g.hostCommand({ type: 'endGame' });
  }
  return { g, minutes: t / 60000 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const games = Number(process.argv[2] || 50), n = Number(process.argv[3] || 20);
  for (const mode of ['short', 'medium', 'marathon']) {
    const res = { blue: 0, red: 0 }, reasons = {}; let days = 0, mins = 0, projects = 0, missions = 0, votes = 0, yellowWins = 0, yellows = 0;
    for (let i = 0; i < games; i++) {
      let vc = 0, lastVote = null;
      const { g, minutes } = simulate(mode, n, { onTick: (gg) => { if (gg.vote && gg.vote !== lastVote) { vc++; lastVote = gg.vote; } } });
      res[g.winner.color]++; days += g.day; mins += minutes; projects += g.projectsDone.length; missions += g.missions.length; votes += vc;
      const r = g.winner.reason.replace(/[\d.]+/g, '#'); reasons[r] = (reasons[r] || 0) + 1;
      yellows += g.yellow.length; yellowWins += g.yellow.filter((y) => y.won).length;
    }
    console.log(`\n== ${mode} · ${n} players · ${games} games ==`);
    console.log(`blue ${Math.round(res.blue / games * 100)}% · red ${Math.round(res.red / games * 100)}% · yellow wins ${yellowWins}/${yellows}`);
    console.log(`avg days ${(days / games).toFixed(1)} · real-time ${(mins / games).toFixed(1)} min · projects ${(projects / games).toFixed(1)} · missions ${(missions / games).toFixed(1)} · votes ${(votes / games).toFixed(1)}`);
    for (const [r, c] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log(`  ${c}× ${r}`);
  }
}
