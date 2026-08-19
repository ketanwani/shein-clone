import { clearCartAction, getCartAction } from "@/app/actions/cart"
import { handle, json } from "@/lib/api/http"
import { resolveCartSubject } from "@/lib/api/subject"

export async function GET(request: Request) {
  return handle(request, async () => {
    // 401s an agent call with no bearer token, and returns null for an anonymous
    // browser, which still has its cartId cookie.
    await resolveCartSubject()
    const cart = await getCartAction()
    return json({ cart })
  })
}

/** Abandons the bag: the stored reference for an account, the cartId cookie for a browser. */
export async function DELETE(request: Request) {
  return handle(request, async () => {
    await resolveCartSubject()
    await clearCartAction()
    return json({ cart: null })
  })
}
