import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { wishlistItem } from "@/lib/db/schema"
import { getProduct } from "@/lib/shopify/products"
import { serializeProduct } from "@/lib/api/serialize"
import { json, withAuth, parseJsonBody, ApiValidationError } from "@/lib/api/http"

export const dynamic = "force-dynamic"

async function listHandles(userId: string) {
  const rows = await db
    .select({ handle: wishlistItem.productHandle })
    .from(wishlistItem)
    .where(eq(wishlistItem.userId, userId))
  return rows.map((r) => r.handle)
}

// GET /api/v1/wishlist — saved product handles plus resolved product data.
export const GET = withAuth(async (_req, principal) => {
  const handles = await listHandles(principal.userId)
  const products = (await Promise.all(handles.map((h) => getProduct(h)))).filter((p) => p !== null)
  return json({ handles, products: products.map((p) => serializeProduct(p!)) })
})

// POST /api/v1/wishlist  { productHandle } — add an item.
export const POST = withAuth(async (req, principal) => {
  const body = await parseJsonBody<{ productHandle?: string }>(req)
  if (!body.productHandle) throw new ApiValidationError("'productHandle' is required.")
  await db
    .insert(wishlistItem)
    .values({ userId: principal.userId, productHandle: body.productHandle })
    .onConflictDoNothing()
  return json({ handles: await listHandles(principal.userId) }, 201)
})

// DELETE /api/v1/wishlist  { productHandle } — remove an item.
export const DELETE = withAuth(async (req, principal) => {
  const body = await parseJsonBody<{ productHandle?: string }>(req)
  if (!body.productHandle) throw new ApiValidationError("'productHandle' is required.")
  await db
    .delete(wishlistItem)
    .where(and(eq(wishlistItem.userId, principal.userId), eq(wishlistItem.productHandle, body.productHandle)))
  return json({ handles: await listHandles(principal.userId) })
})
