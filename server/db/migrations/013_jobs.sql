-- One job at a time per account (Son, 29 Oct): reading a book or making a lesson; the others wait.
-- Scanned books are read from page images the browser sends (the PDF never leaves her computer),
-- with the predicted cost held first (1.5x) and the rest given back.
create table jobs (
  id          text primary key,
  teacher_id  text not null references teachers (id) on delete cascade,
  kind        text not null check (kind in ('lesson', 'book')),
  ref         text not null,
  title       text not null default '',
  status      text not null default 'queued' check (status in ('queued', 'running', 'done', 'error', 'cancelled')),
  progress    text not null default '',
  hold        int not null default 0,
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  ended_at    timestamptz
);
create index jobs_teacher on jobs (teacher_id, status, created_at);
create index jobs_queued on jobs (status, created_at);

alter table books add column source text not null default 'pdf' check (source in ('pdf', 'text', 'scan'));
alter table credit_log drop constraint credit_log_reason_check;
alter table credit_log add constraint credit_log_reason_check check (reason in ('promo', 'admin', 'hold', 'refund'));
