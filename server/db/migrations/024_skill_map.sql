-- The skills map (beta, Son 2 Nov): each book's parts broken into the skills they teach. Every node
-- belongs to one part and names its pages (file pages, as passages do); code fills any part or page
-- the model left out, so nothing in the book is missing. `after` holds the skills it builds on.
create table skill_maps (
  book_id     text primary key references books (id) on delete cascade,
  status      text not null check (status in ('building', 'ready', 'error')),
  error       text,
  built_at    timestamptz not null default now()
);

create table skill_nodes (
  id          text primary key,
  book_id     text not null references books (id) on delete cascade,
  area_id     text not null references areas (id) on delete cascade,
  section_id  text not null references sections (id) on delete cascade,
  ord         double precision not null,
  name        text not null,
  kind        text not null default 'other',
  about       text not null default '',
  pages       int[] not null,
  after       text[] not null default '{}'
);
create index skill_nodes_area on skill_nodes (area_id, ord);
create index skill_nodes_book on skill_nodes (book_id);

-- Her comments on the map (kept and sent to the team), and the chat that changes it: what she asked,
-- what the app answered, and the changes it proposed (applied only when she accepts them).
create table skill_notes (
  id          text primary key,
  area_id     text not null references areas (id) on delete cascade,
  teacher_id  text not null references teachers (id) on delete cascade,
  skill_id    text,
  role        text not null check (role in ('comment', 'user', 'app')),
  text        text not null,
  ops         jsonb,
  status      text check (status in ('proposed', 'applied', 'dismissed')),
  created_at  timestamptz not null default now()
);
create index skill_notes_area on skill_notes (area_id, created_at);
