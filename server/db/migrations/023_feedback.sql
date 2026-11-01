-- Feedback from assigners (Chi #62): the "Góp ý" box on every page, "is this lesson useful?" after a
-- lesson is made, and "report this item" in Practice. A screenshot, when sent, is a small JPEG (at most
-- 1.5 MB, shrunk in the browser) kept here; the admin view lists everything, read only.
create table feedback (
  id          text primary key,
  teacher_id  text not null references teachers (id) on delete cascade,
  kind        text not null check (kind in ('bug', 'hard', 'content', 'idea', 'lesson', 'item')),
  reason      text,                   -- a reported item: wrong / unclear / notInLesson
  text        text not null default '',
  page        text not null default '',
  version     text not null default '',
  lesson_id   text references lessons (id) on delete set null,
  item_id     text,
  rating      smallint check (rating in (-1, 1)),
  image       bytea,
  created_at  timestamptz not null default now()
);
create index feedback_at on feedback (created_at desc);
create index feedback_teacher on feedback (teacher_id, created_at desc);
