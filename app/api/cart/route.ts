import { clearCartAction, getCartAction } from "@/app/actions/cart"
import { handle, json } from "@/lib/api/http"

export async function GET() {
  return handle(async () => {
    const cart = await getCartAction()
    return json({ cart })
  })
}

/** Clears the bag by dropping the cartId cookie. */
export async function DELETE() {
  return handle(async () => {
    await clearCartAction()
    return json({ cart: null })
  })
}
