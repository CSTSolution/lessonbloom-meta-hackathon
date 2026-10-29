-- #19 (Chi, 29 Oct): what testers changed by hand in a lesson, for the pilot numbers in the admin view.
create table lesson_edits (
  id          bigserial primary key,
  teacher_id  text not null references teachers (id) on delete cascade,
  lesson_id   text not null,
  kind        text not null check (kind in ('item_edit', 'item_remove', 'item_add', 'slide_rewrite', 'slide_add')),
  at          timestamptz not null default now()
);
create index lesson_edits_teacher on lesson_edits (teacher_id, at);
