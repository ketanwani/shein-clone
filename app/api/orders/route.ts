import { getOrderByNumberAction, getOrdersAction, placeOrderAction } from "@/app/actions/orders"
import { ApiFailure, handle, json, readJsonBody, readString } from "@/lib/api/http"
import { requireSubject } from "@/lib/api/subject"

export async function GET(request: Request) {
  return handle(request, async () => {
    await requireSubject()
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
    await requireSubject()
    const body = await readJsonBody(request)

    const result = await placeOrderAction(
      {
        email: readString(body, "email"),
        name: readString(body, "name"),
        address: readString(body, "address"),
        city: readString(body, "city"),
        zip: readString(body, "zip"),
        country: readString(body, "country"),
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
