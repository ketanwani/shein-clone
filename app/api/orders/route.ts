import { getOrderByNumberAction, getOrdersAction, placeOrderAction } from "@/app/actions/orders"
import { ApiFailure, handle, json, readJsonBody, readOptionalString, readString } from "@/lib/api/http"
import { requireShopperSubject } from "@/lib/api/subject"

export async function GET(request: Request) {
  return handle(request, async () => {
    await requireShopperSubject()
    const orders = await getOrdersAction()
    return json({ count: orders.length, orders })
  })
}

/**
 * Places an order from the caller's current bag. Totals are recomputed server-side
 * from Shopify prices, so no amounts are accepted from the client.
 */
export async function POST(request: Request) {
  return handle(request, async () => {
    await requireShopperSubject()
    const body = await readJsonBody(request)

    // Shipping details are optional here: a returning shopper sends only address_id,
    // and email/name fall back to their stored profile. placeOrderAction reports
    // whatever is still missing.
    const result = await placeOrderAction(
      {
        email: readOptionalString(body, "email"),
        name: readOptionalString(body, "name"),
        address: readOptionalString(body, "address"),
        city: readOptionalString(body, "city"),
        zip: readOptionalString(body, "zip"),
        country: readOptionalString(body, "country"),
        addressId: readOptionalString(body, "address_id"),
        cardNumber: readString(body, "cardNumber"),
        expiry: readString(body, "expiry"),
        cvc: readString(body, "cvc"),
      },
      request.headers.get("idempotency-key")?.trim() || null,
    )

    if (!result.ok) throw new ApiFailure(400, "order_rejected", result.error)

    const order = await getOrderByNumberAction(result.orderNumber)
    // 200 on a replay, 201 only when this call actually created the order.
    return json({ order }, result.replayed ? 200 : 201)
  })
}
