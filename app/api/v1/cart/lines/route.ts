import { addToCart, createCart, removeFromCart, updateCart } from "@/lib/shopify/cart"
import { apiError, json, readJson, requireApiKey } from "@/lib/api/helpers"

const MAX_QTY = 20

// POST /api/v1/cart/lines -> add an item. Creates a cart if no cartId is given.
// body: { cartId?, merchandiseId, quantity? }
export async function POST(req: Request) {
  const unauthorized = requireApiKey(req)
  if (unauthorized) return unauthorized

  const body = await readJson<{ cartId?: string; merchandiseId?: string; quantity?: number }>(req)
  if (!body.merchandiseId) return apiError("Missing 'merchandiseId' (a Shopify variant GID).", 400)

  const quantity = Math.floor(body.quantity ?? 1)
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_QTY) {
    return apiError(`'quantity' must be an integer between 1 and ${MAX_QTY}.`, 400)
  }

  try {
    let cartId = body.cartId
    if (!cartId) {
      const created = await createCart()
      cartId = created.id
    }
    const cart = await addToCart(cartId, [{ merchandiseId: body.merchandiseId, quantity }])
    return json({ cart })
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Failed to add to cart.", 502)
  }
}

// PATCH /api/v1/cart/lines -> update a line's quantity (0 removes it).
// body: { cartId, lineId, quantity }
export async function PATCH(req: Request) {
  const unauthorized = requireApiKey(req)
  if (unauthorized) return unauthorized

  const body = await readJson<{ cartId?: string; lineId?: string; quantity?: number }>(req)
  if (!body.cartId || !body.lineId) return apiError("Missing 'cartId' or 'lineId'.", 400)

  const quantity = Math.floor(body.quantity ?? 0)
  if (!Number.isFinite(quantity) || quantity < 0 || quantity > MAX_QTY) {
    return apiError(`'quantity' must be an integer between 0 and ${MAX_QTY}.`, 400)
  }

  try {
    const cart =
      quantity <= 0
        ? await removeFromCart(body.cartId, [body.lineId])
        : await updateCart(body.cartId, [{ id: body.lineId, quantity }])
    return json({ cart })
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Failed to update cart line.", 502)
  }
}

// DELETE /api/v1/cart/lines -> remove a line.
// body: { cartId, lineId }
export async function DELETE(req: Request) {
  const unauthorized = requireApiKey(req)
  if (unauthorized) return unauthorized

  const body = await readJson<{ cartId?: string; lineId?: string }>(req)
  if (!body.cartId || !body.lineId) return apiError("Missing 'cartId' or 'lineId'.", 400)

  try {
    const cart = await removeFromCart(body.cartId, [body.lineId])
    return json({ cart })
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Failed to remove cart line.", 502)
  }
}
