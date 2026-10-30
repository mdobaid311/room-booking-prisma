# Prisma app gallery submission (working notes)

Working notes for submitting this template to <https://www.prisma.io/apps>.
Compared with `prisma/prisma-examples` at branch `latest` on 2026-10-27:
`compute/templates.json`, `compute/README.md` and `compute/nextjs/`.

How the gallery works: a community template is a folder under `compute/` in
`prisma/prisma-examples`, with a README and a Composer module, plus an entry in
`compute/templates.json`. Once the PR merges it is listed on prisma.io/apps
with a "Use" link (`console.prisma.io/apps/<id>`) and a "Source" link to the
folder. So the submission is a copy of this repo, not a link to it.

## Gaps against the official templates

| | Official `compute/nextjs` | This repo | Action |
| --- | --- | --- | --- |
| Composer module | `module.ts` at the root | `module.ts` at the root | none |
| Service | `src/service.ts`, `appDir: '..'` | `service.ts` at the root, `appDir: "."` | none: both work, README documents the root layout |
| Deploy workflow | `.github/workflows/prisma-deploy.yml` | the same file at the root (PR #3), Node from `.nvmrc` | none: it comes with the copy (see below) |
| `bunfig.toml` | `linker = "hoisted"` | none | none: it only configures `bun install`; this repo installs with npm, whose `node_modules` is already hoisted |
| Package manager | Bun (`bun.lock`, `packageManager: bun@1.3.14`) | npm (`package-lock.json`) | none: `cloud-deploy-action` runs `npm ci` when it finds `package-lock.json` |
| Node in CI | 22.23.2 | 24 (`.nvmrc`); the CLI needs 22.18+ (`engines` of `prisma` and `@prisma/composer`; `alchemy` beta.78 needs 22.15+) | workflow below reads `.nvmrc`; 22.23.2 passes the version checks too, untested |
| Toolchain pins | exact (`@prisma/composer` 0.29.1, `prisma` rc.22, `@prisma/orm-postgres` rc.17, `alchemy` beta.78) | the same, plus `effect` 4.0.0-rc.115 as a direct dependency | done in `56de576` (PR #2) |
| App dependency pins | all exact | `^` on `resource-scheduler`, `zod`, `temporal-polyfill` and dev tools | none: the lockfile pins them; optional to drop the `^` |
| `.env.example` | `DATABASE_URL` only | `DATABASE_URL`, commented `TEST_DATABASE_URL`, `.env.local` advice | none |
| `.gitignore`, `.gitattributes` | | covers everything the official ones do | none |
| README | "Run locally", "Deploy to Prisma Compute" | both, plus how it works, env vars, scripts, structure, tests, troubleshooting | small edits in the gallery copy (see below) |
| `templates.json` `author` | no entry has one yet | | new field; shape to confirm with Prisma (draft below uses a string) |
| Deploy Button limits | | 52 tracked files, screenshots ~100 KB each | within 100 files / 25 MB |

### The workflow at this repo's root

Added in PR #3 after all: every pushed branch deploys (`main` to
production, any other branch to a preview stage of the same name), and that
is how the first deploy happened. Two things follow:

- The Deploy Button docs (`/docs/compute/deploy-button`) say "custom GitHub
  Actions workflows are not supported"; Prisma adds its own managed workflow
  when it copies the repo. **Tested 2026-10-30:** the copy gets Prisma's
  managed `prisma-deploy.yml` in place of this one (the same action, plus
  `module: module.ts`) and deploys on its first run (NOTES.md, Step 9).
- Every push to `main` is a production deploy.

Inside `prisma-examples/compute/room-booking-prisma-template/` it is inert
(GitHub only runs workflows from the repository root) and matches every other
template, whose `compute/README.md` says "Each example includes a Composer
module and a GitHub Actions deployment workflow."

## Before opening the PR

1. **Repository public: done.** `github.com/mdobaid311/room-booking-prisma-template`
   answers publicly (checked 2026-10-27), as the Deploy Button needs. The git
   remote, `src/app/about.tsx` and the README Deploy button all use it, with
   `project-name=room-booking-prisma-template`. The module and package are
   named `room-booking-prisma-template`, matching the gallery id.
2. **Console setup refused the `effect` override: fixed** in `56de576`,
   merged in PR #2. What happened (NOTES.md, Step 8): it
   expects Composer 0.28.0 with `effect` 4.0.0-rc.115, this repo has Composer
   0.34.0 with `effect` 4.0.3. The gallery's "Use" flow likely runs the same
   setup. The official templates pin Composer 0.29.1, `prisma` 8.0.0-rc.22,
   `@prisma/orm-postgres` 8.0.0-rc.17 and `alchemy` 2.0.0-beta.78 with no
   override; aligning with those is the likely fix (then re-check Node 22 vs
   24, since the managed workflow uses Node 22.23.2).
   **Done 2026-10-27:** installs fine, but needs `effect`
   4.0.0-rc.115 as a direct dependency (npm otherwise hoists 4.0.6 and every
   CLI command fails with `Cannot find module .../effect/dist/unstable/http/FetchHttpClient.js`;
   Prisma's own `bun.lock` resolves rc.115 the same way). Then CLI, migration
   check/status and `db verify` pass, and the contract keeps its storage hash
   after three syntax changes (`@onCreate(cuid(2))` to `@default(cuid(2))`,
   `sql` template to a string in `@@check`). Ported the rest: `db.ts` builds
   the client with `postgres<Contract>({ contractJson })`, the seed lock and
   test helper build raw SQL with `db.raw.sql` and run it on `tx.execute`,
   `migration.ts` passes strings to `fn()` and `checkExpression()`.
   Lint, typecheck, build and all 40 tests (PostgreSQL 17) pass.
   Side effects to know:
   - Recompiling `migration.ts` with rc.17 rewrites only the pre/postchecks
     in `ops.json` (DDL identical), so the migration hash changes from
     `3d6feb…` to `b986d5…`. Fresh databases are fine; an existing one shows
     the marker "Up to date" but the migration as not applied.
   - `prisma contract emit` must run with its output inside the project: it
     picks `@prisma/orm-postgres/...` import names from the nearest
     `package.json`, otherwise it writes `@internal/...` names that do not
     resolve.
   - rc.22 `prisma dev` has no `--detach` and refuses Windows
     (`DEV.PLATFORM_UNSUPPORTED`). Verified in a `node:24-bookworm` Docker
     container instead (Node 24.22.1, Bun 1.3.14, `npm ci`, then
     `npm run dev:composer`): build passes, Composer applies the migration to
     a fresh database, the app runs on Bun (`bun bootstrap.js`), the first
     visit seeds (200 in 1.2 s, then 0.1 s), 15 demo bookings, and 10
     parallel POSTs for one slot give 1 × 201 and 9 × 409 with the
     "already booked" message. Checked afterwards against the installed
     CLI: rc.22 has no `prisma dev stop` (it runs in the foreground, Ctrl+C
     stops it), and the Node floor is 22.18, so README and AGENTS.md no
     longer say Node 22 is refused and now say Windows needs WSL or a Linux
     container.
   - `tests/global-setup.ts` now runs `npx` through the shell
     (`execSync`): `execFileSync("npx")` fails on Windows with ENOENT. Not
     caused by the downgrade.
3. **Deployed: done 2026-10-27.** The `prisma-deploy` workflow deployed `main`
   to production (run 40496728593,
   <https://github.com/mdobaid311/room-booking-prisma-template/actions/runs/40496728593>):
   <https://bfc8q8vlw5rdrtz5643og0b1.ewr.prisma.build>. Details in NOTES.md
   Step 8.
4. **Deploy Button: done 2026-10-30.** After Prisma's fix, a fresh copy made
   with the README button deployed on its first run, with no service token
   (NOTES.md, Step 9). The gallery's own "Use" link
   (`console.prisma.io/apps/<id>`) can only be tried once the PR merges.

## The gallery folder: `compute/room-booking-prisma-template/`

Copy the repo's tracked files, except:

- `NOTES.md` (field notes for the blog post)
- anything ignored (`.env.local`, `node_modules/`, `.next/`, `.playwright-mcp/`)

Then, in the copy:

- `.github/workflows/prisma-deploy.yml` comes with the copy; optionally pin
  the action versions as below.
- `README.md`: point the Deploy button at the gallery
  (`https://console.prisma.io/apps/room-booking-prisma-template`), and in "Deploy on push"
  say the workflow is included instead of "it opens a pull request that adds
  the deploy workflow".
- `src/app/about.tsx`: `SOURCE_URL` to
  `https://github.com/prisma/prisma-examples/tree/latest/compute/room-booking-prisma-template`
  and "Deploy your own" to `https://console.prisma.io/apps/room-booking-prisma-template`.

### `.github/workflows/prisma-deploy.yml`

Same as `compute/nextjs`, except Node comes from `.nvmrc` (24) and the build
uses the default `npm run build`.

```yaml
name: prisma-deploy

on:
  push:
  delete:

concurrency:
  group: prisma-deploy-${{ github.event_name == 'delete' && github.event.ref || github.ref_name }}
  cancel-in-progress: false

permissions:
  contents: read
  id-token: write
  pull-requests: write

jobs:
  deploy:
    if: github.event_name == 'push' && github.ref_type == 'branch'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4.4.0
      - uses: oven-sh/setup-bun@v2.2.0
      - uses: actions/setup-node@v4.4.0
        with:
          node-version-file: .nvmrc
      - uses: prisma/cloud-deploy-action@v1.6.0

  teardown:
    if: github.event_name == 'delete' && github.event.ref_type == 'branch'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4.4.0
      - uses: oven-sh/setup-bun@v2.2.0
      - uses: actions/setup-node@v4.4.0
        with:
          node-version-file: .nvmrc
      - uses: prisma/cloud-deploy-action@v1.6.0
        with:
          mode: destroy
          stage: ${{ github.event.ref }}
```

### `compute/templates.json` entry

Append to `templates`:

```json
{
  "id": "room-booking-prisma-template",
  "name": "Room Booking",
  "description": "Next.js meeting room booking on a Resource Scheduler timeline that never double-books, with Prisma ORM and Prisma Postgres, deployed to Prisma Compute.",
  "path": "compute/room-booking-prisma-template",
  "framework": "nextjs",
  "author": "Mohammed Obaid"
}
```

`author` does not exist in the file yet. If Prisma wants a link too, the
likely shape is `{ "name": "Mohammed Obaid", "url": "https://github.com/mdobaid311" }`.

### `compute/README.md` row

```markdown
room-booking-prisma-template	Next.js room booking app: Resource Scheduler timeline, row locks and an exclusion constraint against double booking.
```

## PR

**Title:** `feat(compute): add room-booking-prisma-template community template`

**Description:**

> Adds `compute/room-booking-prisma-template`, a meeting room booking app for the Prisma app
> gallery, and its entry in `compute/templates.json`.
>
> **What it is:** a Next.js 16 App Router app where rooms are rows on a
> [Resource Scheduler](https://www.npmjs.com/package/resource-scheduler)
> timeline. Drag to book, move and resize; a taken slot turns red before you
> drop.
>
> **Built on Prisma, end to end:**
> - Prisma ORM 8: contract in `src/prisma/contract.prisma`, planned migrations, typed queries.
> - Prisma Postgres: provisioned per deploy by Composer's `postgres(contract)`, migrations applied before the service starts.
> - Prisma Compute: `module.ts` + `service.ts`, Next.js standalone output, deployed by the included `prisma-deploy` workflow.
>
> **What it shows beyond the starter templates:** the same booking rules run
> in the browser and on the server; every write locks the room row inside
> `db.transaction` before checking, so concurrent requests for one slot queue
> and exactly one wins; an `EXCLUDE USING gist` constraint (raw SQL step in
> the init migration) backs it up in the database. An empty database seeds six
> rooms and a day of bookings on first visit, so a fresh deploy has data.
>
> **Differences from the other templates:** npm (`package-lock.json`) instead
> of Bun, and Node 24 in the workflow (`.nvmrc`).
>
> **Checked:** `npm run lint`, `npm run typecheck`, `npm test` (unit tests, and
> with `TEST_DATABASE_URL` the PostgreSQL tests, including 25 simultaneous
> bookings of one slot), `npm run build`, and `npm run dev:composer` on Bun.
> Deployed by the included `prisma-deploy` workflow:
> <https://bfc8q8vlw5rdrtz5643og0b1.ewr.prisma.build>.
>
> `templates.json` gets a new `author` field, as the gallery page asks; happy
> to change its shape.
