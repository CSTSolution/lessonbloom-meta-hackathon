-- Task 4: the learning path (each part of a book 1, 2 or 3 weeks), the summary criteria, the in-app
-- reminder settings, and advice applied to one learner (extra items, or an extra week).
alter table teachers add column criteria jsonb not null default '{}';
alter table teachers add column reminders jsonb not null default '{}';
alter table sections add column topic text;

create table paths (
  id          text primary key,
  teacher_id  text not null references teachers (id) on delete cascade,
  class_id    text not null references classes (id) on delete cascade,
  area_id     text not null references areas (id) on delete cascade,
  start_date  date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (class_id, area_id)
);
create table path_steps (
  path_id     text not null references paths (id) on delete cascade,
  section_id  text not null references sections (id) on delete cascade,
  ord         int not null,
  weeks       int not null default 1 check (weeks between 1 and 3),
  primary key (path_id, section_id)
);

create table advice (
  id          bigserial primary key,
  teacher_id  text not null references teachers (id) on delete cascade,
  pupil_id    text not null references pupils (id) on delete cascade,
  kind        text not null check (kind in ('practice', 'next', 'time')),
  skill       text not null default '',
  status      text not null default 'applied' check (status in ('applied', 'kept', 'undone')),
  data        jsonb not null default '{}',
  at          timestamptz not null default now()
);
create index advice_pupil on advice (pupil_id, at desc);

-- "Luyện thêm" / "Bước tiếp": items for one learner, added to an assignment
create table pupil_extra (
  id             bigserial primary key,
  assignment_id  text not null references assignments (id) on delete cascade,
  pupil_id       text not null references pupils (id) on delete cascade,
  advice_id      bigint references advice (id) on delete cascade,
  items          jsonb not null
);
create index pupil_extra_pupil on pupil_extra (assignment_id, pupil_id);

-- "Thời gian bài": extra weeks on one part, for one learner (the parts after follow on)
create table pupil_weeks (
  path_id     text not null references paths (id) on delete cascade,
  pupil_id    text not null references pupils (id) on delete cascade,
  section_id  text not null,
  weeks       int not null default 0,
  primary key (path_id, pupil_id, section_id)
);
