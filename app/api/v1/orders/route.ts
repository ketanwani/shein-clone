import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { order, orderItem } from "@/lib/db/schema"
import { serializeOrder } from "@/lib/api/serialize"
import { json, withAuth } from "@/lib/api/http"

export const dynamic = "force-dynamic"

// GET /api/v1/orders — the authenticated user's order history.
export const GET = withAuth(async (_req, principal) => {
  const rows = await db
    .select()
    .from(order)
    .where(eq(order.userId, principal.userId))
    .orderBy(desc(order.createdAt))

  const withItems = await Promise.all(
    rows.map(async (o) => {
      const items = await db.select().from(orderItem).where(eq(orderItem.orderId, o.id))
      return serializeOrder({ ...o, items })
    }),
  )
  return json({ orders: withItems, count: withItems.length })
})
