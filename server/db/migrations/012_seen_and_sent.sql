-- Watching the lesson video is recorded apart from the slides, and every reminder a learner was shown is
-- logged (the learner page lists what was really sent, not what would have been).
alter table pupil_progress add column video_at timestamptz;
create table pupil_reminders (
  pupil_id  text not null references pupils (id) on delete cascade,
  day       date not null,
  kind      text not null,
  text      text not null,
  at        timestamptz not null default now(),
  primary key (pupil_id, day)
);
