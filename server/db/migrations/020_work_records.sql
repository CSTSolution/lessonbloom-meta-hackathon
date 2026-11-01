-- A child's finished work, read from photos (Chi #46). This is the child's profile, never Knowledge:
-- one dated record per upload, with the table of every question (what was asked, what the child wrote,
-- the right answer worked out by code, right or wrong, the kind of mistake). The learning summary
-- counts these answers like the practice done in the app; a lesson made from a record aims at them.
create table work_records (
  id          text primary key,
  pupil_id    text not null references pupils (id) on delete cascade,
  teacher_id  text not null references teachers (id) on delete cascade,
  made_at     timestamptz not null default now(),
  subject     text not null default 'math',
  topic       text not null default '',
  items       jsonb not null default '[]',
  created_at  timestamptz not null default now()
);
create index work_records_pupil on work_records (pupil_id, made_at);
