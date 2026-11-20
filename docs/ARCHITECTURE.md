# COMMOON SOCIETY — Architecture & Design (Part 18 deliverable)

> One School. Many Stories. Every Decision Matters.

## 1. Understanding of the game

COMMOON SOCIETY is a **classroom party board game** (Kahoot-style access, Werewolf-style hidden roles, cooperative SEL goals).

* **The projector is the shared School Board.** It shows the school's collective condition (5 status indicators), events, phase and timer, votes, announcements, all as a living pixel-art school scene with day/night.
* **Each phone is a private hand of cards.** It holds identity, faction, role, attributes, missions, clues and action buttons, and only that player's own data.
* The teacher is the **Host / Game Master**, controls pacing, and never sees secret roles by accident.
* It is **not** an RPG or free-roam map. Sprites on the board are ambience, not player tokens.
* Win/lose is secondary. The end goal is **reflection**: exclusion, trust, intervention, collective responsibility.
* Nobody is eliminated. Bullying actions are fictional, rate-limited, recoverable and never target real-world identity.

## 2. Technical architecture

| Layer | Choice | Why |
|---|---|---|
| Server | **Node.js 18+ + Express** | Free, simple, runs on a school laptop or on free hosts (Render/Railway/Fly). |
| Real-time | **Socket.IO** | Rooms, auto-reconnect, ack callbacks, polling fallback for strict school Wi-Fi. |
| Game state | **In-memory, server-authoritative** (`Map<roomCode, Room>`) | A class session lasts about an hour, so keeping it in memory gives the lowest latency and zero cost. |
| Persistence | **Supabase Postgres (planned, Stage 6)**, schema below | Only for game history, results and reflection summaries. The game stays playable without it. |
| Frontend | **Vanilla ES modules + Canvas 2D** (no build step) | Loads fast on cheap phones and is easy for teachers to deploy. It can be migrated to React later because views are already split by role. |
| Pixel art | **Procedural canvas rendering** at 320×180 internal resolution, scaled with `image-rendering: pixelated` | 100% original art, no asset licensing, and day/night is a colour interpolation, not an image swap. |

```
 Phones (play.html) ─┐                    ┌─ Host (host.html) = Board + Control drawer
                     │  Socket.IO (WS)    │
 Board (board.html) ─┼──────► Node server ◄┘
                     │        ├─ rooms.js     Room / session / lobby management
                     │        ├─ game.js      Game state engine (rounds, phases, timer, day/night, status, events)
                     │        ├─ roles.js     Role assignment + card distribution
                     │        ├─ content.js   Configurable content: phases, events, identities, roles
                     │        ├─ views.js     ★ Projection layer: publicView / hostView / privateView
                     │        └─ validate.js  Input validation, grapheme counting, rate limiting
```

Later modules (Stages 4–6) plug in beside `game.js`: `voting.js`, `missions.js`, `actions.js`, `comms.js`, `history.js`.

## 3. Main screens

1. **Landing** (`/`): animated pixel school, Create Room, Join Room, How to Play, About.
2. **Create Room** (modal): name, max players, min players, duration preset, rounds, difficulty, role preset, role categories.
3. **Join Room** (modal or `/?join=CODE` link): room code and nickname.
4. **Host Lobby** (`/host.html`): giant room code, QR, join link, live player grid, kick, settings, start, close.
5. **School Board** (`/host.html` in-game, or `/board.html?room=CODE` for a second display): scene, 5 indicators, phase and timer, event card, change log.
6. **Host Control Drawer** (inside host.html): pause/resume, next/skip phase, +time, restart round, day/night, events, status override, connections, end game.
7. **Player Phone** (`/play.html`): join → lobby (ready) → card hand (Character, School Identity, Secret Faction with hold-to-reveal, Role, Life Attributes).
8. *(Later)* Voting, Missions, Clues, Reports, Messages, Results & Reflection.

## 4. Database schema (Supabase / Postgres, for history; see `schema.sql`)

Live play never reads from the DB. Rows are written at game start and end, and on key events.

* `rooms(id, code, name, settings jsonb, status, created_at, closed_at)`
* `games(id, room_id, started_at, ended_at, config jsonb, final_status jsonb, summary jsonb)`
* `game_players(id, game_id, nickname, school_identity, faction, role, final_attributes jsonb)`: written only at game end, for the teacher's session summary.
* `game_events(id, game_id, round, phase, event_key, choice_key, effects jsonb, created_at)`
* `votes(id, game_id, round, topic, voter_hash, option_key, created_at)`: unique `(game_id, round, topic, voter_hash)`, which prevents duplicate votes.
* `reports(id, game_id, round, reporter_hash, target_player_id, anonymous bool, status, reviewed_by_role, created_at)`
* `reflections(id, game_id, prompt, notes, created_at)`

Students have no accounts. Nicknames only, no real personal data.

## 5. Real-time event structure

All client→server calls use `socket.emit(event, payload, ack)` and get `{ok:true, ...}` or `{ok:false, error}`.
**The acting identity always comes from `socket.data` (bound at join/resume), never from the payload.**

| Client → Server | Who | Payload |
|---|---|---|
| `room:create` | anyone | `{settings}` → `{code, hostToken}` |
| `host:attach` | host | `{code, hostToken}` |
| `host:updateSettings` | host, lobby | `{settings}` |
| `host:kick` | host, lobby | `{playerId}` |
| `host:start` | host, lobby | `{}` |
| `host:close` | host | `{}` |
| `host:command` | host, in game | `{type: pause\|resume\|nextPhase\|skipPhase\|addTime\|restartRound\|setTimeOfDay\|triggerEvent\|resolveEvent\|dismissEvent\|adjustStatus\|announce\|endGame, ...}` |
| `room:join` | player | `{code, nickname}` → `{playerId, token}` |
| `player:resume` | player | `{code, playerId, token}` |
| `player:ready` | player | `{ready}` |
| `player:leave` | player | `{}` |
| `board:watch` | display | `{code}` (public data only) |

| Server → Client | Channel | Content |
|---|---|---|
| `state:public` | `pub:<code>` (all) | lobby or game snapshot, no secrets |
| `state:host` | `host:<code>` | public + connection details + host-only options (still no secrets) |
| `state:private` | `p:<code>:<playerId>` | that player's own cards and attributes |
| `room:closed`, `player:kicked`, `toast` | targeted | notifications |

Snapshots are sent on every change (rooms have ≤ 60 players and payloads are a few KB). Timers send `endsAt` plus `serverNow`, and clients count down locally.

## 6. Protecting secret information

1. **Projection layer (`views.js`)**: the only code that turns state into network payloads. `publicView` and `hostView` are built from an allow-list of fields; secret fields (`faction`, `role`, `identity`, `attributes`, `token`) are never copied in.
2. **Per-player channels**: private cards are emitted only to the `p:<code>:<id>` socket room, which a socket joins only after token verification.
3. **Session tokens**: 128-bit random `token` per player and `hostToken` per room, stored in the browser's localStorage, compared with `crypto.timingSafeEqual`. Player IDs are public, tokens never are.
4. **Server-side authorization** on every handler: room exists, socket is bound to this room, role is correct (host/player), game status allows the action.
5. **Anti-abuse**: per-socket rate limit, grapheme-aware length limits (Thai-safe via `Intl.Segmenter`), unique nicknames, kicked tokens banned, lobby locked after start.
6. **Host view contains no roles.** A future "teacher reveal" (for debrief) will need an explicit two-step confirmation and is sent only at game end.
7. Automated test `test/smoke.test.js` asserts that no public/host payload contains any secret field.

## 7. Development sequence

1. ✅ Stage 1: Multiplayer foundation (this build)
2. ✅ Stage 2: Pixel school board, day/night, indicators, event display (this build). Basic round/phase stepping is included so the board has something to show.
3. Stage 3: Full personal card system: missions, skill/item cards, notifications *(identity, faction, role and attribute cards already delivered)*
4. Stage 4: Voting engine, collective missions, role abilities, disruptor and recovery actions, clue cards
5. Stage 5: Governance (council, opposition, reports, no-confidence), messaging
6. Stage 6: Results, SEL reflection, session summary, Supabase history

## 8. Technical risks & mitigations

| Risk | Mitigation |
|---|---|
| School Wi-Fi blocks WebSockets / isolates clients | Socket.IO long-polling fallback. Prefer an internet-hosted server (Render free tier) over LAN. |
| Phones sleep or lock, so players disconnect | Token resume from localStorage, offline indicator, game never removes players mid-game. |
| Server restart loses in-memory games | Acceptable for MVP. Stage 6 snapshots state to Supabase. Free hosts that sleep should be woken before class. |
| Secret leakage via payloads | Single projection layer + automated leak test. |
| Free-tier cold start (about 30 s on Render) | Teacher opens the site 1 minute before class. |
| Thai text length/rendering | `Intl.Segmenter` grapheme counting; Thai-capable body font (Noto Sans Thai), pixel font only for Latin headings. |
| Rule churn during play-testing | Phases, events, roles, status ranges and effects all live in `content.js` / settings, not hard-coded. |
| Sensitive theme (bullying) | Fictional nicknames, no elimination, host pause, recovery paths, reflection-first ending. |

### Configurable content documented (not final rules)

* Status indicators: range 0–100, start 50. Event effects are example values for play-testing.
* **Cause → effect (Stage 2 version):** an event the host dismisses without resolving is kept as *unresolved* and lowers Trust by 2 at each round end. Low indicators *suggest* follow-up events to the host (e.g. Trust < 40 suggests "Online Rumor", Belonging < 40 suggests "Exclusion Incident", Cooperation ≥ 65 suggests "Community Project"). The host decides; nothing fires automatically.
* Faction split (`roles.js`): Disruptors ≈ ⌊n/4⌋ (min 1); Independents: beginner 0, standard 1 if n ≥ 8, advanced 1 if n ≥ 6 and 2 if n ≥ 12 (only if the "Independent" category is enabled). Roles in Stage 3 are **cards with descriptions only**. Abilities activate in Stage 4.
* Day/night: each phase has a default (Secret Phase = night) and the host can override at any time.
