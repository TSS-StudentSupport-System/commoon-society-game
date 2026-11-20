-- COMMOON SOCIETY — history schema (Supabase / Postgres). Not used by live play (in-memory, server-authoritative).
create table rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  settings jsonb not null,
  status text not null check (status in ('lobby','playing','ended','closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  config jsonb not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  final_status jsonb,
  summary jsonb
);

-- Written at game end only (teacher debrief). No real names: nickname only.
create table game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  nickname text not null,
  school_identity text,
  faction text check (faction in ('community','disruptor','independent')),
  role text,
  final_attributes jsonb
);

create table game_events (
  id bigserial primary key,
  game_id uuid not null references games(id) on delete cascade,
  round int not null,
  phase text not null,
  event_key text not null,
  choice_key text,
  effects jsonb,
  created_at timestamptz not null default now()
);

create table votes (
  id bigserial primary key,
  game_id uuid not null references games(id) on delete cascade,
  round int not null,
  topic text not null,
  voter_hash text not null,          -- HMAC(player token), keeps ballots unlinkable to nickname
  option_key text not null,
  created_at timestamptz not null default now(),
  unique (game_id, round, topic, voter_hash)
);

create table reports (
  id bigserial primary key,
  game_id uuid not null references games(id) on delete cascade,
  round int not null,
  reporter_hash text not null,
  target_player_id text,
  anonymous boolean not null default true,
  status text not null default 'open' check (status in ('open','accepted','investigating','rejected','independent_review')),
  reviewed_by_role text,
  created_at timestamptz not null default now()
);

create table reflections (
  id bigserial primary key,
  game_id uuid not null references games(id) on delete cascade,
  prompt text not null,
  notes text,
  created_at timestamptz not null default now()
);

-- RLS: enable on all tables; only the server (service role) writes. No anon access.
alter table rooms enable row level security;
alter table games enable row level security;
alter table game_players enable row level security;
alter table game_events enable row level security;
alter table votes enable row level security;
alter table reports enable row level security;
alter table reflections enable row level security;
