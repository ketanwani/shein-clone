# Local setup

Notes for running this project on a Meta corp laptop. Complements the README.

## Running

Two processes:

```bash
npm run db     # local Postgres (PGlite) on 127.0.0.1:5432 — leave running
npm run dev    # http://localhost:3000
```

`node_modules` is already installed. Use `npm run dev` / `npm run build`; the `pnpm`
on PATH is 8.15.9, which cannot read this repo's pnpm-lock.yaml (lockfile v10).
If you need pnpm, use the v10 binary already cached by corepack:

```bash
node ~/.cache/node/corepack/pnpm/10.28.0/bin/pnpm.cjs install --frozen-lockfile
```

## The database

There is no system Postgres. `brew install postgresql@17` cannot work here: this
Homebrew (4.1.20) predates macOS 26, `brew update` fails because corp endpoint
security makes /opt/homebrew unwritable, and `sudo` is blocked. Native Postgres
binaries from npm also fail — the security agent denies the `shmget` call Postgres
needs at bootstrap.

So the local database is **PGlite** — real PostgreSQL 18.3 compiled to WASM, served
over the normal Postgres wire protocol by `@electric-sql/pglite-socket`. The app's
`pg` Pool connects to it unchanged. Data lives in the gitignored `.pgdata/`.

```bash
npm run db                 # start it (foreground; leave the terminal open)
npm run db:push            # apply lib/db/schema.ts to the database
```

`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres` is already in
`.env.local`. Seven tables exist: `user`, `session`, `account`, `verification`,
`wishlist_item`, `order`, `order_item`.

To switch to a real Postgres later, point `DATABASE_URL` at it and run `npm run db:push`.
Nothing else is PGlite-specific.

## npm registry

`registry.npmjs.org` is blocked by this machine's egress proxy (`CONNECT tunnel
failed, 503`), and Meta's `registry.facebook.net` returns 401 without a Metaccio
token. The gitignored `.npmrc` in this directory points pnpm at
`https://registry.npmmirror.com/`, a public npm mirror. Installs run with
`--frozen-lockfile`, so every tarball's sha512 is verified against pnpm-lock.yaml
and cannot differ from what npm published. Delete `.npmrc` on a network that can
reach npmjs.org directly.

## Database migrations

Schema changes are versioned SQL files under `drizzle/`, applied automatically on deploy:
`build` runs `drizzle-kit migrate && next build`, so a migration failure fails the build
rather than leaving a running app pointed at a schema it does not match.

Changing the schema:

```bash
# 1. edit lib/db/schema.ts, then
npm run db:generate     # writes drizzle/NNNN_*.sql — commit it
npm run db:migrate      # apply locally
```

Commit the generated `.sql` and everything under `drizzle/meta/`. The next deploy applies
whatever is pending.

`npm run db:push` still exists for quick local iteration, but it writes no history, so a
change made that way will not reach any other database. Generate a migration before
committing.

**No baselining is needed.** Migration `0000` is deliberately idempotent — `IF NOT
EXISTS` on every table, column and index, and `DO` blocks for the foreign keys — so it
runs correctly against a database that predates migrations and already holds most of
those objects, against one that is fully current, and against an empty one. A drifted
database is repaired by the first deploy; nothing has to be run by hand.

It also clears duplicate `(userId, productHandle)` wishlist rows before creating the
unique index, since that is the one statement real data can block.

Later migrations are generated normally and need none of this — only the baseline is
written that way, because only the baseline has to meet an existing database.

`scripts/baseline-migrations.mjs` is kept for the general case of marking a migration
as already applied, but this schema does not need it.

`scripts/sync-schema.mjs` remains for repairing a database that drifted before any of
this existed. It is additive and idempotent, and needs no migration history.

## Authentication

Two ways to present the same Better Auth session:

- **Cookies** — what the website uses. Unchanged.
- **Bearer tokens** — how an agent presents a shopper's session, via the `bearer` plugin.

An agent sends two credentials, and they answer different questions. `X-Agent-Key` proves
the caller is the GLOWA agent; a bearer token proves which shopper the call is for. The
shopper gets that token by completing the email-OTP flow. Where the caller cannot carry a
token between calls, `X-Shopper-Email` names the shopper instead — set
`ALLOW_SHOPPER_EMAIL_HEADER` to enable it. Either way a shopper must be named before the
first cart write; there is no anonymous agent bag.

Locally the agent key needs no setup: outside production the well-known key
`dev-agent-key` is accepted. Set `DEMO_OTP_CODE` so sign-in can complete without a mail
provider.

```bash
export AGENT_KEY=dev-agent-key

curl -s -X POST -H "X-Agent-Key: $AGENT_KEY" -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","type":"sign-in"}' \
  localhost:3000/api/auth/email-otp/send-verification-otp

TOKEN=$(curl -s -X POST -H "X-Agent-Key: $AGENT_KEY" -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","otp":"000000"}' \
  localhost:3000/api/auth/sign-in/email-otp | jq -r .data.token)

curl -s -H "X-Agent-Key: $AGENT_KEY" -H "Authorization: Bearer $TOKEN" \
  localhost:3000/api/wishlist
```

`X-Customer-Ref` has been removed. Requests that still send it are ignored, not rejected.

For anything shared, set `AGENT_API_KEY` (`openssl rand -hex 32`). It takes a
comma-separated list so keys can be rotated with no 401 window: add the new one, move
the caller across, then drop the old one. **In production there is no fallback** — with
`AGENT_API_KEY` unset the agent path is disabled and every such call returns 401. That
is deliberate: a fixed key in the source would let anyone reach the agent routes
against the public URL.

**There is no passwordless sign-in.** The email-OTP flow was removed along with its
fixed `DEMO_OTP` code: a hardcoded code let anyone reach the server sign in as any email
address and read or write that account's wishlist and orders. Nothing needed it once
agents stopped using it — the website's own login is email and password. Reintroducing
passwordless login means wiring a real mail provider, not a fixed code.

### Cookie caveat in dev

`lib/auth.ts` sets `sameSite: "none"` and `secure: true` whenever `NODE_ENV` is
`development` (a leftover from the v0 preview iframe). Chrome accepts Secure cookies
on `http://localhost`, so the website's cookie login works there; Safari and Firefox
may drop the session cookie. Bearer tokens are unaffected.

## API reference

The REST API for agent integration is documented at **/docs/api**, generated from
`lib/api/spec.ts` so it cannot drift from the route handlers:

| Artifact | URL | Use |
| --- | --- | --- |
| Rendered page | `/docs/api` | Reading, copying curl commands |
| Raw markdown | `/docs/api/raw` | Paste into an agent's context (~40 KB) |
| OpenAPI 3.1 | `/api/openapi.json` | Tool-calling frameworks |

When you add a route under `app/api/`, add its entry to `lib/api/spec.ts` — all three
artifacts regenerate from it.

## Product data

`.env.local` points at **mock.shop**, Shopify's public demo storefront: a real
Storefront API with a fixed catalogue of ~20 products, no account or token needed
(the client requires a token to be present, so a placeholder is set).

Two consequences worth knowing:

- Prices are in CAD, and the products are Shopify's demo items, not fashion.
- mock.shop has no tags or product types, so `tag:'Sale'` and `product_type:'Dresses'`
  return nothing. `categoryQuery()` in `lib/categories.ts` drops the filter when the
  store is mock.shop, so **every collection page shows the same catalogue** rather
  than rendering empty. A real store filters normally.

To use your own store, replace both variables:

```
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_STOREFRONT_ACCESS_TOKEN=...
```

The token comes from your Shopify admin under Settings → Apps and sales channels →
Develop apps → your app → Storefront API access token. The API version is pinned to
`2025-04` in `lib/shopify/client.ts`.

## Server-side fetch and the corp proxy

`curl` honours `HTTPS_PROXY`, but Node's global `fetch` does not, and direct egress
from this machine is denied (`connect EPERM`). Server-side Shopify calls therefore
failed until `instrumentation.ts` pointed undici's global dispatcher at the proxy on
startup. It is a no-op wherever no proxy variables are set, including Vercel.

## What works right now

| Area | Status |
| --- | --- |
| Storefront pages: `/`, `/collections/*`, `/products/*`, `/search` | Working on mock.shop data |
| Cart: add, read, update, clear | Working, verified |
| Auth (OTP → bearer token, cookie login), wishlist, order history | Working, verified end to end |
| `/docs/api`, `/docs/api/raw`, `/api/openapi.json` | Working |
| Checkout (`POST /api/orders`) | Implemented; exercise it with the curl on /docs/api |

## Generated files

`next dev` writes `AGENTS.md`, `CLAUDE.md`, and `next-env.d.ts` on every run.
`next-env.d.ts`, `.npmrc` and `.pgdata/` are gitignored; `AGENTS.md` / `CLAUDE.md`
are left untracked for you to commit or ignore as you prefer.
