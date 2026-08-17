import { getOrderByNumberAction, getOrdersAction, placeOrderAction } from "@/app/actions/orders"
import { ApiFailure, handle, json, readJsonBody, readString, requireUser } from "@/lib/api/http"

export async function GET() {
  return handle(async () => {
    await requireUser()
    const orders = await getOrdersAction()
    return json({ count: orders.length, orders })
  })
}

/**
 * Places an order from the caller's current bag. Totals are recomputed server-side
 * from Shopify prices, so no amounts are accepted from the client.
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireUser()
    const body = await readJsonBody(request)

    const result = await placeOrderAction({
      email: readString(body, "email"),
      name: readString(body, "name"),
      address: readString(body, "address"),
      city: readString(body, "city"),
      zip: readString(body, "zip"),
      country: readString(body, "country"),
      cardNumber: readString(body, "cardNumber"),
      expiry: readString(body, "expiry"),
      cvc: readString(body, "cvc"),
    })

    if (!result.ok) throw new ApiFailure(400, "order_rejected", result.error)

    const order = await getOrderByNumberAction(result.orderNumber)
    return json({ order }, 201)
  })
}
