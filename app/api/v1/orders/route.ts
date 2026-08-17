import { getOrdersForUser, placeOrderCore } from "@/lib/orders/core"
import { apiError, json, readJson, requireApiKey, resolveUserId } from "@/lib/api/helpers"

// GET /api/v1/orders?userId=...|email=...  -> list a user's orders
export async function GET(req: Request) {
  const unauthorized = requireApiKey(req)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const userId = await resolveUserId({
    userId: searchParams.get("userId"),
    email: searchParams.get("email"),
  })
  if (!userId) return apiError("Unknown user. Provide a valid 'userId' or 'email'.", 404)

  const orders = await getOrdersForUser(userId)
  return json({ count: orders.length, orders })
}

// POST /api/v1/orders -> place an order from a cart
// body: { userId|email, cartId, email, name, address, city, zip, country, cardNumber, expiry, cvc }
export async function POST(req: Request) {
  const unauthorized = requireApiKey(req)
  if (unauthorized) return unauthorized

  const body = await readJson<Record<string, string>>(req)
  const userId = await resolveUserId({ userId: body.userId, email: body.userEmail ?? body.email })
  if (!userId) return apiError("Unknown user. Provide a valid 'userId' or 'email'.", 404)
  if (!body.cartId) return apiError("Missing 'cartId'.", 400)

  try {
    const result = await placeOrderCore({
      userId,
      cartId: body.cartId,
      email: body.email ?? "",
      name: body.name ?? "",
      address: body.address ?? "",
      city: body.city ?? "",
      zip: body.zip ?? "",
      country: body.country ?? "",
      cardNumber: body.cardNumber ?? "",
      expiry: body.expiry ?? "",
      cvc: body.cvc ?? "",
    })
    if (!result.ok) return apiError(result.error, 400)
    return json({ ok: true, orderNumber: result.orderNumber }, 201)
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Failed to place order.", 500)
  }
}
