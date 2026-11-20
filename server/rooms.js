// Room Management + Player Session Management + Lobby Management.
import crypto from 'node:crypto';
import { cleanText, int, oneOf, newToken, newId, safeEqual, graphemeLength } from './validate.js';
import { MODES, PLAYER_MIN, PLAYER_MAX } from './content.js';
import { randomAvatar, assign } from './roles.js';
import { botName } from './bots.js';
import { Game } from './game.js';

export const MIN_PLAYERS_FLOOR = PLAYER_MIN;
export const MAX_PLAYERS_CAP = PLAYER_MAX;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_TTL_MS = 4 * 60 * 60 * 1000;

export const rooms = new Map();

export function normalizeSettings(input = {}, prev = null) {
  const base = prev || { name: 'โรงเรียนมูนสคูล', hostName: 'โฮสต์', maxPlayers: PLAYER_MAX, minPlayers: PLAYER_MIN, mode: 'short' };
  const s = { ...base };
  if ('name' in input) s.name = cleanText(input.name, 40) || base.name;
  if ('hostName' in input) s.hostName = cleanText(input.hostName, 16) || base.hostName;
  if ('maxPlayers' in input) s.maxPlayers = int(input.maxPlayers, MIN_PLAYERS_FLOOR, MAX_PLAYERS_CAP, base.maxPlayers);
  if ('minPlayers' in input) s.minPlayers = int(input.minPlayers, MIN_PLAYERS_FLOOR, MAX_PLAYERS_CAP, base.minPlayers);
  if ('mode' in input) s.mode = oneOf(input.mode, Object.keys(MODES), base.mode);
  if (s.minPlayers > s.maxPlayers) s.minPlayers = s.maxPlayers;
  return s;
}

function makeCode() {
  for (let tries = 0; tries < 1000; tries++) {
    let c = '';
    for (let i = 0; i < 5; i++) c += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
  throw new Error('no_codes');
}

export const normCode = (c) => (typeof c === 'string' ? c.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) : '');

export function createRoom(settings) {
  const room = {
    code: makeCode(),
    settings: normalizeSettings(settings),
    hostToken: newToken(),
    hostSockets: new Set(),
    status: 'lobby',           // lobby | playing | ended | closed
    players: new Map(),        // id -> player
    banned: new Set(),         // tokens removed by host
    game: null,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

export const getRoom = (code) => rooms.get(normCode(code));
export const isHost = (room, token) => safeEqual(room.hostToken, token);

export function joinRoom(room, nicknameRaw) {
  if (room.status !== 'lobby') return { error: 'game_started' };
  if (room.players.size >= room.settings.maxPlayers) return { error: 'room_full' };
  const nickname = cleanText(nicknameRaw, 16);
  if (graphemeLength(nickname) < 1) return { error: 'bad_nickname' };
  const lower = nickname.toLocaleLowerCase('th');
  for (const p of room.players.values()) if (p.nickname.toLocaleLowerCase('th') === lower) return { error: 'nickname_taken' };
  const player = {
    id: newId(), token: newToken(), nickname, avatar: randomAvatar(),
    ready: false, connected: false, sockets: new Set(), joinedAt: Date.now(), secret: null,
  };
  room.players.set(player.id, player);
  room.lastActivity = Date.now();
  return { player };
}

export function resumePlayer(room, playerId, token) {
  if (room.banned.has(token)) return { error: 'kicked' };
  const p = room.players.get(playerId);
  if (!p || !safeEqual(p.token, token)) return { error: 'bad_session' };
  return { player: p };
}

export function kickPlayer(room, playerId) {
  if (room.status !== 'lobby') return { error: 'not_in_lobby' };
  const p = room.players.get(playerId);
  if (!p) return { error: 'no_player' };
  room.banned.add(p.token);
  room.players.delete(playerId);
  return { player: p };
}

export function renamePlayer(room, playerId, raw) {
  if (room.status !== 'lobby') return { error: 'not_in_lobby' };
  const p = room.players.get(playerId);
  if (!p) return { error: 'no_player' };
  const nickname = cleanText(raw, 16);
  if (graphemeLength(nickname) < 1) return { error: 'bad_nickname' };
  const lower = nickname.toLocaleLowerCase('th');
  for (const o of room.players.values()) if (o !== p && o.nickname.toLocaleLowerCase('th') === lower) return { error: 'nickname_taken' };
  p.nickname = nickname;
  return { ok: true };
}

export function startGame(room) {
  if (room.status !== 'lobby') return { error: 'not_in_lobby' };
  const players = [...room.players.values()];
  if (players.length < room.settings.minPlayers) return { error: 'not_enough_players' };
  room.status = 'playing';                     // lock lobby (no mid-game joins)
  assign(players, room.settings.mode);         // public role + hidden trait
  room.game = new Game(room);                  // story → day 1
  room.lastActivity = Date.now();
  return { ok: true };
}

export function sweepRooms(onClose) {
  const now = Date.now();
  for (const room of rooms.values()) {
    const empty = room.hostSockets.size === 0 && [...room.players.values()].every((p) => !p.connected);
    if (now - room.lastActivity > ROOM_TTL_MS || (empty && now - room.lastActivity > 60 * 60 * 1000)) {
      room.status = 'closed';
      rooms.delete(room.code);
      onClose?.(room);
    }
  }
}

export function addBots(room, count) {
  if (room.status !== 'lobby') return { error: 'not_in_lobby' };
  const n = Math.max(1, Math.min(Number(count) || 1, room.settings.maxPlayers - room.players.size));
  if (n <= 0 || room.players.size >= room.settings.maxPlayers) return { error: 'room_full' };
  let i = [...room.players.values()].filter((p) => p.bot).length;
  for (let k = 0; k < n; k++) {
    let nickname = botName(i++);
    while ([...room.players.values()].some((p) => p.nickname === nickname)) nickname = botName(i++);
    const player = { id: newId(), token: newToken(), nickname, avatar: randomAvatar(), ready: true, connected: true, bot: true, sockets: new Set(), joinedAt: Date.now(), secret: null };
    room.players.set(player.id, player);
  }
  room.lastActivity = Date.now();
  return { ok: true, added: n };
}

export function removeBots(room) {
  if (room.status !== 'lobby') return { error: 'not_in_lobby' };
  for (const [id, p] of room.players) if (p.bot) room.players.delete(id);
  return { ok: true };
}
