import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { wishlistItem } from "@/lib/db/schema"
import { getProduct } from "@/lib/shopify/products"
import type { Product } from "@/lib/shopify/types"
import { apiError, json, readJson, requireApiKey, resolveUserId } from "@/lib/api/helpers"

// GET /api/v1/wishlist?userId=...|email=...&expand=products
export async function GET(req: Request) {
  const unauthorized = requireApiKey(req)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const userId = await resolveUserId({
    userId: searchParams.get("userId"),
    email: searchParams.get("email"),
  })
  if (!userId) return apiError("Unknown user. Provide a valid 'userId' or 'email'.", 404)

  const rows = await db
    .select({ handle: wishlistItem.productHandle })
    .from(wishlistItem)
    .where(eq(wishlistItem.userId, userId))
  const handles = rows.map((r) => r.handle)

  if (searchParams.get("expand") === "products" && handles.length > 0) {
    const results = await Promise.all(handles.map((h) => getProduct(h)))
    const products = results.filter((p): p is Product => p !== null)
    return json({ count: handles.length, handles, products })
  }

  return json({ count: handles.length, handles })
}

// POST /api/v1/wishlist  body: { userId|email, handle }
export async function POST(req: Request) {
  const unauthorized = requireApiKey(req)
  if (unauthorized) return unauthorized

  const body = await readJson<{ userId?: string; email?: string; handle?: string }>(req)
  if (!body.handle) return apiError("Missing 'handle'.", 400)

  const userId = await resolveUserId({ userId: body.userId, email: body.email })
  if (!userId) return apiError("Unknown user. Provide a valid 'userId' or 'email'.", 404)

  await db
    .insert(wishlistItem)
    .values({ userId, productHandle: body.handle })
    .onConflictDoNothing()

  return json({ ok: true, handle: body.handle }, 201)
}

// DELETE /api/v1/wishlist  body: { userId|email, handle }
export async function DELETE(req: Request) {
  const unauthorized = requireApiKey(req)
  if (unauthorized) return unauthorized

  const body = await readJson<{ userId?: string; email?: string; handle?: string }>(req)
  if (!body.handle) return apiError("Missing 'handle'.", 400)

  const userId = await resolveUserId({ userId: body.userId, email: body.email })
  if (!userId) return apiError("Unknown user. Provide a valid 'userId' or 'email'.", 404)

  await db
    .delete(wishlistItem)
    .where(and(eq(wishlistItem.userId, userId), eq(wishlistItem.productHandle, body.handle)))

  return json({ ok: true, handle: body.handle })
}
