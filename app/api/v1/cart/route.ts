import { createCart, getCart } from "@/lib/shopify/cart"
import { apiError, json, requireApiKey } from "@/lib/api/helpers"

// GET /api/v1/cart?cartId=... -> fetch an existing cart
export async function GET(req: Request) {
  const unauthorized = requireApiKey(req)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const cartId = searchParams.get("cartId")
  if (!cartId) return apiError("Missing 'cartId' query parameter.", 400)

  try {
    const cart = await getCart(cartId)
    if (!cart) return apiError("Cart not found.", 404)
    return json({ cart })
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Failed to fetch cart.", 502)
  }
}

// POST /api/v1/cart -> create a new empty cart
export async function POST(req: Request) {
  const unauthorized = requireApiKey(req)
  if (unauthorized) return unauthorized

  try {
    const cart = await createCart()
    return json({ cart }, 201)
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Failed to create cart.", 502)
  }
}
