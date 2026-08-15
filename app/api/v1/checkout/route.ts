import { getUserCart, clearUserCart } from "@/lib/api/cart"
import { createOrderFromCart, type CheckoutInput } from "@/lib/api/checkout"
import { serializeOrder } from "@/lib/api/serialize"
import { json, withAuth, parseJsonBody } from "@/lib/api/http"

export const dynamic = "force-dynamic"

// POST /api/v1/checkout — place a simulated order from the user's cart.
// Body: { email, name, address, city, zip, country, cardNumber, expiry, cvc }
// Use test card 4242 4242 4242 4242 to succeed; any other number is declined.
export const POST = withAuth(async (req, principal) => {
  const body = await parseJsonBody<CheckoutInput>(req)
  const cart = await getUserCart(principal.userId)
  const created = await createOrderFromCart(principal.userId, cart, body)
  // Order placed successfully — empty the cart.
  await clearUserCart(principal.userId)
  return json({ order: serializeOrder(created) }, 201)
})
