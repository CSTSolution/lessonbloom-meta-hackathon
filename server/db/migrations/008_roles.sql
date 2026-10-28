-- Task 3: one role per assigner, chosen at sign-up (no switch in the header): teacher or parent.
-- A teacher has her subject; a parent has her children (first names only, up to 4). Each child is a
-- class of one, so assigning, the child's own link and the practice work the same for both roles.
alter table teachers add column role text check (role in ('teacher', 'parent'));
alter table teachers add column subject text not null default '';
alter table classes add column kind text not null default 'class' check (kind in ('class', 'child'));
alter table classes add column grade int;
