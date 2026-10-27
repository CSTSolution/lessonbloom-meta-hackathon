# Built during the hackathon

Every line in this repository was written during the Meta Global AI Developer Hackathon. The history starts with the first commit on **Oct 27, 2026** (`git log --reverse`).

The product idea and its rules come from our earlier LessonBloom (Google AI Builder Cup, public at [CSTSolution/lessonbloom-lite](https://github.com/CSTSolution/lessonbloom-lite)). No code was carried over:
- **Kept:** no scores or rankings for pupils; skill labels for the teacher only; display names only; content only from the teacher's own material.
- **Rebuilt from scratch, on Meta's models:** everything else.

| Date | Built |
|---|---|
| Oct 27 | Server, Postgres schema and migrations, accounts (demo + email code), AI guard (4 layers, offline red-team tests), Meta Model API provider (Muse Spark, Muse Wonder, Muse Image, SAM 3.1, Muse Voice Transcribe), local narration, new web layout, deploy |
