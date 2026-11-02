-- Chi #65, #66, #68 (2 Nov): the pairs game is kept as done like the flashcards; the flashcards say how many
-- cards were left to go over again; a finished lesson can be hidden from the assigner's list (its results stay).
alter table pupil_progress add column pairs_at timestamptz;
alter table pupil_progress add column cards_review int;
alter table assignments add column hidden_at timestamptz;
