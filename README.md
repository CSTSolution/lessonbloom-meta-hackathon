# LessonBloom

**Lessons from your own books, checked before they reach a child.**

A teacher or parent uploads their own book, types one sentence about what to learn, and LessonBloom makes a lesson from those pages only: slides with pictures, a narrated video, practice and flashcards. Every question is checked by code before a child sees it. Children practise on a phone; the adult sees what is mastered and which mistakes keep coming back.

Built on Meta's models for the **Meta Global AI Developer Hackathon** (Oct 26 – Nov 4, 2026). Grades 1–5, Maths and English; English first, with Vietnamese as a second language.

**Live:** https://lessonbloom-meta.cstsolution.com (try it with a sample book, no sign-up; best viewed in Google Chrome) · **What was built, and when:** [HACKATHON.md](HACKATHON.md) · **Reviewing it against the design docs:** [docs/REVIEW.md](docs/REVIEW.md)

## What it does

| Step | What happens | Models |
|---|---|---|
| Your book | A PDF of any size, opened in the browser; a scanned book is read page by page from pictures (the cost estimated and held first). It is split into lessons and pages; the owner can rename, split or merge parts. Private to them | Muse Spark (vision for scanned pages; contents only when a book has no headings) |
| One sentence | Typed, spoken, a photo of the lesson, or a photo of a child's finished exercise (its kind and mistakes). The matching part of the book is found and cited by page; nothing outside it is taught | Muse Spark (re-rank, vision), Muse Voice Transcribe |
| The lesson | An agent plans the skills and slides, writes slides, practice and flashcards through tools, reviews its own work and fixes or drops what fails. Pictures in one house style, each checked and redrawn once if needed; cut-outs from your own photo | **Muse Wonder** (agent), Muse Spark, Muse Image, SAM 3.1 |
| Checked by code | For maths the model supplies numbers; code writes the question and works out the answer. Every item passes a check for its type (calculation shown, listening words never printed, skill, unit, the book's number range and operation), is written again at most twice, then dropped and logged | none: code |
| Assign | Only after ticking "I have read and checked the AI-generated slides and exercises", every time. Class code and QR, or a private link per child | |
| The child | One question per screen, big buttons, no scores. Answers are checked on our server and never sent to the phone; a wrong answer gets a hint chosen by code from the mistake | none on the child's side |
| The adult | Skills labelled by code (mastered / practising / repeated mistake), repeated mistakes named, advice per child decided by code and worded by Muse Spark (names never sent), a learning path of 1–3 weeks per lesson, in-app reminders | Muse Spark (wording only) |

Plus: a narrated MP4 per lesson (slides drawn by Chromium, local voices, ffmpeg), teacher and parent roles, credits and promo codes, and a private admin view.

## How it is built

| Part | What |
|---|---|
| Models | Meta Model API only: Muse Spark, Muse Wonder, Muse Image, SAM 3.1, Muse Voice Transcribe |
| Narration | Kokoro (English) and VieNeu (Vietnamese) on our own server; Meta has no text-to-speech |
| Server | TypeScript, Hono, Node 22 |
| Database | Postgres 16 with pg_trgm and unaccent (hybrid search); PGlite in tests and local development |
| Web | React + Vite; the font is bundled (no third-party requests) |
| Safety | Every AI endpoint: a gate (sign-in, caps, credits, a daily and a total budget, a kill switch), a fixed scope with the user's text as data, a Muse Spark pre-check of all user text that fails closed, and an output check (canary, code and key patterns). Personal data is removed before anything reaches a model (`server/guard/`) |

Keys stay on the server; the browser only talks to our API.

## Run it

Needs Node 22+. Without `MODEL_API_KEY` the app uses an offline mock of every model; without `DATABASE_URL` it uses a local PGlite database under `data/`.

```bash
npm install
```

```bash
npm test
```

```bash
npm run build && npm start
```

Then open http://localhost:8080. Settings: [.env.example](.env.example). Deploy: [deploy/vps/](deploy/vps/).
