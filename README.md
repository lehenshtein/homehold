# homehold

Monorepo hub for pet projects, hosted at homehold.website: a landing page
linking out to each project, a shared PostgreSQL database, authentication
(including a guest account), and a shared notes/to-do pinboard at
`/notes`.

See `CLAUDE.md` for architecture, conventions, and the roadmap.

## Quickstart — hot-reload dev (day-to-day)

One-time setup:
```bash
npm run install:all                                # installs root + backend + frontend deps
cp .env.example .env
cp backend/.env.development.example backend/.env    # note: .development.example, not .env.example
```

Then, every time you want to work:
```bash
npm run dev
```
This brings up Postgres in Docker, then runs the backend (`nodemon`,
restarts on save) and frontend (Vite, hot module reload) together with
color-coded interleaved logs. Open:
- http://localhost:5173 — landing page
- http://localhost:5173/notes — notes pinboard

Log in with `lehenshtein` / `admin` (seeded automatically — change the
password after logging in), or "Continue as guest".

Stop with `Ctrl+C`, then `docker compose down` (add `-v` to also wipe the
dev database).

Run just one side if you don't need both: `npm run dev:backend` or
`npm run dev:frontend` (still needs `npm run dev:db` running first).

## Quickstart — full Docker stack (matches prod)

Use this to sanity-check before pushing, not for iterating — no hot reload,
rebuilds the images from scratch.

```bash
cp .env.example .env
cp backend/.env.example backend/.env      # different from .env.development.example — see CLAUDE.md
docker compose up --build -d

curl 127.0.0.1:6101/ping   # -> ok
curl 127.0.0.1:6100        # -> landing page HTML
```

## Structure

- `frontend/` — vanilla TypeScript + Vite: landing page + notes pinboard
- `backend/` — Express + TypeScript + Prisma API (auth, users, notes)
- `docker-compose.yml` — Postgres + backend + frontend, one command to run
  the whole stack (locally or on the VPS)
- `package.json` (root) — orchestrates the two hot-reload dev servers via
  `concurrently`; the actual app code has no root-level dependency on it
