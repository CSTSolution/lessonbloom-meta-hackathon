-- Credits and the admin view: every model call also names the lesson it worked on (when it did),
-- so the admin view shows what each lesson cost. 1 credit = US$0.01 of Meta list price.
alter table ai_usage add column lesson_id text;
create index ai_usage_lesson on ai_usage (lesson_id) where lesson_id is not null;
