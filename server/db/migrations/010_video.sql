-- The lesson video (step 4): its MP4, length and chapters, and how far making it has got.
alter table lessons add column video jsonb;
alter table lessons add column video_status text not null default 'none';
