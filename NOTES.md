# Field notes

Raw notes for the blog post. Each step lists what was done, what went wrong
(exact commands and messages), what worked well, and roughly how long it took.
Times are agent wall-clock in a cloud container, from the commit timestamps;
steps that need a human (the Prisma browser login) are listed separately.

Environment: Node 22.22.0, npm 10.9.4, Bun 1.4.4, PostgreSQL 16 client and
server binaries, Linux container behind an egress proxy.

---

## Step 0: Research (2026-10-26, 19:07 to 19:14, ~7 min)

### resource-scheduler (the package)

- Read the repo at `67014ca` (2026-10-23) and the published tarball
  `resource-scheduler@1.6.0`. The published `.d.ts` files are the source of
  truth for the template, since it installs from npm.
- **Worked well:** `resource-scheduler/headless` is genuinely server-safe. The
  built `headless.esm.js` imports only `date-fns` and has no `"use client"`,
  while the main entry starts with `"use client"`. `isPlacementAllowed` is 25
  lines in `utils/placement.ts`: find the target resource, drop the moving
  event by `id`, test `rangesOverlap` (end-exclusive), then apply
  `eventOverlap` and `isValidDrop`. That is exactly the shape a server needs.
- **Worked well:** `onSlotSelect`, `eventOverlap`, `isValidDrop`,
  `onEventDrop`, `onEventResize`, `events` (flat list with `resourceId`) and
  `initialDate` are all in `ResourceSchedulerProps` as the tutorials describe.
- **Friction:** the task brief mentions a `resource-scheduler-example` folder.
  It no longer exists; it was deleted in commit `65a7360` ("Remove
  resource-scheduler-example files and configurations"). It was a Vite
  showcase, not a Next.js app, so `resource-scheduler-rooms-starter` is the
  right base anyway.
- **Doc inconsistency:** the front-end tutorial
  (`tutorials/react-room-booking-calendar`) shows the server check as
  `import { isPlacementAllowed } from "resource-scheduler"`, which is the
  `"use client"` entry. The Next.js + Prisma tutorial and the SSR guide use
  `resource-scheduler/headless`. A server file should use the headless entry.
- **Design note:** `isValidDrop` runs in the browser and on the server. Any
  rule that calls `getHours()` (the "office hours" example in the conflict
  guide) gets different answers in the browser's zone and the server's zone
  (Compute is not in the user's zone). Rules shared across the boundary must be
  zone-independent, or use `utcToZoned(start, zone)` from the headless entry
  with a fixed zone on both sides.
- **Missing from the package (so far):** no `loading` prop on the component;
  there is `onRangeChange` for fetching per visible range. Not needed for v1.

### Network policy of this environment

- `www.prisma.io`, `console.prisma.io`, `api.prisma.io`, `pris.ly` and
  `resource-scheduler-docs.vercel.app` are blocked by the container's egress
  policy (`curl: (56) CONNECT tunnel failed, response 403`). GitHub (git and
  raw) and the npm registry are reachable.
- Worked around for research: the Prisma docs source is public in the
  `prisma/web` monorepo (`prisma/docs` now redirects there), the skills are in
  `prisma/skills`, and the resource-scheduler docs are MDX in the package repo.
  Read those at their latest commits instead of the rendered sites.
- **Not worked around:** deploying and `prisma auth login` need
  `api.prisma.io` / `console.prisma.io`. See the plan for how deploy will run.

### Prisma platform: what changed since the brief was written

These are the biggest findings, and they change the plan:

1. **Prisma Compute is GA**, not beta. "Prisma Compute is now GA" was posted
   2026-08-26 (updated 2026-10-13). Usage is billed (Free plan never bills;
   apps pause at the limit), builds run in your own GitHub Actions.
2. **`prisma.compute.ts`, `defineComputeConfig` and `compute:deploy` have been
   removed.** They were introduced around 2026-06-19 (blog post
   "prisma-compute-config-file") and replaced by Prisma Composer. The
   `prisma-compute` skill (v2.0.0, 2026-10-16) says: "Its commands fail with
   `CLI.UNKNOWN_COMMAND`..., its config files are not read". The old blog
   post is still up and now links to the Composer docs, so a reader who lands
   on it first will follow a dead path.
   - Today a Compute app is: `module.ts` (root module), `service.ts`
     (`compute({ name, deps, build: nextjs({ module, appDir }) })`), and a
     `composer` section in `prisma.config.ts`, deployed with
     `npx prisma deploy module.ts` after your own `npm run build`.
3. **`npm install prisma` now installs Prisma 8.** `prisma@latest` is
   `8.0.0-rc.27` (a release candidate tagged `latest`), while
   `@prisma/client@latest` is still `7.10.1`. The Prisma 8 CLI has no
   `generate`, `migrate dev` or `db push`; Prisma ORM 8 is a new contract-based
   ORM in `@prisma/orm-postgres` (`contract.prisma`, `prisma contract emit`,
   `prisma migration plan`, `prisma db migrate`, queries like
   `db.orm.public.Booking.where(...)`). ORM 8 GA is "expected in October 2026".
4. **The deploy commands only exist in the Prisma 8 CLI.** A Prisma ORM 7
   project would need `npx @prisma/cli@latest deploy`, and its
   `prisma.config.ts` (which must import `definePrismaConfig` from
   `prisma/config` v8) would collide with the v7 config. No doc shows a
   Prisma ORM 7 app deploying through Composer.
5. **Prisma ORM 8 has no transaction isolation levels yet.** The docs say:
   "There are no `isolationLevel`, `timeout`, or `maxWait` options". Our
   tutorial's guard is a `Serializable` transaction. ORM 8 offers row locks
   instead (`tx.orm.public.Room.where({ id }).forUpdate()`), or a raw
   `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE` as the first statement. The
   `P2034` error code from the tutorial does not exist in ORM 8 either
   (`sqlState` `40001` on the error or its `cause`).
6. **Composer + ORM 8 is the integrated path.** With
   `postgres({ name: "database", contract, config: "./prisma.config.ts" })`
   in `module.ts`, every deploy (production, preview stage, Deploy Button)
   provisions its own Prisma Postgres database and applies committed
   migrations before the service starts. With `rawPostgres()` you get only a
   URL and run migrations yourself.
7. **No `DATABASE_URL` in production.** A Composer service reads its database
   through `service.load()`, not `process.env`. `create-prisma`'s generated
   `db.ts` tries `service.load().database.client` and falls back to
   `process.env.DATABASE_URL` for plain `next dev`.
8. **Host/port:** Next.js standalone reads `PORT`, and the runtime sets
   `HOST=0.0.0.0`, so nothing to bind by hand. The docs warn that without
   `output: "standalone"` the deploy "completes" and the URL returns 504.
9. **Deploy Button** (for the prisma.io/apps gallery): needs a public repo
   with the Composer module at its root, a `build` script, one root lockfile,
   at most 100 files and 25 MB, and **no symlinks, submodules or custom GitHub
   Actions workflows**. Deploy Button URLs cannot pass env vars, so the first
   deploy must not need secrets.
10. **Runtime is Bun**, in one region (fixed at first deploy). No WebSockets,
    60 s to first byte, instances sleep when idle (keep DB pools small).

### `npx skills add https://github.com/prisma/skills --skill prisma-compute`

- Works (`skills@1.7.4`, ~3 s). It writes `.agents/skills/prisma-compute` and
  a **symlink** in the agent's skills folder, plus `skills-lock.json`.
- **Gotcha:** a symlink in the repo breaks the Deploy Button ("Symlinks ...
  are not supported"), and the skill adds ~12 files toward the 100-file limit.
  Ran it in a scratch directory instead of the template; the template's README
  tells contributors to run it locally.

### Decisions (from Prisma's brief: "end to end on Prisma ORM, Prisma Postgres and Prisma Compute, ideally with an AI agent doing the setup")

- **Prisma ORM 8 (RC) + Composer `postgres(contract)`**, not ORM 7. It is the
  only path where the deploy provisions the database *and* applies the
  migrations, so a Deploy Button copy works with zero setup. Cost: an RC API,
  and no isolation levels (row locks replace `Serializable`, see Step 3).
- No `prisma.compute.ts` / `compute:deploy`: they no longer exist. The
  equivalents are `module.ts` + `service.ts` and the `deploy` script.
- Seed: `npm run db:seed`, plus seed-if-empty on first request so a fresh
  deploy shows rooms.
- An AI agent (in a cloud container) does every step; the human
  steps are only the ones that need a browser (Prisma login).

---

## Step 1: Scaffold (19:18 to 19:24, ~6 min, 2 of them npm install)

```bash
npx create-prisma@0.14.4 resource-scheduler-prisma-template --template next \
  --provider postgres --authoring psl --package-manager npm --skills none \
  --yes --json --no-deploy
```

- Took **1 min 58 s**, almost all `npm install`. Exit 0, one JSON line out:
  `{"ok":true,...,"nextSteps":[..."npm run dev:composer"..."npm run deploy"...]}`.
  Good for agents: no prompts, no parsing of prose.
- `--help` does not list `--no-deploy`, but the docs and skill use it and it
  is accepted.
- Generated: Next 16.4.2, React 19.3.1, `prisma@8.0.0-rc.27`,
  `@prisma/orm-postgres@8.0.0-rc.20`, `@prisma/composer(-prisma-cloud)@0.34.0`,
  `alchemy@2.0.0-beta.83` (imported by Composer's deploy control code), an
  `overrides` block pinning `effect@4.0.3`, `module.ts`, `service.ts`,
  `prisma.config.ts` with `orm` + `composer` sections, a starter User/Post
  contract and an already-planned `init` migration.
- `node_modules` is **2.1 GB** for a starter.
- Untouched scaffold: `tsc --noEmit`, `eslint` and `next build` (11.5 s) all
  pass.

### Scaffold rough edges

- **`.gitignore` misses Next.js output.** It has only `node_modules/ dist/
  .env /.alchemy /.prisma-composer`. After one `next build`, `git status`
  shows `.next/`, `next-env.d.ts` and `tsconfig.tsbuildinfo` as untracked.
  Fixed in the template.
- **`prisma-8.md` (generated) disagrees with the generated files.** It shows
  a `prisma.config.ts` with `import 'dotenv/config'` and
  `definePrismaConfig` from `'@prisma/cli-engine'`, and says the config
  "loads environment variables from `.env` automatically"; the real file
  imports `prisma/config` and loads no `.env`. It shows `createdAt: Date` in a
  type, while the contract uses `TimestamptzString` (a string). It also says
  "the Prisma ORM plugin will do this for you automatically" for Next.js;
  no plugin is configured.
- `.env.example` says "Copy this file to `.env`", while the Next.js guide says
  "the generated scripts read the environment variable, not `.env`". Both
  are half true: `next dev` reads `.env`, the `prisma` CLI does not.

### `prisma dev module.ts` needs Node 24.11.1, not 22.18

```text
$ npx prisma dev module.ts --detach        # Node 22.22.0
[dev] compute emulator ready at http://127.0.0.1:4300
[dev] postgres emulator ready at http://127.0.0.1:4301
alchemy: node 22.22.0 is not supported. Upgrade to node 24.11.1 or newer.
```

- The docs, the skill, and the `engines` of `prisma`, `@prisma/composer` and
  `@prisma/composer-prisma-cloud` all say `^22.18.0 || ^24.11.0 || >=26`.
  `alchemy` declares no `engines` and checks at runtime (`module.registerHooks`
  support, nodejs/node#59929). So `npm install` succeeds on Node 22 and the
  first local run fails. The command still **exits 0**.
- Fix: Node 24 (`node-linux-x64@24.22.1` from npm, since nodejs.org is not
  reachable here). The template ships `.nvmrc` = `24` and says Node 24.11.1+.
- With Node 24: `prisma dev module.ts --detach` converged 9 resources in
  2.0 s, ~15 s total, and served the starter page on `http://localhost:3000`
  with the seeded users. The app runs under **Bun** (`bun bootstrap.js`), as on
  Compute, against a local Prisma Postgres emulator
  (`prisma dev url database` prints its connection string). No credentials.
  This is a very good local loop.

---

## Step 2: Data contract, migration, seed (19:24 to 19:31, ~7 min)

- `contract.prisma` in ORM 8 PSL: `Room` (`name @unique`, `floor`, `seats`)
  and `Booking` (`title`, `booker`, `roomId`, `startsAt`, `endsAt`,
  `createdAt`). Ids are `String @id @onCreate(cuid(2))`: `@default(cuid())`
  from ORM 7 is now a generated value (`@onCreate`), and `cuid()` needs its
  version.
- **Time types are a real decision in ORM 8.** `DateTime` reads as
  `Temporal.Instant` (needs a global `Temporal`; Node 24 has none, so the
  scaffold imports `temporal-polyfill/global`), `TimestamptzString` as a
  string, `TimestamptzJsDate` as a JS `Date`. The scheduler wants `Date`, so
  bookings use `TimestamptzJsDate`. The PSL page explains it well, once found.
- `@@check(expression: sql\`"endsAt" > "startsAt"\`, name: ...)` works and lands
  in the migration as `booking_ends_after_start_20c1ac54` (a hash suffix is
  added to `name:`).
- `npx prisma contract emit` and `npx prisma migration plan --name init` both
  worked first time. `migration plan` prints the full SQL it will run, which
  is excellent for review. Nit: it adds an index on the foreign key
  (`Booking_roomId_idx`) next to my `@@index([roomId, startsAt])`, which already
  covers `roomId`, so one index is redundant.

### Exclusion constraint (database-level double-booking guard)

- The contract cannot express `EXCLUDE USING gist`. The docs' "Limitations"
  section says to put such things in a raw SQL step, so I edited the planned
  `migration.ts`: `createExtension('btree_gist')` first, and a `rawSql({...})`
  with precheck/execute/postcheck at the end:
  `EXCLUDE USING gist ("roomId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&)`.
  Then `node migrations/app/<dir>/migration.ts` recompiles `ops.json`.
- `npx prisma migration check` passed, `npx prisma db migrate --yes` applied
  9 operations, and **`npx prisma db verify` accepted the extra constraint**
  ("full (marker + schema, tolerant)"). I was worried it would flag schema
  drift; it does not.
- `btree_gist` is on Prisma Postgres's supported-extension list, and the
  local `prisma dev` database (it is **PGlite: "PostgreSQL 17.5 on
  wasm32-unknown-linux-gnu"**) has it too, so the same migration runs locally,
  in previews and in production.
- Doc inconsistency: the Prisma Postgres "Extensions" page still teaches the
  ORM 7 flow (`prisma migrate dev --create-only`, `migration.sql`) and links
  to `/orm/v7/...`, while the ORM 8 docs are the default everywhere else.

### Seed

- `create-prisma` seeds on the first query and ships no seed command. Kept
  that idea (`ensureSeeded()` on the first page load, so a Deploy Button copy
  shows rooms) and added `npm run db:seed` (`-- --reset` to start over).
  Concurrent first requests are serialized with `pg_advisory_xact_lock`
  through `tx.raw.sql\`...\`.affectedCount().build()`.
- Times are seeded on the office clock (`Europe/Berlin`) with `zonedToUtc`
  and `utcToZoned` from `resource-scheduler/headless`, so "09:00" is 09:00
  in the office however the server's clock is set.
- The `prisma` CLI does not read `.env` (the generated `prisma-8.md` says it
  does). Added `process.loadEnvFile()` in a `try` to `prisma.config.ts`, and
  `node --env-file-if-exists=.env` to the seed script. Node 22.22 runs the
  `.ts` seed directly (type stripping), no `tsx` needed.

### npm audit

- After install: **14 vulnerabilities (5 moderate, 9 high)**, all inside
  Prisma's own tooling: `lodash` via `chevrotain` via `@mrleebo/prisma-ast`
  via `@prisma/dev`, `hono` and `@hono/node-server` via `@prisma/dev`,
  `valibot` via `alchemy`. `npm audit fix --force` would "fix" them by
  installing `@prisma/composer@0.6.0` or `prisma@7.10.1`, i.e. downgrading
  the platform. Left as is; dev and deploy tooling, not app runtime code.

---

## Step 3: Booking API (19:31 to 19:35, ~4 min)

### How the server guards against double booking

The tutorial used `prisma.$transaction(fn, { isolationLevel: Serializable })`
and turned `P2034` into a 409. Neither exists in Prisma ORM 8, so:

1. `db.transaction(async (tx) => ...)` (READ COMMITTED, the only level).
2. Lock the room row(s): `tx.orm.public.Room.where({ id }).forNoKeyUpdate().first()`,
   in id order. A move locks the booking first, then both rooms, so all
   writers take locks in the same order and queue instead of deadlocking.
   `FOR NO KEY UPDATE` rather than `FOR UPDATE` so other transactions'
   foreign-key checks on `Room` are not blocked.
3. Read the overlapping bookings with `.where((b) => b.startsAt.lt(end))` /
   `.gt(start)`, build a `Resource` and call `isPlacementAllowed` from
   `resource-scheduler/headless` with the same `bookingRules()` the browser
   spreads onto the component.
4. Write. Postgres refusals (`sqlState` `23P01` exclusion, `40001`, `40P01`)
   also become a conflict; the exclusion constraint is the backstop.

This is arguably simpler than Serializable: no retries, no serialization
failures, and the losers get a precise message instead of "try again".

- Live check through HTTP: 20 parallel `POST /api/bookings` for the same slot
  gave **1 × 201 and 19 × 409**, one row in the table, nothing in the log.
- Errors: 400 `invalid` with per-field messages from zod, 404 `not_found`,
  409 `conflict` that names the booking in the way on the office clock
  (`Atlas is already booked from 9:00 AM to 9:30 AM ("Daily standup").`),
  422 `rule` for opening hours and "already started".

### Package gaps found (resource-scheduler)

- `isPlacementAllowed` returns only `boolean`. A server wants to say *why*
  (overlap with which booking, or which `isValidDrop` rule), so the template
  runs its own `checkBookingRules()` first to explain rule breaks and looks
  up the overlapping booking itself for the message. A variant that returns
  the reason (`{ ok: false, reason: "overlap", with: event }` or the
  rule's own code) would remove that duplication. Not worked around in the
  package; logged here.
- Rules shared across the boundary must be time-zone independent. The
  conflict-control guide's `isValidDrop` example (`start.getHours() >= 9`)
  gives different answers in a browser in Berlin and a server in UTC. The
  template uses `utcToZoned(start, OFFICE_TIME_ZONE)` on both sides, plus the
  component's `timeZone` prop. The docs could warn about this next to the
  "use it on the server too" advice.

### Prisma ORM 8 API notes

- Reads well once learned: `where({ id })`, `.where((b) => b.startsAt.lt(x))`,
  `.orderBy((b) => b.startsAt.asc())`, `.first()`, `.all()`, `create({...})`
  without `data:`, `where({ id }).update({...})` returns `Row | null`,
  `where({ id }).delete()` returns the row or `null`.
- Errors carry `sqlState` on the error or its `cause` (no exported class to
  `instanceof`). The docs show the loop to dig it out; copied that.
- `upsert` needs `conflictOn: { name: "<any value>" }` where only the key
  matters. Odd, but documented.

### Next.js 16 surprise

- The first `next dev` wrote an `AGENTS.md` ("This is NOT the Next.js you
  know ... Read the relevant guide in `node_modules/next/dist/docs/`") and
  logs `Generated AGENTS.md for AI agents. Set agentRules: false in
  next.config to disable.` It asks to be committed, so it is. Checked the
  bundled docs: `export const dynamic = "force-dynamic"` is still valid
  without Cache Components.

---

## Step 4: The board (19:35 to 19:40, ~5 min)

- Straight from the package docs and types, nothing invented:
  `events` (flat, `resourceId`), `resources` with `group` (floors) and
  `role` ("8 seats"), `timeZone`, `initialDate`, `slotDuration`,
  `dayStartHour`/`dayEndHour` as opening hours, `nowIndicator`,
  `eventOverlap`/`isValidDrop` from the shared `bookingRules()`,
  `onSlotSelect` for my own `<dialog>`, `onEventDrop`/`onEventResize`,
  `onRangeChange` to load other days, `renderEventPopover` for a "Cancel
  booking" button, `labels={{ resources: "Rooms" }}`, and
  `data-theme="system"` on `<html>` for dark mode.
- **Worked well:** the `timeZone` prop. Handlers get instants ready to
  store, render props get wall-clock dates, and `utcToZoned` makes the same
  rule work on the server. The red footprint appears exactly where the rule
  says no.
- Verified in Chromium with Playwright (dev server, local Postgres):
  - drag-select Borealis 10:00 to 11:00 opens my dialog with "Tue, Oct 27,
    10:00 AM to 11:00 AM (Europe/Berlin)"; empty submit shows the zod
    messages without a request; Book shows a grey pending card, then
    "Booked Borealis, 10:00 AM to 11:00 AM."
  - dragging a booking onto a busy slot tints the footprint red, and **no
    request is sent**.
  - two tabs, same slot: the stale tab's optimistic booking is rolled back
    with `Delta is already booked from 1:00 PM to 1:30 PM ("Winner").`
  - move to another room (PATCH 200), popover "Cancel booking" (DELETE 204),
    "Next period" loads the next day (GET 200). No console or page errors.
- **Fixed after the first run:** after a 409 the stale tab still did not
  show the booking that won, so the user could not see what was in the way.
  The board now reloads the visible day after any conflict.
- Small rough edges in the package UI:
  - the column header is `labels.resources` ("RESOURCES"); easy to rename,
    but a room app has to know the key exists.
  - With `onRangeChange` the first call fires on mount even when the page
    already has that day's data, and React Strict Mode fires it twice in dev
    (the docs say so). The board skips the first call itself.
  - A 30-minute card shows "Daily st…": no tooltip with the full title on
    hover (the popover has it on click).

---

## Step 5: Tests (19:40 to 19:45, ~5 min)

- Vitest 5. `npm test` runs 25 unit tests anywhere; with `TEST_DATABASE_URL`
  set it also runs 15 integration tests against real PostgreSQL (global setup
  runs `prisma db migrate --yes` on it first, the same path a deploy takes).
- The integration tests cannot use the local `prisma dev` database: it is
  PGlite, a single session shared by every connection, so row locks between
  "two users" mean nothing there. Used PostgreSQL 16 (also works with the
  `postgres` Docker image).
- What they show:
  - 25 simultaneous `createBooking` calls for one slot: exactly 1 ok,
    24 `conflict`, 1 row.
  - a create and a move racing for one slot: one wins.
  - 10 rounds of two bookings swapping rooms at once: no deadlock.
  - with the exclusion constraint dropped, still exactly 1 of 25: the room
    lock alone is enough.
  - with the constraint dropped, a plain check-then-insert (two transactions
    that both read "free") **does double-book**: why the lock exists.
  - with the lock skipped, Postgres refuses the overlap itself (`23P01`).
  - five concurrent `seedIfEmpty` calls insert the demo data once.
- **Mutation-tested the guard:** removing `forNoKeyUpdate()` on the room
  makes "the room lock alone" fail; removing the `.sort()` of the lock order
  makes the swap test fail with a real deadlock surfacing as a conflict.
  5 of 5 repeated runs green, ~6 s.
- **Bug the tests found:** zod 4 still runs an object's `superRefine` when one
  of its fields failed to parse, so `"startsAt": "tomorrow"` (everything else
  valid) reached `slot.startsAt.getTime()` on a string and the API answered
  **500**. Reproduced with curl (`[500]`), guarded the refinement, now `400`
  with `startsAt: ["Use an ISO 8601 date and time with a time zone."]`. The
  same pattern was in the range schema of `GET /api/bookings`. My earlier
  curl test missed it because other fields were also invalid in that request.

---

## Step 6: Production build and the Compute-like local run (19:45 to 19:50, ~5 min)

- `npm run build` (Next 16.4.2, Turbopack): 13 s, all routes dynamic.
- **Gotcha: `next build` copies `.env` into `.next/standalone`.** Next copies
  `.env` and `.env.production` (`loadedEnvFiles` in `next/dist/build`), and
  the Composer `nextjs` adapter deploys that folder. So the obvious flow
  (`cp .env.example .env`, `npm run deploy` from a laptop) would upload the
  local `DATABASE_URL` to Compute. Unused there (Composer's client wins), but
  a credential should not ship. Fix: local settings live in `.env.local`
  (read by `next dev`, never copied); `prisma.config.ts` and the seed script
  load it. Neither create-prisma nor the docs mention this.
- **Bundle size:** the standalone output was **70 MB**, 46 MB of it sharp's
  `@img` binaries for `next/image`, which this app does not use.
  `images: { unoptimized: true }` alone did not remove them; adding
  `outputFileTracingExcludes` for `sharp` and `@img` did: **23 MB**.
- `prisma dev module.ts --detach --fresh` = a first deploy in miniature:
  empty database, Composer applies the committed migrations (including the
  hand-written exclusion constraint), the standalone build runs **on Bun**.
  Up in ~11 s; first `GET /` 0.62 s (seeds the demo data), then 0.02 s.
  The ORM 8 client from `service.load().database.client` worked unchanged.
- All browser flows from Step 4 pass on this stack too, and 20 concurrent
  `POST`s gave 1 × 201 and 19 × 409 even on PGlite.
- Rough edge: right after that burst, `psql` against the PGlite emulator
  failed once with `server closed the connection unexpectedly`; it answered
  normally 2 s later with the right data.
- Repo size for the Deploy Button: 49 tracked files, < 1 MB (limits: 100
  files, 25 MB).

---

## Step 7: Docs and a fresh clone (19:50 to 20:03, ~13 min)

- README (what, Deploy button, how the guard works, local setup, deploy,
  env vars, host/port, scripts, structure, tests, extending,
  troubleshooting), MIT LICENSE, `.env.example`, `AGENTS.md` project rules.
- Removed the generated `prisma-8.md`: it describes a different
  `prisma.config.ts` than the one generated next to it (see Step 1).
- Dropped `db:init` / `db:update` (they change the schema without a
  migration, so a later `db migrate` would disagree with the database) and
  `start` (`next start` warns: `"next start" does not work with "output:
  standalone" configuration. Use "node .next/standalone/server.js"
  instead.`).
- **Host/port, checked in the source rather than assumed:** the Composer
  `nextjs` adapter copies `.next/standalone` verbatim (`copyTreeVerbatim`,
  plus `static/` and `public/`), and its bootstrap imports Next's
  `server.js`, which listens on `process.env.HOSTNAME || '0.0.0.0'` and
  `PORT`. Compute sets `PORT`. So nothing to configure, as long as nobody adds
  `HOSTNAME`/`HOST` to the project env. Will confirm on the real deploy.
- **Fresh clone** of the pushed branch into an empty directory on Node 24:
  `npm ci` 46 s; lint, typecheck, 40/40 tests against a new database, build;
  `prisma dev module.ts --detach --fresh` up in 11 s, page renders the seeded
  rooms, `GET /api/bookings` returns 15 bookings; `git status` clean after
  building and running.
- My own mistakes, for honesty: `npm run dev:composer -- --detach --fresh`
  does not pass the flags to `prisma dev` (npm appends them to the last
  command as npm flags), so it ran in watch mode until my timeout (~7 min
  lost). And a second checkout with the same module name gets
  `http://localhost:3001`, not 3000 (Composer keeps ports per app name), so
  my first `curl localhost:3000` showed nothing.

### Time so far

| Step | Agent time |
| --- | --- |
| 0. Research (docs blocked, read from GitHub sources) | ~7 min |
| 1. Scaffold with create-prisma | ~6 min |
| 2. Contract, migration with exclusion constraint, seed | ~7 min |
| 3. Booking API with row locks | ~4 min |
| 4. Scheduler board, dialog, optimistic updates | ~5 min |
| 5. Tests, mutation checks, a 500 found and fixed | ~5 min |
| 6. Build size and env leak fixes, Compute-like run | ~5 min |
| 7. Docs and fresh clone | ~13 min |
| **Total before deploy** | **~55 min** |

---

## Step 8: Deploy to Prisma Compute (pending: needs a human)

- This cloud container cannot reach `api.prisma.io` or
  `console.prisma.io` (egress policy, `CONNECT tunnel failed, response
  403`), and `npx prisma auth login` opens a browser. So the deploy is the
  one step the agent cannot do here.
- Commands for the person deploying (Node 24.11.1+ and Bun installed):

  ```bash
  git clone <repo> && cd <repo>
  npm ci
  npx prisma auth login
  npx prisma auth whoami --json
  npm run deploy
  ```

- To record here: how long each command took, the exact output (URL, ids),
  any error text, whether the first visit seeds the demo data, the cold
  start time, and the boot log (`npx prisma project link
  resource-scheduler-prisma-template`, `npx prisma service logs app`).
