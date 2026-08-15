import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { order, orderItem } from "@/lib/db/schema"
import { serializeOrder } from "@/lib/api/serialize"
import { json, apiError, withAuth } from "@/lib/api/http"

export const dynamic = "force-dynamic"

// GET /api/v1/orders/:orderNumber — one order, scoped to the authenticated user.
export const GET = withAuth<{ params: Promise<{ orderNumber: string }> }>(async (_req, principal, ctx) => {
  const { orderNumber } = await ctx.params
  const [found] = await db
    .select()
    .from(order)
    .where(and(eq(order.userId, principal.userId), eq(order.orderNumber, orderNumber)))
    .limit(1)

  if (!found) return apiError(404, "not_found", `No order '${orderNumber}' for this account.`)
  const items = await db.select().from(orderItem).where(eq(orderItem.orderId, found.id))
  return json({ order: serializeOrder({ ...found, items }) })
})
