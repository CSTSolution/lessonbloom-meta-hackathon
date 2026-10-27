# Built during the hackathon

Every line in this repository was written during the Meta Global AI Developer Hackathon. The history starts with the first commit on **Oct 27, 2026** (`git log --reverse`).

The product idea and its rules come from our earlier LessonBloom (Google AI Builder Cup, public at [CSTSolution/lessonbloom-lite](https://github.com/CSTSolution/lessonbloom-lite)). No code was carried over:
- **Kept:** no scores or rankings for pupils; skill labels for the teacher only; display names only; content only from the teacher's own material.
- **Rebuilt from scratch, on Meta's models:** everything else.

| Date | Built |
|---|---|
| Oct 27 | Server, Postgres schema and migrations, accounts (demo + email code), AI guard (4 layers, offline red-team tests), Meta Model API provider (Muse Spark, Muse Wonder, Muse Image, SAM 3.1, Muse Voice Transcribe), local narration, new web layout, deploy |
| Oct 27 | Making a lesson: notes typed, photographed (Muse Spark reads them) or spoken (Muse Voice Transcribe); the setup pre-filled; the **Muse Wonder lesson agent** plans the skills and slides and builds the lesson through 8 tools, with turn and call limits, a canary check each turn and a code fallback; maths items built from data by code and every item checked by **Chi's rules** (S, K, Q, U, range, dup, offlesson, punct, lang), rejected items regenerated then dropped and logged; the lesson page shows the agent's steps live, then its note, the slides, the practice with answers and the flashcards |
| Oct 27 | Slide pictures with **Muse Image** in one house style and cast, each checked by **Muse Spark vision** (no text, child-safe, on topic) and redrawn once if it fails, drawn in the background after the lesson is ready; **SAM 3.1** cut-outs from the assigner's own photo (object names only, people refused, only the cut-out stored); "new picture" per slide |
