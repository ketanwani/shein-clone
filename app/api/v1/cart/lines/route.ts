import { addToCart, updateCart, removeFromCart } from "@/lib/shopify/cart"
import { resolveUserCartId, getUserCart } from "@/lib/api/cart"
import { serializeCart } from "@/lib/api/serialize"
import { json, withAuth, parseJsonBody, ApiValidationError } from "@/lib/api/http"

export const dynamic = "force-dynamic"

// POST /api/v1/cart/lines  { variantId, quantity? } — add an item.
export const POST = withAuth(async (req, principal) => {
  const body = await parseJsonBody<{ variantId?: string; quantity?: number }>(req)
  if (!body.variantId) throw new ApiValidationError("'variantId' is required.")
  const quantity = Math.floor(body.quantity ?? 1)
  if (!Number.isFinite(quantity) || quantity <= 0) throw new ApiValidationError("'quantity' must be a positive integer.")

  const cartId = await resolveUserCartId(principal.userId, true)
  const cart = await addToCart(cartId!, [{ merchandiseId: body.variantId, quantity }])
  return json({ cart: serializeCart(cart) }, 201)
})

// PATCH /api/v1/cart/lines  { lineId, quantity } — set a line's quantity (0 removes).
export const PATCH = withAuth(async (req, principal) => {
  const body = await parseJsonBody<{ lineId?: string; quantity?: number }>(req)
  if (!body.lineId) throw new ApiValidationError("'lineId' is required.")
  if (body.quantity == null || !Number.isFinite(body.quantity)) {
    throw new ApiValidationError("'quantity' is required.")
  }
  const cartId = await resolveUserCartId(principal.userId, false)
  if (!cartId) throw new ApiValidationError("You have no active cart.")

  const quantity = Math.floor(body.quantity)
  const cart =
    quantity <= 0
      ? await removeFromCart(cartId, [body.lineId])
      : await updateCart(cartId, [{ id: body.lineId, quantity }])
  return json({ cart: serializeCart(cart) })
})

// DELETE /api/v1/cart/lines  { lineId } — remove a line.
export const DELETE = withAuth(async (req, principal) => {
  const body = await parseJsonBody<{ lineId?: string }>(req)
  if (!body.lineId) throw new ApiValidationError("'lineId' is required.")
  const cartId = await resolveUserCartId(principal.userId, false)
  if (!cartId) {
    const empty = await getUserCart(principal.userId)
    return json({ cart: serializeCart(empty) })
  }
  const cart = await removeFromCart(cartId, [body.lineId])
  return json({ cart: serializeCart(cart) })
})
