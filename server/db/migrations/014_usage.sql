-- The usage page: every model call also names the book it read (when it did), and whether it was paid
-- from credit held for that job (a scanned book) rather than taken off one call at a time.
alter table ai_usage add column book_id text;
alter table ai_usage add column held boolean not null default false;
create index ai_usage_book on ai_usage (book_id) where book_id is not null;
