# Deploying

The live site runs the image from the [Dockerfile](../Dockerfile) on a Linux VPS, next to Postgres 16 and the two
voice engines, behind Cloudflare. Our own deploy scripts (which use our server's login) are not in this repository;
this is the same setup in general terms.

1. **Build** the image on the server: `docker build -t lessonbloom .` (the tests run first on the developer's machine:
   `npm test`).
2. **Settings**: put the values listed in [.env.example](../.env.example) into a `.env` file readable only by the
   owner (`chmod 600`). Never commit it.
3. **Run** it with [docker-compose.example.yml](docker-compose.example.yml): `docker compose up -d`. The app listens on
   port 8080; publish it on `127.0.0.1` and put a reverse proxy or Cloudflare Tunnel in front for HTTPS.
4. **Admin view**: a second port (`LB_ADMIN_PORT`) bound to `127.0.0.1` only, reached through an SSH tunnel, and
   every request needs `LB_ADMIN_KEY`. A read-only team view is at `/admin` with an email and password.
5. **Check**: `GET /api/health` answers `{"ok":true,"provider":"meta"}` when the Meta key is set.
