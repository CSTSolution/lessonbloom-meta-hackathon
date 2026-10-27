-- The knowledge area: an assigner's own books (PDF), split into sections (lessons, units) and passages.
-- Lessons are written only from a matched section. Search is hybrid: full-text and trigram matching on
-- an accent-free copy of each passage, then a Muse Spark re-rank whose citations code verifies.
-- Books are private to their assigner (textbooks are copyrighted).
create extension if not exists pg_trgm;
create extension if not exists unaccent;

create table areas (
  id          text primary key,
  teacher_id  text not null references teachers (id) on delete cascade,
  name        text not null,
  subject     text not null check (subject in ('math', 'english')),
  grade       int not null check (grade between 1 and 5),
  created_at  timestamptz not null default now()
);
create index areas_teacher on areas (teacher_id);

create table books (
  id          text primary key,
  area_id     text not null references areas (id) on delete cascade,
  title       text not null,
  pages       int not null default 0,
  status      text not null check (status in ('processing', 'ready', 'error')),
  error       text,
  created_at  timestamptz not null default now()
);
create index books_area on books (area_id);

create table sections (
  id          text primary key,
  book_id     text not null references books (id) on delete cascade,
  ord         int not null,
  title       text not null,
  page_from   int not null,
  page_to     int not null
);
create index sections_book on sections (book_id, ord);

create table passages (
  id          text primary key,
  book_id     text not null references books (id) on delete cascade,
  area_id     text not null references areas (id) on delete cascade,
  section_id  text not null references sections (id) on delete cascade,
  page        int not null,
  ord         int not null,
  text        text not null,
  norm        text not null,
  tsv         tsvector not null
);
create index passages_area on passages (area_id);
create index passages_section on passages (section_id, ord);
create index passages_tsv on passages using gin (tsv);
create index passages_trgm on passages using gin (norm gin_trgm_ops);

alter table lessons add column area_id text references areas (id) on delete set null;
alter table lessons add column refs jsonb not null default '[]';
alter table lessons add column request text not null default '';
