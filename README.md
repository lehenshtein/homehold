# homehold

Monorepo hub for pet projects, hosted at homehold.website: a landing page
linking out to each project, with a shared PostgreSQL database and (future)
authentication including a guest account.

See `CLAUDE.md` for architecture, conventions, and the roadmap.

## Quickstart

```bash
cp .env.example .env
cp backend/.env.example backend/.env
docker compose up --build -d

curl 127.0.0.1:3100/ping   # -> ok
curl 127.0.0.1:4100        # -> landing page HTML
```

## Structure

- `frontend/` — vanilla TypeScript + Vite landing page
- `backend/` — Express + TypeScript + Prisma API
- `docker-compose.yml` — Postgres + backend + frontend, one command to run
  the whole stack locally or on the VPS
