import { clearCartAction, getCartAction } from "@/app/actions/cart"
import { handle, json } from "@/lib/api/http"

export async function GET(request: Request) {
  return handle(request, async () => {
    const cart = await getCartAction()
    return json({ cart })
  })
}

/** Clears the bag by dropping the cartId cookie. */
export async function DELETE(request: Request) {
  return handle(request, async () => {
    await clearCartAction()
    return json({ cart: null })
  })
}
