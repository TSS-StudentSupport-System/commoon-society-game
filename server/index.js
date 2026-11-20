// COMMOON SOCIETY server: Express (static + QR) + Socket.IO (real-time sync).
import express from 'express';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import {
  rooms, createRoom, getRoom, isHost, joinRoom, resumePlayer, kickPlayer, startGame,
  normalizeSettings, sweepRooms, normCode, renamePlayer, addBots, removeBots,
} from './rooms.js';
import { publicView, hostView, privateView } from './views.js';
import { rateLimiter } from './validate.js';
import { botStep } from './bots.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true); // correct https protocol behind Render/Railway proxies
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: rooms.size }));
// Join URL students can actually reach: if the teacher opened via localhost, swap in the LAN address.
function lanIp() {
  for (const ifs of Object.values(os.networkInterfaces())) for (const i of ifs || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  return null;
}
function publicOrigin(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const host = req.get('host') || `localhost:${PORT}`;
  const ip = lanIp();
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host) && ip) return `http://${ip}:${host.split(':').pop() || PORT}`;
  return `${req.protocol}://${host}`;
}
app.get('/api/join-url/:code', (req, res) => {
  const code = normCode(req.params.code);
  if (!getRoom(code)) return res.status(404).json({ ok: false });
  res.json({ ok: true, url: `${publicOrigin(req)}/?join=${code}` });
});
app.get('/api/qr/:code', async (req, res) => {
  const code = normCode(req.params.code);
  if (!getRoom(code)) return res.status(404).end();
  const svg = await QRCode.toString(`${publicOrigin(req)}/?join=${code}`, { type: 'svg', margin: 1, color: { dark: '#101C35', light: '#FFFFFF' } });
  res.type('image/svg+xml').send(svg);
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false }, maxHttpBufferSize: 16 * 1024 });

const chPub = (room) => `pub:${room.code}`;
const chHost = (room) => `host:${room.code}`;
const chPlayer = (room, p) => `p:${room.code}:${p.id}`;

function broadcast(room) {
  if (room.status === 'closed') return;
  io.to(chPub(room)).emit('state:public', publicView(room));
  io.to(chHost(room)).emit('state:host', hostView(room));
  for (const p of room.players.values()) io.to(chPlayer(room, p)).emit('state:private', privateView(room, p));
}

// Game clock: phases auto-advance on timeout or when everyone has acted.
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.game && !room.game.finished) {
      try {
        let changed = room.game.tick();
        let bots = false;
        for (const p of room.players.values()) {
          if (!p.bot || room.game.finished) continue;
          bots = true; botStep(room.game, p);
        }
        if (changed || bots) broadcast(room);
      } catch (err) { console.error('[tick]', err); }
    }
  }
}, 400);
setInterval(() => sweepRooms((room) => io.to(chPub(room)).emit('room:closed', { reason: 'expired' })), 5 * 60 * 1000);

function unbind(socket) {
  const { code, role, playerId } = socket.data;
  if (!code) return;
  const room = rooms.get(code);
  socket.leave(`pub:${code}`); socket.leave(`host:${code}`);
  if (room) {
    if (role === 'host') room.hostSockets.delete(socket.id);
    if (role === 'player') {
      const p = room.players.get(playerId);
      if (p) { socket.leave(chPlayer(room, p)); p.sockets.delete(socket.id); p.connected = p.sockets.size > 0; }
    }
    broadcast(room);
  }
  socket.data = {};
}

function bindPlayer(socket, room, p) {
  unbind(socket);
  socket.data = { code: room.code, role: 'player', playerId: p.id };
  socket.join(chPub(room)); socket.join(chPlayer(room, p));
  p.sockets.add(socket.id); p.connected = true;
  room.lastActivity = Date.now();
}

io.on('connection', (socket) => {
  socket.data = {};
  const allow = rateLimiter(20, 8);

  // Wrapper: rate limit, ack safety, and context resolution from socket.data (never from payload).
  const on = (event, need, handler) => {
    socket.on(event, (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!allow()) return reply({ ok: false, error: 'rate_limited' });
      try {
        let ctx = {};
        if (need) {
          const room = rooms.get(socket.data.code);
          if (!room || room.status === 'closed') return reply({ ok: false, error: 'no_room' });
          if (need === 'host' && (socket.data.role !== 'host' || !room.hostSockets.has(socket.id))) return reply({ ok: false, error: 'not_host' });
          if (need === 'player') {
            const p = socket.data.role === 'player' && room.players.get(socket.data.playerId);
            if (!p) return reply({ ok: false, error: 'not_player' });
            ctx.player = p;
          }
          ctx.room = room;
        }
        handler(payload && typeof payload === 'object' ? payload : {}, reply, ctx);
      } catch (err) {
        console.error(`[${event}]`, err);
        reply({ ok: false, error: 'server_error' });
      }
    });
  };

  // ---------- Room creation / host ----------
  on('room:create', null, (data, reply) => {
    const room = createRoom(data.settings);
    unbind(socket);
    socket.data = { code: room.code, role: 'host' };
    room.hostSockets.add(socket.id);
    socket.join(chPub(room)); socket.join(chHost(room));
    reply({ ok: true, code: room.code, hostToken: room.hostToken });
    broadcast(room);
  });

  on('host:attach', null, (data, reply) => {
    const room = getRoom(data.code);
    if (!room || room.status === 'closed') return reply({ ok: false, error: 'no_room' });
    if (!isHost(room, data.hostToken)) return reply({ ok: false, error: 'not_host' });
    unbind(socket);
    socket.data = { code: room.code, role: 'host' };
    room.hostSockets.add(socket.id);
    socket.join(chPub(room)); socket.join(chHost(room));
    reply({ ok: true, code: room.code });
    broadcast(room);
  });

  on('host:updateSettings', 'host', (data, reply, { room }) => {
    if (room.status !== 'lobby') return reply({ ok: false, error: 'not_in_lobby' });
    room.settings = normalizeSettings(data.settings || {}, room.settings);
    reply({ ok: true });
    broadcast(room);
  });

  on('host:kick', 'host', (data, reply, { room }) => {
    const r = kickPlayer(room, data.playerId);
    if (r.error) return reply({ ok: false, error: r.error });
    for (const sid of r.player.sockets) {
      const s = io.sockets.sockets.get(sid);
      if (s) { s.emit('player:kicked'); s.leave(chPub(room)); s.leave(chPlayer(room, r.player)); s.data = {}; }
    }
    reply({ ok: true });
    broadcast(room);
  });

  on('host:addBots', 'host', (data, reply, { room }) => {
    const r = addBots(room, data.count);
    if (r.error) return reply({ ok: false, error: r.error });
    reply({ ok: true, added: r.added });
    broadcast(room);
  });

  on('host:removeBots', 'host', (_data, reply, { room }) => {
    const r = removeBots(room);
    if (r.error) return reply({ ok: false, error: r.error });
    reply({ ok: true });
    broadcast(room);
  });

  on('host:rename', 'host', (data, reply, { room }) => {
    const r = renamePlayer(room, data.playerId, data.nickname);
    if (r.error) return reply({ ok: false, error: r.error });
    reply({ ok: true });
    broadcast(room);
  });

  on('host:start', 'host', (_data, reply, { room }) => {
    const r = startGame(room);
    if (r.error) return reply({ ok: false, error: r.error });
    reply({ ok: true });
    broadcast(room);
  });

  on('host:command', 'host', (data, reply, { room }) => {
    if (!['playing', 'ended'].includes(room.status) || !room.game) return reply({ ok: false, error: 'not_playing' });
    const r = room.game.hostCommand(data);
    room.lastActivity = Date.now();
    reply(r);
    if (r.ok) broadcast(room);
  });

  on('host:close', 'host', (_data, reply, { room }) => {
    room.status = 'closed';
    io.to(chPub(room)).emit('room:closed', { reason: 'host_closed' });
    rooms.delete(room.code);
    reply({ ok: true });
  });

  // ---------- Players ----------
  on('room:join', null, (data, reply) => {
    const room = getRoom(data.code);
    if (!room || room.status === 'closed') return reply({ ok: false, error: 'no_room' });
    const r = joinRoom(room, data.nickname);
    if (r.error) return reply({ ok: false, error: r.error });
    bindPlayer(socket, room, r.player);
    reply({ ok: true, code: room.code, playerId: r.player.id, token: r.player.token });
    broadcast(room);
  });

  on('player:resume', null, (data, reply) => {
    const room = getRoom(data.code);
    if (!room || room.status === 'closed') return reply({ ok: false, error: 'no_room' });
    const r = resumePlayer(room, data.playerId, data.token);
    if (r.error) return reply({ ok: false, error: r.error });
    bindPlayer(socket, room, r.player);
    reply({ ok: true, code: room.code });
    broadcast(room);
  });

  on('player:ready', 'player', (data, reply, { room, player }) => {
    if (room.status !== 'lobby') return reply({ ok: false, error: 'not_in_lobby' });
    player.ready = Boolean(data.ready);
    reply({ ok: true });
    broadcast(room);
  });

  on('player:action', 'player', (data, reply, { room, player }) => {
    if (!room.game) return reply({ ok: false, error: 'not_playing' });
    const err = room.game.playerAction(player, data);
    if (err) return reply({ ok: false, error: err });
    room.lastActivity = Date.now();
    reply({ ok: true });
    broadcast(room);
  });

  on('player:leave', 'player', (_data, reply, { room, player }) => {
    if (room.status !== 'lobby') return reply({ ok: false, error: 'not_in_lobby' });
    room.players.delete(player.id);
    socket.leave(chPub(room)); socket.leave(chPlayer(room, player));
    socket.data = {};
    reply({ ok: true });
    broadcast(room);
  });

  // ---------- Board display (public only) ----------
  on('board:watch', null, (data, reply) => {
    const room = getRoom(data.code);
    if (!room || room.status === 'closed') return reply({ ok: false, error: 'no_room' });
    unbind(socket);
    socket.data = { code: room.code, role: 'board' };
    socket.join(chPub(room));
    reply({ ok: true });
    socket.emit('state:public', publicView(room));
  });

  socket.on('disconnect', () => unbind(socket));
});

server.listen(PORT, () => {
  console.log(`\n  COMMOON SOCIETY running on http://localhost:${PORT}`);
  for (const ifs of Object.values(os.networkInterfaces())) {
    for (const i of ifs || []) if (i.family === 'IPv4' && !i.internal) console.log(`  On the same Wi-Fi: http://${i.address}:${PORT}`);
  }
  console.log('');
});

export { server, io };
