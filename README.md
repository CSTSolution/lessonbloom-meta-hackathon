# LessonBloom Meta

A Vietnamese primary-school teacher's lesson notes become slides, a narrated video, practice for pupils and a clear picture of where the class is stuck. Built on Meta's models for the **Meta Global AI Developer Hackathon** (Oct 26 – Nov 4, 2026), Startup track, *Build for Your World*.

**Live:** https://lessonbloom-meta.cstsolution.com · what is built and when: [HACKATHON.md](HACKATHON.md)

## How it is built

| Part | What |
|---|---|
| Models | Meta Model API only: Muse Spark (text, vision), Muse Wonder (the lesson agent), Muse Image, SAM 3.1 (photo cut-outs), Muse Voice Transcribe (dictation) |
| Narration | VieNeu (Vietnamese) and Kokoro (English), running on our own server; Meta has no text-to-speech |
| Server | TypeScript, Hono, Node 22 |
| Database | Postgres 16; PGlite (Postgres in WebAssembly) in the tests and for local development |
| Accounts | A one-tap demo, or an email code (no passwords) |
| Web | React + Vite, Vietnamese and English |
| Safety | Every AI endpoint has four layers: a gate (sign-in, caps, rate and money limits, a kill switch), a fixed scope, a pre-check of all user text, and an output check (`server/guard/`) |

Keys stay on the server. The browser only ever talks to our API.

## Run it

Needs Node 22+. Without `MODEL_API_KEY` the app uses an offline mock; without `DATABASE_URL` it uses a local PGlite database under `data/`.

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
