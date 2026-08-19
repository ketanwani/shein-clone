#!/usr/bin/env node
/**
 * Prints a stable fingerprint of the database schema: tables, columns, types,
 * nullability, defaults, primary keys and indexes.
 *
 * Used to prove that sync-schema.mjs lands a stale database in exactly the state
 * `drizzle-kit push` would have. Diff two runs of this and an empty diff is the proof.
 */

import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const COLUMNS = `
  SELECT table_name, column_name, data_type, is_nullable, column_default,
         numeric_precision, numeric_scale
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, column_name
`

const INDEXES = `
  SELECT tablename, indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
  ORDER BY tablename, indexname
`

const lines = []

const { rows: cols } = await pool.query(COLUMNS)
for (const c of cols) {
  const type =
    c.numeric_precision && c.data_type === "numeric"
      ? `numeric(${c.numeric_precision},${c.numeric_scale})`
      : c.data_type
  // Sequence names embed the table, so a serial default is normalised to keep the
  // fingerprint about shape rather than incidental naming.
  const def = (c.column_default ?? "").replace(/nextval\('[^']+'::regclass\)/, "nextval(seq)")
  lines.push(`col ${c.table_name}.${c.column_name} ${type} null=${c.is_nullable} default=${def}`)
}

const { rows: idx } = await pool.query(INDEXES)
for (const i of idx) lines.push(`idx ${i.tablename}.${i.indexname} ${i.indexdef}`)

console.log(lines.join("\n"))
await pool.end()
