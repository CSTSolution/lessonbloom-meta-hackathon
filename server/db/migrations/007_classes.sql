-- Classes, pupils and assigned lessons (Chi's task 1, step 6 "Giao bài").
-- Pupils have no accounts and only a first name: the assigner adds the names; a pupil enters with the
-- class code and taps her name, or opens her own link (for parents). An assignment keeps a copy of the
-- lesson as it was assigned, and the moment the assigner ticked "I have read and checked".
create table classes (
  id          text primary key,
  teacher_id  text not null references teachers (id) on delete cascade,
  name        text not null,
  code        text not null unique,
  created_at  timestamptz not null default now()
);
create index classes_teacher on classes (teacher_id, created_at);

create table pupils (
  id          text primary key,
  class_id    text not null references classes (id) on delete cascade,
  name        text not null,
  link        text not null unique,
  joined_at   timestamptz,
  seen_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index pupils_class on pupils (class_id, created_at);

create table pupil_sessions (
  token_hash  text primary key,
  pupil_id    text not null references pupils (id) on delete cascade,
  expires_at  timestamptz not null
);

create table assignments (
  id            text primary key,
  lesson_id     text not null references lessons (id) on delete cascade,
  class_id      text not null references classes (id) on delete cascade,
  teacher_id    text not null references teachers (id) on delete cascade,
  content       jsonb not null,
  due           date,
  retry         boolean not null default true,
  hints         boolean not null default true,
  confirmed_at  timestamptz not null,
  created_at    timestamptz not null default now()
);
create index assignments_class on assignments (class_id, created_at desc);
create index assignments_lesson on assignments (lesson_id);

-- every answer a pupil gives (results by skill feed the learning path later)
create table answers (
  id             bigserial primary key,
  assignment_id  text not null references assignments (id) on delete cascade,
  pupil_id       text not null references pupils (id) on delete cascade,
  item_id        text not null,
  skill          text not null,
  level          text not null,
  answer         text not null,
  correct        boolean not null,
  at             timestamptz not null default now()
);
create index answers_assignment on answers (assignment_id, pupil_id);

create table pupil_progress (
  assignment_id  text not null references assignments (id) on delete cascade,
  pupil_id       text not null references pupils (id) on delete cascade,
  slides_at      timestamptz,
  cards_at       timestamptz,
  done_at        timestamptz,
  primary key (assignment_id, pupil_id)
);
