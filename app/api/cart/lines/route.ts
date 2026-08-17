import { addToCartAction, updateCartLineAction } from "@/app/actions/cart"
import { handle, json, readInteger, readJsonBody, readString } from "@/lib/api/http"

const MAX_QTY_PER_LINE = 20

/** Adds a variant to the bag, creating the cart (and cartId cookie) on first call. */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJsonBody(request)
    const merchandiseId = readString(body, "merchandiseId")
    const quantity = readInteger(body, "quantity", { min: 1, max: MAX_QTY_PER_LINE, fallback: 1 })

    const cart = await addToCartAction(merchandiseId, quantity)
    return json({ cart }, 201)
  })
}

/** Sets the quantity of an existing line. A quantity of 0 removes the line. */
export async function PATCH(request: Request) {
  return handle(async () => {
    const body = await readJsonBody(request)
    const lineId = readString(body, "lineId")
    const quantity = readInteger(body, "quantity", { min: 0, max: MAX_QTY_PER_LINE })

    const cart = await updateCartLineAction(lineId, quantity)
    return json({ cart })
  })
}
