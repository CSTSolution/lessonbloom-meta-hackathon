-- Her original files, kept privately in Cloudflare R2 (Son, 30 Oct): a book's original PDF, and the page
-- pictures of a scanned book or of photos. One row per object; deleting the book deletes them.
create table book_files (
  key         text primary key,
  book_id     text not null references books (id) on delete cascade,
  teacher_id  text not null references teachers (id) on delete cascade,
  kind        text not null check (kind in ('original', 'page')),
  page        int,
  bytes       bigint not null default 0,
  type        text not null default '',
  created_at  timestamptz not null default now()
);
create index book_files_book on book_files (book_id);
create index book_files_teacher on book_files (teacher_id);
