# Review guide: Chi's requirements → code → test

Chi's documents, newest first:

1. **"LessonBloom – Giao việc cho Sơn và thiết kế (Meta Hackathon)"**, 28 Oct. Tasks 0–5, appendices 1–3, and the design screens (PDF pages 6–21). It supersedes the earlier ones where they differ.
2. **"LessonBloom – Kiểm tra câu hỏi bằng code"**, 27 Oct. The question checks.
3. **"LessonBloom – Việc cần làm cho Meta Hackathon"**, 27 Oct. Its "sessions per week" planning was replaced by 1/2/3 weeks per lesson in doc 1.
4. **"LessonBloom – Báo cáo kiểm thử đầy đủ"**, 17 and 21 Oct. Bugs A–V.

The docs aren't in this repo; ask Chi for them. Status as of **29 Oct 2026**: everything below is built and deployed, and each row names its automated test or says "screen check" where only a look at the screen proves it. The test suite passes (69 tests), and a live run on the real Meta models passed 24/24 checks twice.

## How to check

- **One requirement:** read the code listed, then run its test, for example `npx tsx --test --test-name-pattern="confirm box" test/classes.test.ts`.
- **The whole flow:** `test/e2e.test.ts` takes a teacher and a parent from sign-up to a child practising and the summary.
- **A screen:** run the app locally (see `CLAUDE.md`), open it at 1280 px for the adult and 390 × 844 for the phone, and compare with Chi's design pages.
- **Report what you find:** an issue, or a PR on a `chi/<topic>` branch. Say which doc and line it comes from, what you expected, what you saw, and how to see it again.

## Decisions (doc 1, "Quyết định đã chốt")

| Requirement | Where | Test |
|---|---|---|
| One role per person, chosen at sign-up; no role switch in the header (Profile only) | `server/app.ts` (`/api/t/role`, `PUT /api/t/me`), `SignupRole.tsx`, `Profile.tsx` | `path.test.ts` "a parent: children at sign-up…", `chi.test.ts` "…types her classes at sign-up" |
| Menu: 5 tabs on one line; Criteria opened from the Learning summary | `web/src/pages/Home.tsx` (`tabs`) | screen check |
| Every screen collapsed: groups, only the open one expanded, "See all N" | every page (`group`, `group-head`) | screen check |
| Class names exactly as typed (no "Lớp " prefix) | `server/classes/routes.ts` | `chi.test.ts` (names as typed) |
| English browser opens in English (bug J) | `web/src/i18n.ts`, migration `011_english_first.sql` | screen check |

## Task 0 · Meta models

| Requirement | Where | Test |
|---|---|---|
| Text and vision on Muse Spark; agent on Muse Wonder; pictures on Muse Image; cut-outs on SAM 3.1; voice on Muse Voice Transcribe | `server/ai/meta.ts`, `server/config.ts` (`meta`) | `meta.test.ts` (all 7 tests) |
| Busy model (429/503) falls back; errors never carry the key | `server/ai/meta.ts` (`chain`, `retry`) | `meta.test.ts` "a busy model hands over…", "errors fail at once…" |

All five were checked live on 29 Oct.

## Task 1 · Questions checked by code, and the tick box (doc 1 appendix 1, doc 2)

| Requirement | Where | Test |
|---|---|---|
| The model gives only numbers; code writes the maths question and works out the answer | `server/lesson/items.ts` (`buildMath`, `compute`) | `items.test.ts` "code works out every maths answer…" |
| One check per question type: calculation shown (S), listening words not printed (K), match columns shuffled, right skill (Q), right unit (U), within the book's scope | `items.ts` (`checkItem`) | `items.test.ts` "Chi's table: every real faulty item is caught", "Q:…", "U:…", "English:…" |
| A failing item is written again at most 2 times, then dropped and logged | `server/lesson/writer.ts` (`writeItems`) | `lessons.test.ts` "the agent builds a whole lesson; the checker's rejection is logged…" |
| **AI second review after the code checks:** Muse Spark rereads every item against the book; it can only drop, and a lesson keeps at least 8 | `writer.ts` (`reviewItems`), `agent.ts` | `e2e.test.ts` "the AI second review drops what it flags…" |
| Practice step shows "Checked N items · M written again" (and any removed by the AI review); the reason is in Details | `web/src/pages/LessonPage.tsx` (`Practice`) | screen check |
| Tick box right above Assign, with Chi's exact wording; never pre-ticked, not remembered, ticked again every time; the server refuses without it and stores the time | `web/src/pages/Assign.tsx`, `server/classes/routes.ts` (assign) | `classes.test.ts` "assigning needs the confirm box…", `e2e.test.ts` |
| Bugs from 21 Oct: S, K (above); A, item counts match everywhere; B, labels agree; T, about 2 min with a progress bar; J, English first | items, `path/labels.ts`, `LessonPage.tsx` progress | `e2e.test.ts` (counts), `path.test.ts` (labels) |

## Task 2 · Knowledge and the two sources (doc 1 appendix 2)

| Requirement | Where | Test |
|---|---|---|
| A PDF is split into lessons (parts) with pages; rename, split, merge | `server/knowledge/ingest.ts`, `pdf.ts`, `routes.ts` | `knowledge.test.ts` "a PDF becomes pages…", `sections.test.ts` "sections: rename, split…" |
| Each person's books are private | `server/knowledge/routes.ts` | `knowledge.test.ts` "API: books are private…" |
| Material: one sentence, voice, a lesson photo, a child's finished exercise, pasted text | `server/lesson/routes.ts` (`/api/t/notes/*`), `writer.ts` (`readPhotos`, `readWork`), `Create.tsx` | `lessons.test.ts` "photos and voice are capped…", `sections.test.ts` "a child's exercise photo…" |
| Find the matching part, quote it with its page; nothing outside it is taught | `server/knowledge/search.ts` | `knowledge.test.ts` "Muse Spark picks the section; a citation counts only if…" |
| Every slide and item carries its source page; an ungrounded slide is dropped | `server/lesson/lessons.ts` (`itemPage`), `agent.ts` (`reviewLesson`) | `chi.test.ts` "items carry their page…", `lessons.test.ts` "review: code finds slides not grounded…" |
| Scope rules: "within 100" means no number above 100 and no subtraction in an addition lesson; English words only from the part | `server/lesson/items.ts` (`scopeOf`, `checkItem`) | `knowledge.test.ts` "the scope of a section…", `english.test.ts` "the scope of an English part…" |
| Not found: say "Not in your knowledge area yet" and write nothing | `knowledge/routes.ts` (match), `Create.tsx` | `lessons.test.ts` "API: request -> matched section…" |

## Books read in the browser, scanned books, and the job queue (Chi's review 29 Oct #11–#15; Son, 29 Oct)

| Requirement | Where | Test |
|---|---|---|
| The PDF is opened in the browser (any size): a text PDF up to 30 MB is uploaded, a bigger one sends only its text | `web/src/pdf.ts`, `Knowledge.tsx` (`AddSource`), `server/knowledge/routes.ts` (`/books/text`) | `jobs.test.ts` "a big text PDF…" |
| A scanned book: she picks pages (up to 200), sees the estimate and that she needs 50% more; each page is drawn as a JPEG and sent; Muse Spark reads it (`SCAN_SYSTEM`); pages keep their numbers | `pdf.ts` (`pageJpeg`), `knowledge/routes.ts` (`/scan/estimate`, `/books/scan`, `/pages/:n`, `/scan/start`, `readScan`) | `jobs.test.ts` "a scanned book…", "the estimate…" |
| Credit: 1.5x the estimate held before reading, stopped before going past it, the rest given back once; a restart gives the hold back | `knowledge/routes.ts` (`holdCredits`, `settle`), `server/app.ts` (`held`), `server/main.ts` | `jobs.test.ts` "a scanned book…" |
| One job at a time per account (reading a book or making a lesson), 3 in the whole app; her line in the top bar with Stop / Cancel; a waiting lesson shows its place | `server/jobs.ts`, `app.ts` (`/api/t/jobs`), `Home.tsx` (`JobsBox`), `LessonPage.tsx` | `jobs.test.ts` (both queue tests) |

Measured live on 29 Oct: a scanned page costs about 0.74 credits and 3.4 s (three pages at a time); the estimate uses 0.9.

## Task 3 · Parent role

| Requirement | Where | Test |
|---|---|---|
| Parent enters children's first names at sign-up (up to 4); each child is a class of one with a private link | `server/app.ts` (`/api/t/role`), `SignupRole.tsx` | `path.test.ts` "a parent: children at sign-up…" |
| Wording follows the role ("Classes" becomes "My children"; slide notes become tips for learning together) | each page's `vi`/`en` strings, `web/src/i18n.ts` | screen check |
| Parents skip the Questions and Video steps; the child's video is made when assigned | `Create.tsx` (`PARENT_STEPS`), `server/classes/routes.ts` | screen check |
| A parent assigns to a child and the child opens the private link | `server/classes/routes.ts`, `Pupil.tsx` | `e2e.test.ts` "a parent, from sign-up to her child practising…" |

## Task 4 · Path, labels, advice, reminders (doc 1 appendix 3)

| Requirement | Where | Test |
|---|---|---|
| Labels by code: 80% / 50% / the same mistake 3 times in 2 sessions; class 30% / 70% | `server/path/labels.ts` | `path.test.ts` "labels by code…" |
| The Criteria page: three groups, a live preview beside them, the three suggestions can be switched off | `server/path/routes.ts` (`/api/t/criteria*`), `Insights.tsx` (`Criteria`) | `chi.test.ts` "criteria: a live preview…" |
| Each lesson 1, 2 or 3 weeks; dates follow on; lessons grouped by topic | `server/path/routes.ts` (`/api/t/path`), `Path.tsx` | `path.test.ts` "path, summary, advice…" |
| Advice per learner (More practice / Lesson time / Next step) with Why? / Apply / Keep as is, and Undo. Decided by code; Muse Spark only words it; names never sent to the model | `path/routes.ts` (advice, `wordAdvice`), `Learner.tsx` | `path.test.ts` (advice, undo, no names sent) |
| Reminders: start, middle (moved off Sat/Sun), 2 days left, end, flashcards after 2–3 days. In the app only, at most one a day for a child, never after 20:00, a chosen time and an on/off for each | `path/routes.ts` (`remindersFor`, `pupilReminder`), `Reminders.tsx` | `path.test.ts` (times), `chi.test.ts` "the mid-lesson reminder goes only to a learner who has not finished…" |
| Learning summary: five folding parts; Circular 27 note; skills × classes table | `Insights.tsx` | `path.test.ts` (summary), screen check |
| Suggested comments: learners sent as "Em 1…", names filled in on our server | `path/routes.ts` (comments) | `path.test.ts` |

## Task 5 · Design screens (doc 1, PDF pages 6–21)

Compare at 1280 px. Each was checked side by side on 29 Oct.

| Screen | File |
|---|---|
| Sign-up · Choose a role | `web/src/pages/SignupRole.tsx` |
| Lessons (Assigned / Drafts / Done; parent filters by child) | `Home.tsx` |
| Knowledge | `Knowledge.tsx` |
| Learning path | `Path.tsx` |
| Classes / My children | `Classes.tsx` |
| Learning summary | `Insights.tsx` |
| Summary criteria | `Insights.tsx` (`Criteria`) |
| Learner detail + advice cards | `Learner.tsx` |
| Reminder settings | `Reminders.tsx` |
| Steps 1–6 (Material, Questions, Slides, Video, Practice incl. "Find the pairs", Assign) | `Create.tsx`, `LessonPage.tsx`, `Assign.tsx` |
| Child on the phone (join, today, slides, video, practice, flashcards, find the pairs, what next) | `web/src/pupil/Pupil.tsx` |
| Parent on the phone (path, advice, notifications grouped by day) | `Path.tsx`, `Learner.tsx`, `Notifications.tsx` |
| Credits and usage (name menu → "See usage in detail", `/usage`): credits left, used in 7/30/90 days and in all, a chart of each day by kind of work, the breakdown by kind (also the chart's table view), each lesson and book with its parts, and credits in / held / given back | `web/src/pages/Usage.tsx`, `server/usage.ts` |

## Rules that must never break (doc 1, "Nguyên tắc")

| Rule | Where it is enforced | Test |
|---|---|---|
| No marks, ranks or comparisons; children never see labels, scores or percentages | `server/classes/check.ts` (`forPupil`), `Pupil.tsx` | `classes.test.ts` "answers are checked by code…" |
| Answers never reach the phone; a wrong answer gets a hint chosen by code, never the answer | `classes/check.ts` (`hintOf`) | `classes.test.ts`, `e2e.test.ts` |
| Only first names kept; gentle wording (never "yếu", "chậm", "trễ") | `classes/routes.ts`, the prompts in `path/routes.ts` | `path.test.ts` |
| Personal data removed before anything reaches a model | `server/guard/guard.ts` (`redact`) | `guard.test.ts` "personal data is removed…" |
| Every AI call is gated, scoped, pre-checked and output-checked | `server/guard/guard.ts` | `guard.test.ts`, `budget.test.ts` |
| Every call comes off her credits and shows on her usage page (by kind, day, lesson, book); only her own rows | `guard.ts` (`Budget.record`), `server/usage.ts` | `usage.test.ts` |
| A line of lessons cannot spend credit she does not have: each waiting lesson keeps about 35, and a lesson whose turn comes after her credit ran out stops before any call | `server/credits.ts` (`spare`), `lesson/routes.ts` | `usage.test.ts` |

## Not built, on purpose

- **Payment:** Son, 28 Oct, "No payment for now". Credits and promo codes exist.
- **Reminders by Zalo or email:** doc 1 says in the app only.
- **The old parent screens** (Parent home, Done, Weekly report, Parent plan): doc 1 says keep them for later.

## Known limits

- One Vietnamese voice (the narration voices run on our own server; Meta has no text-to-speech).
- Lessons take about 1 minute on the live models (pictures follow); the local mock is instant.
- 120 credits at sign-up is about three lessons. Ask Son for more on a test account.
