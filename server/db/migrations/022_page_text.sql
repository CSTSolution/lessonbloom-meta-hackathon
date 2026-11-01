-- "Đọc lại để tách bài" (Chi #54d, #48): the text of each page as it was read (a scan's lines, with the
-- titles marked), so a book can be split into its lessons again when the splitting improves, for free.
-- Books read before this have none: they are read again from their kept page pictures or file.
alter table books add column page_text jsonb;
