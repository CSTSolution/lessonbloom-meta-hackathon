-- The page number printed in the book, beside the page's place in the file (Chi #45): a scanned file
-- often has a cover first, so "page 17" of the file is printed 16 in its corner. Read with each page
-- (null when it could not be read). A book with none read can be told once where its page 1 is in the
-- file (page_one). Lessons and search keep working by file page; only what is shown changes.
alter table passages add column printed int;
alter table books add column page_one int;
