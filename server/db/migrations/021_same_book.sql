-- "Sách này đã có trong kho" (Chi #44): the same file added again was read and charged again. Each
-- source keeps a fingerprint of what was added (the file's SHA-256, made in her browser; for a scanned
-- PDF also the pages read), so adding it again can open the one she has instead.
alter table areas add column fingerprint text;
create index areas_fingerprint on areas (teacher_id, fingerprint) where fingerprint is not null;
