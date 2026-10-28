-- Credits as a balance (1 credit = US$0.01 of Meta list price). Everyone gets 100 when they join, once
-- (a demo that adds its email keeps its balance). Subscribers, while plan_until is in the future, also
-- get a daily allowance (Vietnam days) that is used before the balance. Promo codes add credits or
-- subscriber days; every grant is logged.
alter table teachers add column credits numeric(12, 4) not null default 0;
alter table teachers add column plan_until timestamptz;
alter table teachers add column day_date date;
alter table teachers add column day_used numeric(12, 4) not null default 0;
-- teachers who joined before: 100, less what they have already used
update teachers t set credits = 100 - coalesce((select sum(u.usd) * 100 from ai_usage u where u.teacher_id = t.id), 0);

create table credit_log (
  id          bigserial primary key,
  teacher_id  text not null references teachers (id) on delete cascade,
  at          timestamptz not null default now(),
  credits     int not null default 0,
  days        int not null default 0,
  reason      text not null check (reason in ('promo', 'admin')),
  ref         text not null default ''
);
create index credit_log_teacher on credit_log (teacher_id, at desc);

create table promo_codes (
  code        text primary key,
  credits     int not null default 0 check (credits >= 0),
  days        int not null default 0 check (days >= 0),
  max_uses    int not null default 1 check (max_uses > 0),
  used        int not null default 0,
  expires_at  timestamptz,
  active      boolean not null default true,
  note        text not null default '',
  created_at  timestamptz not null default now()
);
create table promo_uses (
  code        text not null references promo_codes (code) on delete cascade,
  teacher_id  text not null references teachers (id) on delete cascade,
  at          timestamptz not null default now(),
  primary key (code, teacher_id)
);
