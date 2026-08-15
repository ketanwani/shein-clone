import { getUserCart, clearUserCart } from "@/lib/api/cart"
import { serializeCart } from "@/lib/api/serialize"
import { json, withAuth } from "@/lib/api/http"

export const dynamic = "force-dynamic"

// GET /api/v1/cart — the authenticated user's current cart.
export const GET = withAuth(async (_req, principal) => {
  const cart = await getUserCart(principal.userId)
  return json({ cart: serializeCart(cart) })
})

// DELETE /api/v1/cart — empty the user's cart.
export const DELETE = withAuth(async (_req, principal) => {
  await clearUserCart(principal.userId)
  return json({ cart: serializeCart(null) })
})
