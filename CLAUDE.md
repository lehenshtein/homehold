# Homehold - Claude Context

## Project Overview

**Homehold** is a hub/landing page linking out to all of the owner's pet
projects (starting with `eneri`), with a future shared authentication
system — including a guest account — used across those pet projects.

- **Domain**: homehold.website (Cloudflare -> Contabo VPS, already configured)
- **Backend repo**: `backend/` (this is a monorepo, unlike `eneri`/`eneri-be`
  which are split into two repos)

## Tech Stack

- TypeScript everywhere — **no Angular** (project convention shared with
  `eneri`/`eneri-be`)
- Frontend: vanilla TypeScript + Vite (no framework — deliberately light for
  a link-hub page)
- Backend: Express + TypeScript + Prisma
- Database: **PostgreSQL, one instance shared by all pet projects** (unlike
  `eneri-be`'s MongoDB, which is dedicated to that project alone)

## Ports

New projects on this VPS use a dedicated `6xxx` block, kept separate from
`eneri`/`eneri-be` (`3000`/`4000`) and the unrelated `salt-ash` project
(`4100`/`4101`) to avoid any collision or confusion:
- `homehold-frontend` -> host `127.0.0.1:6100` (container port 80, nginx)
- `homehold-backend` -> host `127.0.0.1:6101` (container port 6101, `PORT` env)
- `homehold-db` -> not published to the host by default
- `dreich` (sibling repo) -> host `127.0.0.1:6001`

## Directory Structure

```
frontend/          # vanilla TS + Vite
  index.html
  src/main.ts       # renders hero + project grid from a static array
  src/style.css
  Dockerfile         # multi-stage: vite build -> nginx:alpine
backend/            # Express + TypeScript + Prisma
  src/server.ts      # Express app, GET /ping health check
  src/routes.ts       # router aggregator (empty so far, eneri-be pattern)
  prisma/schema.prisma  # datasource postgresql; User model only so far
  Dockerfile          # node:20-alpine multi-stage build
  .env.example
docker-compose.yml    # homehold-db (postgres) + homehold-backend + homehold-frontend
.env.example           # POSTGRES_USER/PASSWORD/DB for docker-compose.yml
.github/workflows/main.yml
```

## Conventions (carried over from `eneri-be` for consistency)

- Health check endpoint: `GET /ping` -> `200 ok` — used by the deploy
  workflow's health check step
- `src/routes.ts` router-aggregator pattern: each entity app's router gets
  imported and re-exported here, then mounted in `server.ts`
- Auth (once implemented): JWT, PBKDF2 password hashing, ~7-day token
  expiry, same shape as `eneri-be`'s `Authentication.ts` middleware
- Guest accounts: issue a scoped JWT for a guest `User` row
  (`isGuest: true`) without requiring registration — exact scoping/limits
  TBD in Phase 1

## Shared Database — Open Decision

The Postgres instance (`homehold-db`) is meant to be **shared by every pet
project**, not just Homehold itself. Only a `User` table exists right now.
**Before onboarding a second pet project**, decide and document here:
- Table-prefix convention (e.g. `projectname_table`) in one shared `public`
  schema, vs.
- One Postgres schema (namespace) per project, referencing `users` via a
  cross-schema foreign key or just by shared `user_id`

Do not add project-specific tables to `schema.prisma` until this is decided.

## Deploy

Mirrors the `eneri` / `eneri-be` deploy pattern used on the same VPS:
self-hosted GitHub Actions runner, push to `main` -> `docker compose up -d
--build` for all three services, health check against `/ping` (backend,
port 6101) and `/` (frontend, port 6100), rollback via `pre-deploy-*` git
tags. See `.github/workflows/main.yml`.

**This workflow is currently inert** — no self-hosted runner is registered
for this repo yet. Register one via GitHub repo Settings -> Actions ->
Runners on the VPS before pushes will auto-deploy.

**Manual deploy in the meantime**, on the VPS:
```bash
cd /root/homehold/homehold   # clone here first if not already present
cp .env.example .env && cp backend/.env.example backend/.env   # fill in real secrets
git pull
docker compose up -d --build
```

### Nginx (manual VPS step, not yet done)

Add server blocks on the VPS's host-level nginx:
```nginx
server {
    listen 80;
    server_name homehold.website;
    location / {
        proxy_pass http://127.0.0.1:6100;
    }
}

server {
    listen 80;
    server_name api.homehold.website;
    location / {
        proxy_pass http://127.0.0.1:6101;
    }
}
# then TLS via certbot / existing cert flow, same as eneri.com.ua / api.eneri.com.ua
```
`api.homehold.website` mirrors the `eneri.com.ua` / `api.eneri.com.ua`
split — needs a Cloudflare DNS record added for the `api` subdomain
(not done yet).

## Roadmap

- [x] Phase 0: scaffold, static landing page, backend health check,
      `docker compose up --build` works end-to-end locally
- [ ] Phase 1: real auth (register/login + guest account issuing a scoped
      JWT without registration)
- [ ] Phase 2: landing page wired to backend (project registry table
      instead of the hardcoded array in `frontend/src/main.ts`),
      account/profile page
- [ ] Phase 3+: onboard first real pet project, resolve the shared-DB
      schema/prefix convention above

## Local Development

```bash
# Frontend only
cd frontend && npm install && npm run dev   # localhost:5173

# Backend only (needs a reachable Postgres; point DATABASE_URL at it)
cd backend && npm install && npm run watch  # localhost:6101

# Full stack via Docker
cp .env.example .env && cp backend/.env.example backend/.env
docker compose up --build
```
