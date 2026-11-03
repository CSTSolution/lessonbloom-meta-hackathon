# Services and libraries this repository uses

Every outside service is called from the **server** only; the browser talks to our own API and holds no keys.
Each one is optional for running the code locally: without its setting the app falls back as shown.

## AI models (Meta Model API, the hackathon's credit)

| Model | What LessonBloom uses it for | Setting | Without it |
|---|---|---|---|
| **Muse Wonder** (`muse-wonder-1.0`) | The lesson agent: plans skills and slides, writes slides, practice and flashcards through 8 tools, reads what our checks rejected and writes it again | `LB_META_AGENT` | offline mock |
| **Muse Spark** (`muse-spark-1.3`, fallback `1.2`) | Reading scanned pages and photos (vision), the skills map, lesson intake, the second review of items, the pre-check of all user text, checking every picture, wording of advice | `LB_META_TEXT`, `LB_META_TEXT_FALLBACKS` | offline mock |
| **Muse Image** (`muse-image-1.0`) | Slide pictures in one house style | `LB_META_IMAGE` | offline mock |
| **SAM 3.1** (`sam-3.1`) | Cut-outs from the adult's own photos for slides | `LB_META_SAM` | offline mock |
| **Muse Voice Transcribe** (`muse-voice-transcribe-1.0`) | A spoken note about what to teach | `LB_META_TRANSCRIBE` | offline mock |

All five go through one client (`server/ai/meta.ts`) with the key `MODEL_API_KEY` and the base URL `LB_META_BASE`.
Every call passes the guard in `server/guard/` (sign-in, caps, credits, daily and total budget, kill switch,
fixed prompts with the user's text as data, a pre-check, an output check) and is logged with its cost.

## Our own server

| Service | Use | Setting | Without it |
|---|---|---|---|
| **PostgreSQL 16** (`pg_trgm`, `unaccent`) | All data; hybrid search over book pages | `DATABASE_URL` | PGlite (in-process Postgres) under `LB_DATA_DIR` |
| **Kokoro** (open-source TTS, self-hosted) | English narration of the lesson video and "Read it" | `KOKORO_URL` | no narration |
| **VieNeu** (open-source TTS, self-hosted) | Vietnamese narration | `VIENEU_URL` | no Vietnamese narration |
| **Chromium**, **ffmpeg**, **poppler-utils** (in the Docker image) | Drawing slides for the video, encoding it, reading PDFs on the server | `CHROMIUM_PATH` | no video |
| **Docker** | One image, built from the `Dockerfile` | | `npm start` |

Meta has no text-to-speech model, so narration uses the two open-source engines on our server.

## Outside services

| Service | Use | Setting | Without it |
|---|---|---|---|
| **Brevo** (SMTP) | Email sign-in codes, and feedback to the team | `SMTP_SERVER`, `SMTP_PORT`, `SMTP_USER`, `SMTP_KEY`, `MAIL_FROM` | codes printed to the server log |
| **Cloudflare R2** (S3-compatible, private bucket) | Original files of big or scanned books and photos, kept privately | `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | files are not kept; the app works as before |
| **Cloudflare** (DNS, HTTPS proxy) | The live address | | |
| A Linux VPS | Runs the Docker image next to Postgres and the voice engines | | |

## Libraries (npm)

Server: `hono`, `@hono/node-server`, `pg`, `nodemailer`, `aws4fetch` (R2), `pdfjs-dist`, `jpeg-js`, `qrcode`,
`@meta-sam/parser`, `tsx`. Web: `react`, `react-dom`, `vite`, `@fontsource/be-vietnam-pro` (bundled, no font
requests to third parties). Tests and local development: `@electric-sql/pglite`, `typescript`. Versions are in
`package.json`.

## What is not in this repository

Keys, passwords and the server's `.env` (only the list of settings, in [.env.example](.env.example)); our server's
deploy and admin-tunnel scripts; the review branch with screenshots. See [deploy/README.md](deploy/README.md) for a
generic deploy.
