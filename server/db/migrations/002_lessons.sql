-- Lessons: the teacher's notes and confirmed setup, and what the agent built from them.
-- The built parts are JSON documents (slides, items, cards) read and written whole with the lesson.
create table lessons (
  id          text primary key,
  teacher_id  text not null references teachers (id) on delete cascade,
  status      text not null check (status in ('working', 'ready', 'error')),
  setup       jsonb not null,
  source      text not null,
  skills      jsonb not null default '[]',
  slides      jsonb not null default '[]',
  items       jsonb not null default '[]',
  cards       jsonb not null default '[]',
  steps       jsonb not null default '[]',
  agent       jsonb,
  rejected    jsonb not null default '[]',
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index lessons_teacher on lessons (teacher_id, created_at desc);
