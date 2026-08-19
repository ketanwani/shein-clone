#!/usr/bin/env node
/**
 * Brings a database up to lib/db/schema.ts, without dropping anything.
 *
 *   DATABASE_URL=... node scripts/sync-schema.mjs --dry-run
 *   DATABASE_URL=... node scripts/sync-schema.mjs
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

const label = (sql) => sql.trim().split("\n")[0].trim().replace(/\s+/g, " ").slice(0, 72)

async function main() {
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
