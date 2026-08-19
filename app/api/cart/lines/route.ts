import { addToCartAction, updateCartLineAction } from "@/app/actions/cart"
import { handle, json, readInteger, readJsonBody, readString } from "@/lib/api/http"
import { resolveCartSubject } from "@/lib/api/subject"

const MAX_QTY_PER_LINE = 20

/**
 * Adds a variant to the bag.
 *
 * For an agent this is the first call that needs the shopper signed in: there is no
 * anonymous agent bag, so the token has to come before the first add rather than at
 * checkout. A browser still gets a cartId cookie here as it always did.
 */
export async function POST(request: Request) {
  return handle(request, async () => {
    // Before the body is read, so an unauthenticated caller cannot probe validation.
    await resolveCartSubject()

    const body = await readJsonBody(request)
    const merchandiseId = readString(body, "merchandiseId")
    const quantity = readInteger(body, "quantity", { min: 1, max: MAX_QTY_PER_LINE, fallback: 1 })

    const cart = await addToCartAction(merchandiseId, quantity)
    return json({ cart }, 201)
  })
}

/** Sets the quantity of an existing line. A quantity of 0 removes the line. */
export async function PATCH(request: Request) {
  return handle(request, async () => {
    await resolveCartSubject()

    const body = await readJsonBody(request)
    const lineId = readString(body, "lineId")
    const quantity = readInteger(body, "quantity", { min: 0, max: MAX_QTY_PER_LINE })

    const cart = await updateCartLineAction(lineId, quantity)
    return json({ cart })
  })
}
