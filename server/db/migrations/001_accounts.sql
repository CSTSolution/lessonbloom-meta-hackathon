-- Teachers, sign-in and the AI usage log.
-- A teacher is a demo workspace (no email, made with one tap) or an account (email confirmed with a code).
-- Pupils never have accounts; they join a class with a code and a display name (later migration).

create table teachers (
  id          text primary key,
  kind        text not null check (kind in ('demo', 'account')),
  name        text not null default '',
  email       text,
  lang        text not null default 'vi' check (lang in ('vi', 'en')),
  created_at  timestamptz not null default now(),
  seen_at     timestamptz not null default now()
);
create unique index teachers_email on teachers (lower(email)) where email is not null;

-- Only a hash of the session token is stored; the token lives in an httpOnly cookie.
create table sessions (
  token_hash  text primary key,
  teacher_id  text not null references teachers (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index sessions_teacher on sessions (teacher_id);

-- One live code per address: 6 digits, stored hashed, 10 minutes, 5 wrong tries.
create table login_codes (
  email       text primary key,
  code_hash   text not null,
  expires_at  timestamptz not null,
  tries       int not null default 0,
  sent_at     timestamptz not null default now()
);

-- Every model call (guard layer 1 and the admin view): who, which endpoint, what it cost, what was blocked.
create table ai_usage (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  teacher_id  text references teachers (id) on delete set null,
  endpoint    text not null,
  model       text not null default '',
  verdict     text not null default 'ok',
  in_tokens   int not null default 0,
  out_tokens  int not null default 0,
  images      int not null default 0,
  usd         numeric(12, 6) not null default 0,
  ms          int not null default 0
);
create index ai_usage_at on ai_usage (at);
create index ai_usage_teacher on ai_usage (teacher_id, at);
