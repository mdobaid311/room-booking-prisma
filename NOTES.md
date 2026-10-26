# Field notes

Raw notes for the blog post. Each step lists what was done, what went wrong
(exact commands and messages), what worked well, and roughly how long it took.
Times are wall-clock for an agent working in a cloud container, so they are
short for reading and long for anything that waits on a human.

Environment: Node 22.22.0, npm 10.9.4, Bun 1.4.4, PostgreSQL 16 client and
server binaries, Linux container behind an egress proxy.

---

## Step 0: Research (2026-10-26, ~10 min)

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

## Step 1: Scaffold (~5 min)

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
