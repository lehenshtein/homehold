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
  src/main.ts       # hero (auth UI) + project grid, all one render() pass
  src/auth.ts        # login/logout/changePassword/createUser/fetchMe
  src/api.ts          # fetch wrapper: base /api, injects token, throws on non-2xx
  src/style.css
  vite.config.ts       # dev-only: proxies /api/* -> localhost:6101
  nginx.conf             # prod: same /api/* proxy, -> homehold-backend:6101
  Dockerfile               # multi-stage: vite build -> nginx:alpine + nginx.conf
backend/            # Express + TypeScript + Prisma
  src/server.ts      # Express app; mounts addUserToRequest, /auth, /user; GET /ping
  src/routes.ts       # router aggregator (AuthenticationRoutes, UserRoutes)
  src/middleware/Authentication.ts  # addUserToRequest, requireAuthentication, requireAdmin
  src/library/
    prisma.ts          # shared PrismaClient singleton — import this, don't `new PrismaClient()` elsewhere
    password.ts          # generateSalt/hashPassword (PBKDF2, same scheme as eneri-be)
    jwt.ts                 # createToken/verifyToken (7d expiry, JWT_SIGN_KEY)
  src/apps/
    authentication/     # POST /auth/login, POST /auth/change-password (auth'd)
    user/                 # GET /user/me (auth'd), POST /user (admin-only, creates account)
  src/scripts/seedAdmin.ts  # idempotent: creates lehenshtein/admin only if it doesn't exist yet
  prisma/schema.prisma  # datasource postgresql; User model (password+salt, role, isGuest)
  Dockerfile          # node:20-alpine multi-stage, installs openssl (Prisma needs it on Alpine)
  .env.example
docker-compose.yml    # homehold-db (postgres, w/ healthcheck) + homehold-backend + homehold-frontend
.env.example           # POSTGRES_USER/PASSWORD/DB for docker-compose.yml
.github/workflows/main.yml
```

## Conventions (carried over from `eneri-be` for consistency)

- Health check endpoint: `GET /ping` -> `200 ok` — used by the deploy
  workflow's health check step
- `src/routes.ts` router-aggregator pattern: each entity app's router gets
  imported and re-exported here, then mounted in `server.ts`
- Auth: JWT (7-day expiry, `JWT_SIGN_KEY`), PBKDF2 password hashing with a
  per-user salt — same scheme as `eneri-be`'s `Authentication.ts`, except
  the token payload/lookup key is `username` (eneri-be uses `email`), since
  homehold has no email/registration flow (yet)
- `addUserToRequest` is mounted globally in `server.ts` (before the route
  mounts), so `req.user` is populated (or `undefined`) on every request —
  same pattern as eneri-be
- No Joi/`ValidateSchema` layer here — request bodies are checked with
  plain `if` guards in the controllers instead, to keep the dependency
  footprint down at this scaffold stage. Revisit if validation needs grow.

## Auth — implemented (2026-08-19)

No self-registration — accounts only come from an admin creating them.

- **Bootstrap admin**: `lehenshtein` / `admin`, created by
  `src/scripts/seedAdmin.ts` on first backend start (idempotent — only
  creates it if the username doesn't already exist, so it never resets a
  password that's since been changed). **Change this password after first
  login.**
- `POST /auth/login` `{ username, password }` -> `{ token, user }`
- `POST /auth/change-password` `{ currentPassword, newPassword }`
  (requires auth) -> updates the caller's own password
- `GET /user/me` (requires auth) -> `{ username, role, isGuest }`
- `POST /user` `{ username, password }` (requires **admin** role) -> creates
  a new account with `role: 'user'` and the given temporary password; the
  new user is expected to `POST /auth/change-password` after first login
- Frontend (`src/main.ts`/`auth.ts`): token stored in `localStorage`
  (`homehold_token` key), sent back as the raw value in an `authorization`
  header (no `Bearer ` prefix — matches `eneri-be`'s convention). Session
  restored on page load via `GET /user/me`; a 401 there clears the stored
  token.
- Guest accounts are still **not implemented** — `isGuest` exists on the
  `User` model but nothing sets it yet; still Phase 1/2 work.

### API routing: `/api/*` proxy, not a separate subdomain

The frontend's own nginx container proxies `/api/*` -> `homehold-backend:6101`
(stripping the prefix) over the internal Docker network — see
`frontend/nginx.conf` (prod) and `frontend/vite.config.ts` (dev,
`npm run dev`, same rewrite against `localhost:6101`). Frontend code always
calls relative `/api/...` paths (`src/api.ts`), so it's identical in dev,
Docker, and prod.

**This means the VPS's host nginx (`homehold.conf`) needed no changes** —
it already proxies everything on `homehold.website` to
`127.0.0.1:6100` (the frontend container), which now internally forwards
`/api/*` onward. The backend is still not reachable on its own subdomain
(`api.homehold.website` — see Nginx/TLS section below); it doesn't need to
be for this to work.

### Prisma: `db push`, not migrations (deliberate, for now)

The Docker entrypoint (`backend/Dockerfile` CMD) runs `npx prisma db push`
on every start — directly syncs the DB schema to `schema.prisma`, no
migration history table, no committed SQL migration files. This is
Prisma's own recommended approach for early prototyping. **Move to real
`prisma migrate` once this holds actual user data that must survive a
schema change without risk of `db push` prompting for
`--accept-data-loss`.**

### Local `.env` gotcha (bit us once, worth remembering)

`backend/.env`'s `DATABASE_URL` password must match root `.env`'s
`POSTGRES_PASSWORD` **exactly**. Postgres only applies
`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` from env vars on the
*first* start against an empty volume — after that, changing either `.env`
file alone just makes the backend's credentials stop matching what's
actually in Postgres, with an opaque `P1000: Authentication failed` error.
If you need to actually rotate the password later, see "if i will change
them, database will break?" reasoning: either `ALTER ROLE ... WITH
PASSWORD` inside Postgres and update `.env` to match, or (only if there's
no real data yet) `docker compose down -v` to wipe and reinit clean.

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

Mirrors the `eneri` / `eneri-be` deploy pattern used on the same VPS: those
two keep `main` untouched and deploy off a separate branch
(`develop`/`development`) — homehold follows the same split, deploying off
**`dev`**, not `main`.

- Self-hosted GitHub Actions runner (registered on the VPS as
  `/root/actions-runner-homehold`, systemd service
  `actions.runner.lehenshtein-homehold.homehold.service`) runs
  `docker compose up -d --build` for all three services on push to `dev`
  (see `.github/workflows/main.yml`)
- Health check against `/ping` (backend, port 6101) and `/` (frontend,
  port 6100)
- Rollback via `pre-deploy-*` git tags
- **The `dev` branch doesn't exist yet** — create/push it to trigger the
  first automated deploy; until then use the manual steps below

**Manual deploy**, on the VPS:
```bash
cd /root/homehold/homehold
git pull
docker compose up -d --build
```
(`.env` / `backend/.env` already exist on the VPS with generated secrets —
don't overwrite them with `.env.example` again.)

### Nginx / TLS — partially done

Live: `/etc/nginx/sites-available/homehold.conf` (symlinked into
`sites-enabled/`) proxies `homehold.website` -> `127.0.0.1:6100`, HTTPS via
a Let's Encrypt cert (certbot, auto-renews, expires 2026-11-17). `eneri`/
`dreich`/`salt-ash`/`n8n` nginx configs were not touched.

**Not done**: `api.homehold.website` -> `127.0.0.1:6101`. No Cloudflare DNS
record exists yet for the `api` subdomain, so the backend isn't publicly
exposed — only reachable at `127.0.0.1:6101` on the VPS itself. Add the DNS
record first, then add the nginx block + cert the same way as the
frontend's.

## Roadmap

- [x] Phase 0: scaffold, static landing page, backend health check,
      `docker compose up --build` works end-to-end locally
- [x] Phase 1 (partial): admin-bootstrapped auth — login, change own
      password, admin creates new accounts (see "Auth — implemented" above)
- [ ] Phase 1 (remaining): guest account issuing a scoped JWT without
      requiring an admin-created account
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
