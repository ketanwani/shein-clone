#!/usr/bin/env node
/**
 * Removes the data the X-Customer-Ref era left behind.
 *
 *   node scripts/drop-customer-refs.mjs --dry-run   # count what would go
 *   node scripts/drop-customer-refs.mjs             # delete it
 *
 * Refs provisioned a synthetic shopper per conversation — a `user` row with an
 * `agent_<uuid>` id and a `…@customers.glowa.invalid` address — and keyed that
 * shopper's bag, profile, addresses, saved items and orders off it. With the header gone
 * none of it is reachable: there is no longer any credential that resolves to those ids.
 *
 * Unreachable rows are not harmless. They keep a shopper's address and order history in
 * the table with nothing able to read, correct or delete them on that person's behalf,
 * which is the wrong side of every retention argument. So they go.
 *
 * Real accounts are untouched. Only ids matching the synthetic pattern are considered,
 * and drizzle-kit push drops the agent_customer table itself.
 */

import { Pool } from "pg"

const DRY_RUN = process.argv.includes("--dry-run")
const CONNECTION = process.env.DATABASE_URL

if (!CONNECTION) {
  console.error("DATABASE_URL is not set.")
  process.exit(1)
}

// Belt and braces: the id prefix AND the reserved invalid domain. A real account can
// match neither — `.invalid` is reserved by RFC 2606 and can never be a live address.
const SYNTHETIC = `(id LIKE 'agent\\_%' ESCAPE '\\' AND email LIKE '%@customers.glowa.invalid')`

const pool = new Pool({ connectionString: CONNECTION })

async function tableExists(name) {
  const { rows } = await pool.query("SELECT to_regclass($1) AS oid", [name])
  return rows[0].oid !== null
}

/**
 * agent_customer is keyed by customerRef and cannot survive the header's removal.
 * customer_profile replaces it, keyed by the account — a different table, not a rename,
 * which is exactly what drizzle-kit cannot infer on its own. Dropping it here keeps
 * `db:push` non-interactive.
 */
async function dropAgentCustomer() {
  if (!(await tableExists("agent_customer"))) return
  if (DRY_RUN) {
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM agent_customer")
    console.log(`  agent_customer: would drop the table (${rows[0].n} rows)`)
    return
  }
  await pool.query("DROP TABLE agent_customer")
  console.log("  agent_customer: table dropped")
}

async function main() {
  const { rows: victims } = await pool.query(`SELECT id FROM "user" WHERE ${SYNTHETIC}`)
  const ids = victims.map((r) => r.id)
  console.log(`${DRY_RUN ? "[dry run] " : ""}synthetic ref shoppers found: ${ids.length}`)

  if (ids.length === 0) {
    // The table can still be there with no synthetic shoppers left to clean up.
    await dropAgentCustomer()
    return
  }

  // order_item is keyed by orderId, so it must be cleared BEFORE the orders it points
  // at — delete the parents first and the subquery below matches nothing.
  if (await tableExists("order_item")) {
    const q = `FROM order_item WHERE "orderId" IN (SELECT id FROM "order" WHERE "userId" = ANY($1))`
    if (DRY_RUN) {
      const { rows } = await pool.query(`SELECT count(*)::int AS n ${q}`, [ids])
      console.log(`  order_item: would delete ${rows[0].n}`)
    } else {
      const res = await pool.query(`DELETE ${q}`, [ids])
      console.log(`  order_item: deleted ${res.rowCount}`)
    }
  }

  const owned = [
    ["user_cart", "userId"],
    ["customer_address", "userId"],
    ["wishlist_item", "userId"],
    ["order_idempotency", "userId"],
    ["order", "userId"],
    ["session", "userId"],
    ["account", "userId"],
  ]

  for (const [table, column] of owned) {
    if (!(await tableExists(table))) continue
    const sql = `DELETE FROM "${table}" WHERE "${column}" = ANY($1)`
    if (DRY_RUN) {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM "${table}" WHERE "${column}" = ANY($1)`,
        [ids],
      )
      console.log(`  ${table}: would delete ${rows[0].n}`)
    } else {
      const res = await pool.query(sql, [ids])
      console.log(`  ${table}: deleted ${res.rowCount}`)
    }
  }

  if (DRY_RUN) {
    console.log(`  user: would delete ${ids.length}`)
    console.log("\nnothing was changed. Re-run without --dry-run to apply.")
    return
  }

  const res = await pool.query(`DELETE FROM "user" WHERE ${SYNTHETIC}`)
  console.log(`  user: deleted ${res.rowCount}`)

  await dropAgentCustomer()
  console.log("\ndone. Run `npm run db:push` to create customer_profile.")
}

main()
  .catch((err) => {
    console.error(err.message)
    process.exitCode = 1
  })
  .finally(() => pool.end())
