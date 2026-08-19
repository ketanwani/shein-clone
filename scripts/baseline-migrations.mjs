#!/usr/bin/env node
/**
 * Marks already-applied migrations as applied, for a database that predates them.
 *
 *   node scripts/baseline-migrations.mjs --sql            # print SQL to paste, no connection
 *   node scripts/baseline-migrations.mjs --through 0000   # limit to the first N
 *   DATABASE_URL=... node scripts/baseline-migrations.mjs --through 0000   # apply directly
 *
 * Only needed once, and only on a database that already has its tables. Migration 0000
 * is a snapshot of the whole schema in bare CREATE TABLE form; run it against a database
 * that already has those tables and it fails on the first one. Recording it as applied
 * lets the migrator skip it and start from 0001.
 *
 * A brand-new database needs none of this — 0000 runs normally and creates everything.
 *
 * The migrator decides what to skip by comparing timestamps, not hashes: it reads the
 * newest created_at and runs every migration whose journal `when` is greater. So the row
 * inserted here has to carry the real `when` from meta/_journal.json, which is why this
 * reads the journal rather than asking you for a number.
 */

import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const PRINT_SQL = process.argv.includes("--sql")
const throughIdx = process.argv.indexOf("--through")
const THROUGH = throughIdx === -1 ? null : process.argv[throughIdx + 1]

const FOLDER = path.resolve("drizzle")
const journal = JSON.parse(fs.readFileSync(path.join(FOLDER, "meta", "_journal.json"), "utf8"))

let entries = journal.entries
if (THROUGH) {
  const cut = entries.findIndex((e) => e.tag.startsWith(THROUGH))
  if (cut === -1) {
    console.error(`No migration matching "${THROUGH}". Available: ${entries.map((e) => e.tag).join(", ")}`)
    process.exit(1)
  }
  entries = entries.slice(0, cut + 1)
}

// Same hash the migrator computes: sha256 of the whole file, hex.
const rows = entries.map((e) => ({
  tag: e.tag,
  when: e.when,
  hash: crypto.createHash("sha256").update(fs.readFileSync(path.join(FOLDER, `${e.tag}.sql`))).digest("hex"),
}))

const DDL = `CREATE SCHEMA IF NOT EXISTS "drizzle";
CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);`

// NOT EXISTS keeps this safe to run twice — a second run inserts nothing.
const insert = (r) =>
  `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT '${r.hash}', ${r.when}
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "hash" = '${r.hash}'
);`

if (PRINT_SQL) {
  console.log(`-- Baseline: marks ${rows.map((r) => r.tag).join(", ")} as already applied.`)
  console.log("-- Run ONCE, against a database that already has these tables.")
  console.log("-- Safe to run twice; inserts nothing the second time.\n")
  console.log(DDL + "\n")
  for (const r of rows) console.log(`-- ${r.tag}\n${insert(r)}\n`)
  process.exit(0)
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Use --sql to print the statements instead.")
  process.exit(1)
}

const { Pool } = await import("pg")
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

try {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`)
  await pool.query(
    `CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
       id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
  )
  for (const r of rows) {
    const res = await pool.query(
      `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
       SELECT $1, $2
       WHERE NOT EXISTS (SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "hash" = $1)`,
      [r.hash, r.when],
    )
    console.log(`  ${res.rowCount ? "marked applied" : "already recorded"}  ${r.tag}`)
  }
  console.log("\nbaseline done. The next deploy will run only migrations after these.")
} catch (err) {
  console.error(err.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
