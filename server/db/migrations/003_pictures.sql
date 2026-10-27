-- Pictures are drawn after the lesson is ready; the page shows them as they arrive.
alter table lessons add column pictures_pending boolean not null default false;
