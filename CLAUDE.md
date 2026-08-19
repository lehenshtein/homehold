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
frontend/          # vanilla TS + Vite, no client router — see "Routing" below
  index.html
  src/main.ts        # thin router: pathname -> initLanding() or initNotes()
  src/pages/
    landing.ts          # hero (auth UI) + project grid
    notes.ts             # pinboard app (see "Notes feature" below)
  src/auth.ts         # login/guestLogin/logout/changePassword/createUser/fetchMe
  src/notes-api.ts     # typed client for /note/* endpoints
  src/api.ts            # fetch wrapper: base /api, injects token, throws on non-2xx
  src/dom-utils.ts        # escapeHtml, formValue, onFormSubmit (shared safe-form-read helper)
  src/style.css
  vite.config.ts       # dev-only: proxies /api/* -> localhost:6101
  nginx.conf             # prod: same /api/* proxy, -> homehold-backend:6101
  Dockerfile               # multi-stage: vite build -> nginx:alpine + nginx.conf
backend/            # Express + TypeScript + Prisma
  src/server.ts      # Express app; mounts addUserToRequest, /auth, /user, /note; GET /ping
  src/routes.ts       # router aggregator (AuthenticationRoutes, UserRoutes, NoteRoutes)
  src/middleware/Authentication.ts  # addUserToRequest, requireAuthentication, requireAdmin
  src/library/
    prisma.ts          # shared PrismaClient singleton — import this, don't `new PrismaClient()` elsewhere
    password.ts          # generateSalt/hashPassword (PBKDF2, same scheme as eneri-be)
    jwt.ts                 # createToken/verifyToken (7d expiry, JWT_SIGN_KEY)
  src/apps/
    authentication/     # POST /auth/login, POST /auth/guest, POST /auth/change-password
    user/                 # GET /user/me (auth'd), POST /user (admin-only, creates account)
    note/                  # GET/POST /note, GET/PUT/DELETE /note/:id, items, share/unshare
      note.lib.ts            # PASTEL_COLORS, cleanupExpiredGuestNotes, serializeSummary/Detail
  src/scripts/seedAdmin.ts  # idempotent: creates lehenshtein/admin only if it doesn't exist yet
  prisma/schema.prisma  # User, Note, TodoItem, NoteShare — see "Notes feature" below
  Dockerfile          # node:20-alpine multi-stage, installs openssl (Prisma needs it on Alpine)
  .env.example
docker-compose.yml    # homehold-db (postgres, w/ healthcheck) + homehold-backend + homehold-frontend
.env.example           # POSTGRES_USER/PASSWORD/DB for docker-compose.yml
package.json            # root-only: orchestrates hot-reload dev via `concurrently` (see "Local Development")
.github/workflows/main.yml
```

### Routing (no client router, deliberately)

`/notes` isn't a build-time page or an SPA route — `main.ts` just checks
`window.location.pathname` and calls `initLanding()` or `initNotes()`.
Every navigation (including clicking a `<a href="/notes">` link) is a
normal full page load; nginx (`frontend/nginx.conf`, prod) and Vite (dev)
both fall back unmatched paths to `index.html`, which re-runs the same
router. No history/pushState handling needed. Fine for a two-page app —
revisit if a third page shows up.

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
- **Guest accounts are implemented.** `POST /auth/guest` (no body) logs in
  as a single shared `guest` account — created lazily on first use, never
  registered any other way. Regular `POST /auth/login` explicitly rejects
  `isGuest` users (its random password is never revealed), so `guest` can
  only be reached through this endpoint. Every visitor who clicks "Continue
  as guest" gets the *same* account/identity — deliberate, see "Notes
  feature" below for why (one shared guest note + one shared guest to-do,
  not per-visitor).

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

## Notes feature — implemented (2026-08-19)

A shared pinboard at `homehold.website/notes` — sticky notes and to-do
lists, ownable, shareable between users (including the shared `guest`
identity). Not a separate pet project (see "Shared Database" below) — its
tables (`Note`, `TodoItem`, `NoteShare`) live directly in homehold's own
schema, and it's served by homehold's own frontend/backend.

### Data model (`prisma/schema.prisma`)

- `Note` — `type` (`note` | `todo`), `title`, `content` (text body, `note`
  type only), `color` (pastel hex, random at creation, stays stable),
  `tags` (see below), `visibility` (see below), `ownerId`
- `TodoItem` — belongs to a `Note`, `text` + `done` + `position`
- `NoteShare` — join table, `(noteId, userId)` unique — only meaningful
  when `visibility = 'specific'`; the exact set of people who can see it

### Sharing model: 5 visibility levels, not free-text sharing

`Note.visibility` (enum, default `private`):

| Value | Who can see it | Why it exists |
|---|---|---|
| `private` | owner only | default |
| `public` | **everyone** — all registered users + guest | "share with everyone" |
| `guests` | owner + the shared `guest` account, **not** other registered users | lets you hand something to guest without it cluttering every registered user's "shared with me" list |
| `users` | owner + all registered users, **not** guest | broad share, deliberately excluding the noisy shared guest identity |
| `specific` | owner + whoever's explicitly picked (`NoteShare` rows) | the multiselect — picks from `GET /user`'s list, which itself excludes guest |

Guest is **never individually selectable** in the `specific` picker
(`GET /user` excludes `isGuest` users, and `note.controller.ts`'s
`updateSharing` also filters `isGuest: false` server-side even if a client
sent a guest id anyway) — the only way to reach guest is the dedicated
`guests` visibility level. This was a deliberate design decision (confirmed
with the project owner) to keep guest access as one clear toggle rather
than a name in a crowded user-picker.

Switching visibility away from `specific` clears any existing `NoteShare`
rows for that note (`updateSharing` always does
`deleteMany` → optionally `createMany` → `update` in one transaction) — so
switching back to `specific` later starts from an empty pick list, not
stale state.

### Tags & search (added 2026-08-19)

`Note.tags` is a **Postgres scalar list** (`String[]`), not a normalized
`Tag` table — right call at this scale, and `db push` handles it. Revisit
only if tags need their own metadata (colors, descriptions, renames).

**Always stored normalized** by `normalizeTags()` (`note.lib.ts`): trimmed,
lowercased, inner whitespace → `-`, deduped, each capped at
`MAX_TAG_LENGTH` (24), list capped at `MAX_TAGS` (10). So `"  Groceries "`,
`"HOME"` and `"two words"` store as `groceries`, `home`, `two-words`, and
`tags: { has: x }` lookups are always exact — no case-variant splitting.
`normalizeTag()` in `pages/notes.ts` mirrors this client-side so the chip
you see is exactly what gets saved.

**Search** is one extra `search` param on the existing `GET /note`, not a
separate endpoint: `title contains (case-insensitive) OR tags has (exact)`,
**AND-ed** with the existing visibility scope. That ordering matters —
searching can never widen what you're allowed to see (verified: a guest
searching for a term in someone's private note gets `[]`, and only starts
matching once that note is made public).

**`GET /note/tags`** returns the *caller's own* tags with usage counts,
most-used first — powers the "5 most used" clickable cloud. Prisma can't
`groupBy` array elements, so counting happens in JS over the user's own
notes; at personal-board scale that beats dropping to raw SQL `unnest`.
Note this is deliberately per-owner: your cloud never suggests tags from
notes merely shared *with* you.

**Route-ordering trap**: `router.get('/tags')` MUST stay above
`router.get('/:id')` in `note.router.ts` — Express matches in registration
order, so `/:id` would otherwise swallow `/tags` and try to look up a note
with id `"tags"`. There's a comment on it; don't reorder.

### Permissions

- **Owner only**: edit title/content, edit tags, add/edit/delete to-do
  items, delete the note, change sharing (`PUT /note/:id/sharing`)
- **Everyone else who can see it**: read-only — can open and view, cannot
  modify anything (backend enforces this in `note.controller.ts`'s
  `loadNote()` + `isOwner` checks on every mutating route; frontend also
  hides the edit/delete controls, but the backend is the actual gate)
- List filters (`GET /note?filter=`): `mine` (owned), `shared` (visible via
  any of the 4 non-private paths above, excluding your own), `all` (union)
  — matches the pinboard's All / My notes / Shared with me toggle. The
  where-clause logic lives once in `note.lib.ts`'s `visibilityWhere()`,
  reused by both `list` and `loadNote`'s `isNoteVisibleTo()` so they can't
  drift apart.

### Guest limits: one note + one to-do, 72h auto-expiry

Because every guest visitor shares the *one* `guest` account (see "Auth"
above), guest-owned content is capped **globally**, not per-visitor:
- At most 1 note **and** 1 to-do list owned by `guest` at a time (separate
  counters per `type` — `note.controller.ts`'s `create` checks
  `prisma.note.count({ where: { ownerId, type } })`)
- `cleanupExpiredGuestNotes()` (`note.lib.ts`) deletes any of `guest`'s
  notes older than 72h. **No cron job** — it just runs lazily at the top of
  `GET /note` (list) and `POST /note` (create), so it fires "each time the
  board initializes, someone goes there", per spec. Verified manually by
  backdating a guest note's `createdAt` in Postgres and confirming the next
  list call swept it (and that creation was allowed again afterward).

### API (`/note` and `/user`, all routes require auth)

| Method | Path | Notes |
|---|---|---|
| GET | `/note?filter=all\|mine\|shared&search=` | summaries for the pinboard; `search` matches title (ci substring) or exact tag |
| GET | `/note/tags` | `[{tag, count}]` — caller's own tags, most-used first. **Must be routed above `/:id`** |
| POST | `/note` | `{ type, title, content?, tags? }` or `{ type: 'todo', title, items?: string[], tags? }` |
| GET | `/note/:id` | full detail incl. items/sharedWith (owner-visible only) |
| PUT | `/note/:id` | `{ title?, content?, tags? }` — owner only |
| DELETE | `/note/:id` | owner only |
| POST/PUT/DELETE | `/note/:id/items[/:itemId]` | add/edit/delete a to-do item — owner only |
| PUT | `/note/:id/sharing` | `{ visibility, userIds? }` — owner only, see "Sharing model" above |
| GET | `/user` | `[{id, username}]`, excludes guest + caller — powers the sharing multiselect |

### Frontend UI notes

- **Design system** (`style.css` top): CSS custom properties —
  `--surface-*`/`--text*`/`--border-soft` for generic UI, separate
  `--board-*` tokens just for the pinboard, and `--tone-primary/success/
  danger/warning/neutral` driving a reusable `.btn` system:
  `.btn` + one of `.btn-fill`/`.btn-stroke`/`.btn-text` (fill = solid
  tone-colored bg with a soft glow shadow, stroke = tinted outline, text =
  ghost) + one tone class, optional `.btn-sm`/`.btn-icon`. Uses
  `color-mix()` for the tinted hover/glow states — deliberately not
  Material (no ripple, no flat elevation cards). Applied consistently
  across landing + notes; the "+ Note"/"+ To-do list" `.pastel-button`s are
  a deliberate *exception* — they're playful sticker-colored actions, not
  semantic-status buttons, so they stay outside the tone system.
- **Pinboard** (`.corkboard`): dot-grid texture via a single
  `radial-gradient`, using `--board-bg`/`--board-texture` tokens (dark by
  default, since that's how the owner actually uses it — no more literal
  brown cork blobs, which looked bad against a dark page). `min-height:
  560px`, page `max-width: 1180px` — deliberately large, it's the
  centerpiece. Stickers get a small deterministic tilt (`hashRotation()` —
  hashes the note id, not `Math.random()`, so it doesn't jitter on
  re-render) and a pin dot. A sticker shows a badge (🌍/🕶️/👥/🎯 per
  visibility) when `isSharedByMe` is true.
- **Detail panel reads as "the sticker, opened"**: `.note-detail` sets
  `--note-color` inline (the note's own pastel color) and the stylesheet
  uses it for a colored border tint, a colored glow (`box-shadow` via
  `color-mix`), a pin (`::before`) and a colored accent strip (`::after`)
  — while the card body itself stays on the normal dark `--surface-1`, per
  "still dark, but with the feeling of actually opening a sticker."
- **Type-ahead without losing focus** (the one real architectural
  constraint here): the app renders by replacing `#app.innerHTML`, so
  calling `render()` on each keystroke would destroy the very `<input>`
  being typed into and drop focus/caret after one character. Both the tag
  editor and the search box therefore use `setHtml()` (`dom-utils.ts`) to
  rewrite **only** their dropdown/chip/cloud containers, never the input.
  Any future type-ahead must follow the same rule.
- **Mobile keyboards can't be trusted to fire Enter** (reported bug: on
  Chrome/Android tags and search both appeared but "didn't work"). Android
  IMEs frequently don't emit a `keydown` with `key === 'Enter'`, and because
  the tag input sits inside the create `<form>`, tapping Go submitted the
  form and created the note with no tags at all. Three defences, all needed:
  1. an explicit **Add** button beside the tag input (never relies on a key
     event), 2. **live debounced search** (400ms) so searching needs no Enter
     at all, 3. the create-submit handler **rescues** any text still sitting
     in the tag input so a premature submit can't silently drop it. Keep all
     three if this area is touched; desktop-only testing will not catch this.
- **No debounce anywhere except live search**: both type-aheads filter
  *already-fetched* data client-side — tag suggestions from `state.myTags`
  (one `GET /note/tags` per page load), search suggestions from
  `state.suggestPool`. So they're instant, fire zero requests per
  keystroke, and have no in-flight-race bookkeeping. The *search query
  itself* is debounced (400ms) because it does hit the API — and it repaints
  only `#corkboard` via `renderCorkboardInner()` + `wireStickerClicks()`,
  never a full `render()`, so the input keeps focus mid-typing. `suggestPool` is a
  snapshot of the current filter's notes taken only on *unsearched* loads,
  so suggestions don't progressively collapse into the results as you type.
- **Tag editor** (`renderTagEditor`/`attachTagEditorHandlers`, shared by the
  create form and the detail view via a `ns` id prefix + `getTags`/`setTags`
  hooks): chips with ✕, Enter/comma to add, Backspace-on-empty removes the
  last one, and the cloud below shows the 5 most-used tags — narrowing to
  matches as you type, per spec. In the create form tags are local
  (`state.draftTags`) until submit; in the detail view each change PUTs
  optimistically and refreshes the cloud's counts.
- **Sharing panel**: `VISIBILITY_OPTIONS` (`notes-api.ts`) drives a radio
  card list with per-option help text (`.visibility-option`); picking
  `specific` reveals a checkbox "chip" list (`.user-checkbox`) fed by
  `GET /user`. Changing the radio/checkboxes only updates local
  `state.sharingDraft` and re-renders — no API call until "Save sharing" is
  clicked (`PUT /note/:id/sharing`).
- **Every path into the detail view must call `primeSharingState(note)`.**
  There are exactly two (`openNote()` and the create-note submit handler);
  both do. It sets `state.sharingDraft` *and* kicks off the `GET /user`
  fetch. Postmortem — this was a real reported bug: the create handler used
  to assemble the detail view by hand and skipped the fetch, so
  `state.registeredUsers` stayed `null`, which is exactly the value that
  renders "Loading users…". Result: on any freshly-pinned note the
  "Specific people" picker hung on that message forever — no request in
  flight, no error, nothing to debug from — while the same note worked fine
  after closing and reopening it (which routes through `openNote`). Hence
  the single shared function instead of two hand-rolled setups. If a third
  entry point ever appears, route it through `primeSharingState` too.
- Clicking a sticker opens an in-page detail view (no navigation) —
  `state.view` in `notes.ts` switches between `board` / `create` / `detail`
  and re-renders `#app`'s content, same single-page-app pattern as
  `landing.ts`.
- All forms (create note/todo, add item) use the same `onFormSubmit`/
  `withBusy` pattern as `landing.ts` — see `dom-utils.ts` and the "login
  form sends empty values" postmortem two sections up for why form values
  must be captured *before* any re-render, not looked up from the DOM
  afterward.
- Checkbox/inline-edit interactions on to-do items and the sharing
  radios/checkboxes all read `e.target`'s value directly inside the
  handler — safe by the same rule, since that's synchronous at event-fire
  time regardless of any later re-render.

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

### Nginx / TLS — done

Both live, Let's Encrypt certs via certbot (auto-renew, expire
2026-11-17). `eneri`/`dreich`/`salt-ash`/`n8n` nginx configs were not
touched by either.
- `/etc/nginx/sites-available/homehold.conf` -> `homehold.website` ->
  `127.0.0.1:6100` (frontend; handles `/api/*` internally, see above)
- `/etc/nginx/sites-available/api.homehold.conf` -> `api.homehold.website`
  -> `127.0.0.1:6101` (backend directly — not used by homehold's own
  frontend, only for external consumers: other services, direct `curl`,
  a future mobile client, etc.)

Note: as of this writing the VPS is still running whatever backend/frontend
code was last pushed to `dev` — the notes feature only goes live there once
this is committed/pushed and the runner deploys it.

## Roadmap

- [x] Phase 0: scaffold, static landing page, backend health check,
      `docker compose up --build` works end-to-end locally
- [x] Phase 1: full auth — admin-bootstrapped login, change own password,
      admin creates new accounts, guest login (see "Auth — implemented")
- [x] Notes feature (not originally in this roadmap, built 2026-08-19): see
      "Notes feature — implemented" above
- [ ] Phase 2: landing page wired to backend (project registry table
      instead of the hardcoded array in `pages/landing.ts`),
      account/profile page
- [ ] Phase 3+: onboard first real *external* pet project (Notes doesn't
      count — it's part of homehold itself, see its section above),
      resolve the shared-DB schema/prefix convention below

## Local Development

Two modes — pick based on what you're doing:

**Hot-reload dev** (day-to-day feature work — Vite HMR + `nodemon`
auto-restart, no image rebuilds). One-time setup, then `npm run dev` every
time:
```bash
npm run install:all
cp .env.example .env
cp backend/.env.development.example backend/.env   # NOTE: not .env.example — see below

npm run dev   # localhost:5173 (frontend) + localhost:6101 (backend), color-coded logs
```
The root `package.json`'s `dev` script (via `concurrently`) does 3 things:
`docker compose up -d homehold-db` (Postgres, published on host port
`5433` for this purpose), then runs `backend`'s and `frontend`'s own `dev`
scripts together. Backend's `dev` script chains `prisma db push` (syncs
schema) → idempotent admin seed → `nodemon`. Run just one side with
`npm run dev:backend` / `npm run dev:frontend` (still needs
`npm run dev:db` running first).

`backend/.env.development.example` differs from `backend/.env.example`
only in `DATABASE_URL`'s host: `localhost:5433` (what `docker-compose.yml`
publishes `homehold-db` on) instead of `homehold-db` (the Docker-network
hostname, unreachable from outside Docker). Verified this whole flow
end-to-end (`db push` synced, seed ran idempotently, nodemon restarted on
file touch, Vite proxy reached the backend) before writing it down here —
also hit and fixed an orphaned-process gotcha along the way: killing the
top-level `npm run dev` PID doesn't kill the `nodemon`/`vite` children it
spawned via `concurrently`; use `pkill -f "nodemon|vite|concurrently"` (or
just close the terminal) to actually free the ports.

**Full Docker stack** (matches prod exactly — use this to sanity-check
before pushing, not for iterating):
```bash
cp .env.example .env && cp backend/.env.example backend/.env
docker compose up -d --build
```
