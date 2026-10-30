-- "Bỏ giao" (Chi #34): a lesson assigned by mistake is taken off the child's or class's list, softly.
-- The row stays so the answers already given keep counting in the summary; removed_at hides it from
-- "Hôm nay con học gì", the class / child list and the assign step.
alter table assignments add column removed_at timestamptz;
