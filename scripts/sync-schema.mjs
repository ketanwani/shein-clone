#!/usr/bin/env node
/**
 * Brings a database up to lib/db/schema.ts, without dropping anything.
 *
 *   DATABASE_URL=... node scripts/sync-schema.mjs --check     # read-only: what is missing
 *   DATABASE_URL=... node scripts/sync-schema.mjs --dry-run   # what it would run
 *   DATABASE_URL=... node scripts/sync-schema.mjs             # apply
 *
 * `drizzle-kit push` is the normal tool and remains so. This exists for the case it
 * cannot handle unattended: a database several changes behind, where push has to ask
 * whether a table that disappeared and one that appeared are a rename. It stops for a
 * TTY answer, which a deploy step does not have, and nothing gets applied.
 *
 * Every statement here is additive and idempotent — IF NOT EXISTS throughout — so it is
 * safe to run against a database that is already current, and safe to run twice. It
 * never drops a table, a column or an index; removing the ref-era tables is
 * scripts/drop-customer-refs.mjs, which is deliberately a separate, explicit step.
 */

import { Pool } from "pg"

const DRY_RUN = process.argv.includes("--dry-run")
const CHECK = process.argv.includes("--check")

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.")
  process.exit(1)
}

/**
 * Ordered so a table exists before anything references it. Postgres has no
 * `ADD CONSTRAINT IF NOT EXISTS`, so the two foreign keys are guarded by a catalogue
 * lookup in `constraints` below rather than inline.
 */
const STATEMENTS = [
  // --- Better Auth ---------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS "user" (
     "id" text PRIMARY KEY NOT NULL,
     "name" text NOT NULL,
     "email" text NOT NULL,
     "emailVerified" boolean DEFAULT false NOT NULL,
     "image" text,
     "createdAt" timestamp DEFAULT now() NOT NULL,
     "updatedAt" timestamp DEFAULT now() NOT NULL,
     CONSTRAINT "user_email_unique" UNIQUE("email")
   )`,
  `CREATE TABLE IF NOT EXISTS "session" (
     "id" text PRIMARY KEY NOT NULL,
     "expiresAt" timestamp NOT NULL,
     "token" text NOT NULL,
     "createdAt" timestamp DEFAULT now() NOT NULL,
     "updatedAt" timestamp DEFAULT now() NOT NULL,
     "ipAddress" text,
     "userAgent" text,
     "userId" text NOT NULL,
     CONSTRAINT "session_token_unique" UNIQUE("token")
   )`,
  `CREATE TABLE IF NOT EXISTS "account" (
     "id" text PRIMARY KEY NOT NULL,
     "accountId" text NOT NULL,
     "providerId" text NOT NULL,
     "userId" text NOT NULL,
     "accessToken" text,
     "refreshToken" text,
     "idToken" text,
     "accessTokenExpiresAt" timestamp,
     "refreshTokenExpiresAt" timestamp,
     "scope" text,
     "password" text,
     "createdAt" timestamp DEFAULT now() NOT NULL,
     "updatedAt" timestamp DEFAULT now() NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS "verification" (
     "id" text PRIMARY KEY NOT NULL,
     "identifier" text NOT NULL,
     "value" text NOT NULL,
     "expiresAt" timestamp NOT NULL,
     "createdAt" timestamp DEFAULT now(),
     "updatedAt" timestamp DEFAULT now()
   )`,

  // --- App tables ----------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS "wishlist_item" (
     "id" serial PRIMARY KEY NOT NULL,
     "userId" text NOT NULL,
     "productHandle" text NOT NULL,
     "createdAt" timestamp DEFAULT now() NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS "user_cart" (
     "userId" text PRIMARY KEY NOT NULL,
     "cartId" text NOT NULL,
     "updatedAt" timestamp DEFAULT now() NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS "customer_profile" (
     "userId" text PRIMARY KEY NOT NULL,
     "email" text,
     "name" text,
     "createdAt" timestamp DEFAULT now() NOT NULL,
     "updatedAt" timestamp DEFAULT now() NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS "customer_address" (
     "id" text PRIMARY KEY NOT NULL,
     "userId" text NOT NULL,
     "label" text,
     "line1" text NOT NULL,
     "city" text NOT NULL,
     "zip" text NOT NULL,
     "country" text NOT NULL,
     "isDefault" boolean DEFAULT false NOT NULL,
     "createdAt" timestamp DEFAULT now() NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS "order_idempotency" (
     "userId" text NOT NULL,
     "key" text NOT NULL,
     "orderNumber" text NOT NULL,
     "createdAt" timestamp DEFAULT now() NOT NULL,
     CONSTRAINT "order_idempotency_userId_key_pk" PRIMARY KEY ("userId", "key")
   )`,
  `CREATE TABLE IF NOT EXISTS "order" (
     "id" serial PRIMARY KEY NOT NULL,
     "userId" text NOT NULL,
     "orderNumber" text NOT NULL,
     "email" text NOT NULL,
     "shippingName" text NOT NULL,
     "shippingAddress" text NOT NULL,
     "shippingCity" text NOT NULL,
     "shippingZip" text NOT NULL,
     "shippingCountry" text NOT NULL,
     "subtotal" numeric(10, 2) NOT NULL,
     "shipping" numeric(10, 2) DEFAULT '0' NOT NULL,
     "tax" numeric(10, 2) DEFAULT '0' NOT NULL,
     "total" numeric(10, 2) NOT NULL,
     "currency" text DEFAULT 'USD' NOT NULL,
     "cardLast4" text,
     "status" text DEFAULT 'paid' NOT NULL,
     "addressId" text,
     "createdAt" timestamp DEFAULT now() NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS "order_item" (
     "id" serial PRIMARY KEY NOT NULL,
     "orderId" integer NOT NULL,
     "title" text NOT NULL,
     "variantTitle" text,
     "quantity" integer NOT NULL,
     "price" numeric(10, 2) NOT NULL,
     "imageUrl" text,
     "productHandle" text
   )`,

  // --- Columns added to tables that already existed ------------------------
  // This is the one that produced `column "addressId" does not exist`: the table
  // predates the address book, so CREATE TABLE IF NOT EXISTS above is a no-op for it.
  `ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "addressId" text`,
  `ALTER TABLE "customer_address" ADD COLUMN IF NOT EXISTS "label" text`,
  `ALTER TABLE "customer_profile" ADD COLUMN IF NOT EXISTS "email" text`,
  `ALTER TABLE "customer_profile" ADD COLUMN IF NOT EXISTS "name" text`,

  // --- Indexes -------------------------------------------------------------
  // Makes saving a wishlist item idempotent. Fails loudly if duplicates already exist,
  // which is the correct outcome: see the note printed on error below.
  `CREATE UNIQUE INDEX IF NOT EXISTS "wishlist_item_user_handle_idx"
     ON "wishlist_item" ("userId", "productHandle")`,
]

/** Foreign keys, guarded by name because Postgres has no ADD CONSTRAINT IF NOT EXISTS. */
const CONSTRAINTS = [
  {
    name: "session_userId_user_id_fk",
    sql: `ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk"
            FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE`,
  },
  {
    name: "account_userId_user_id_fk",
    sql: `ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk"
            FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE`,
  },
]

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

/** Every table and column the current schema expects, for the read-only --check report. */
const EXPECTED = {
  user: ["id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt"],
  session: ["id", "expiresAt", "token", "createdAt", "updatedAt", "ipAddress", "userAgent", "userId"],
  account: ["id", "accountId", "providerId", "userId", "accessToken", "refreshToken", "idToken",
            "accessTokenExpiresAt", "refreshTokenExpiresAt", "scope", "password", "createdAt", "updatedAt"],
  verification: ["id", "identifier", "value", "expiresAt", "createdAt", "updatedAt"],
  wishlist_item: ["id", "userId", "productHandle", "createdAt"],
  user_cart: ["userId", "cartId", "updatedAt"],
  customer_profile: ["userId", "email", "name", "createdAt", "updatedAt"],
  customer_address: ["id", "userId", "label", "line1", "city", "zip", "country", "isDefault", "createdAt"],
  order_idempotency: ["userId", "key", "orderNumber", "createdAt"],
  order: ["id", "userId", "orderNumber", "email", "shippingName", "shippingAddress", "shippingCity",
          "shippingZip", "shippingCountry", "subtotal", "shipping", "tax", "total", "currency",
          "cardLast4", "status", "addressId", "createdAt"],
  order_item: ["id", "orderId", "title", "variantTitle", "quantity", "price", "imageUrl", "productHandle"],
}

const EXPECTED_INDEXES = ["wishlist_item_user_handle_idx"]

/**
 * Reports drift without touching anything. Safe to point at production, which is the
 * point: see what is missing before deciding to change it.
 */
async function check() {
  const { rows: cols } = await pool.query(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'",
  )
  const present = new Map()
  for (const { table_name, column_name } of cols) {
    if (!present.has(table_name)) present.set(table_name, new Set())
    present.get(table_name).add(column_name)
  }

  const { rows: idx } = await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'")
  const indexes = new Set(idx.map((r) => r.indexname))

  let drift = 0
  for (const [table, columns] of Object.entries(EXPECTED)) {
    if (!present.has(table)) {
      console.log(`  MISSING TABLE   ${table}`)
      drift++
      continue
    }
    const missing = columns.filter((c) => !present.get(table).has(c))
    if (missing.length) {
      console.log(`  MISSING COLUMNS ${table}: ${missing.join(", ")}`)
      drift += missing.length
    }
  }
  for (const name of EXPECTED_INDEXES) {
    if (!indexes.has(name)) {
      console.log(`  MISSING INDEX   ${name}`)
      drift++
    }
  }

  // Not drift, but it decides the deploy order, so it is worth surfacing here.
  if (present.has("agent_customer")) {
    console.log("  NOTE            agent_customer still present — the deployed build still uses it.")
    console.log("                  Do NOT run drop-customer-refs.mjs until the removal is deployed.")
  }

  // The one thing that can make a sync fail part-way.
  if (present.has("wishlist_item") && !indexes.has("wishlist_item_user_handle_idx")) {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM (
         SELECT "userId", "productHandle" FROM wishlist_item
         GROUP BY 1, 2 HAVING count(*) > 1
       ) d`,
    )
    if (rows[0].n > 0) {
      console.log(`  BLOCKER         ${rows[0].n} duplicate (userId, productHandle) wishlist rows.`)
      console.log("                  The unique index cannot be created until these are cleared.")
    }
  }

  console.log(drift === 0 ? "\n  schema is up to date." : `\n  ${drift} item(s) missing. Run without --check to apply.`)
}

const label = (sql) => sql.trim().split("\n")[0].trim().replace(/\s+/g, " ").slice(0, 72)

async function main() {
  if (CHECK) {
    console.log("checking schema (read-only)\n")
    await check()
    return
  }

  console.log(`${DRY_RUN ? "[dry run] " : ""}syncing schema\n`)

  for (const sql of STATEMENTS) {
    if (DRY_RUN) {
      console.log(`  would run: ${label(sql)}…`)
      continue
    }
    try {
      await pool.query(sql)
      console.log(`  ok  ${label(sql)}…`)
    } catch (err) {
      if (err.code === "23505" && sql.includes("wishlist_item_user_handle_idx")) {
        console.error(
          `\n  FAILED  the wishlist already holds duplicate (userId, productHandle) rows.\n` +
            `  Clear them first, then re-run:\n\n` +
            `    DELETE FROM wishlist_item a USING wishlist_item b\n` +
            `     WHERE a.id > b.id AND a."userId" = b."userId"\n` +
            `       AND a."productHandle" = b."productHandle";\n`,
        )
        throw err
      }
      throw err
    }
  }

  for (const { name, sql } of CONSTRAINTS) {
    const { rows } = await pool.query("SELECT 1 FROM pg_constraint WHERE conname = $1", [name])
    if (rows.length > 0) {
      console.log(`  --  ${name} already present`)
      continue
    }
    if (DRY_RUN) {
      console.log(`  would add constraint: ${name}`)
      continue
    }
    await pool.query(sql)
    console.log(`  ok  added constraint ${name}`)
  }

  console.log(DRY_RUN ? "\nnothing was changed." : "\nschema is up to date.")
}

main()
  .catch((err) => {
    console.error(`\n${err.message}`)
    process.exitCode = 1
  })
  .finally(() => pool.end())
