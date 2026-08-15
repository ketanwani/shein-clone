import "server-only"
import { db } from "@/lib/db"
import { order, orderItem } from "@/lib/db/schema"
import type { Cart } from "@/lib/shopify/types"
import { ApiValidationError } from "./http"

const TEST_CARD = "4242424242424242"
const FREE_SHIPPING_THRESHOLD = 29
const FLAT_SHIPPING = 3.99
const TAX_RATE = 0.08
const MAX_QTY_PER_LINE = 20

export type CheckoutInput = {
  email: string
  name: string
  address: string
  city: string
  zip: string
  country: string
  cardNumber: string
  expiry: string
  cvc: string
}

export type CreatedOrder = Awaited<ReturnType<typeof createOrderFromCart>>

/**
 * Validates the (simulated) payment, recomputes the order total from the
 * authoritative Shopify cart — never from client input — and persists the
 * order scoped to `userId`. Throws ApiValidationError (→ HTTP 400) on any
 * invalid input or declined card.
 */
export async function createOrderFromCart(userId: string, cart: Cart | null, input: CheckoutInput) {
  const required: (keyof CheckoutInput)[] = ["email", "name", "address", "city", "zip", "country"]
  for (const field of required) {
    if (!input[field]?.trim()) throw new ApiValidationError(`Missing required field: ${field}.`)
  }

  const digits = (input.cardNumber ?? "").replace(/\D/g, "")
  if (digits !== TEST_CARD) {
    throw new ApiValidationError("Card declined. Use test card 4242 4242 4242 4242.")
  }
  if (!/^\d{2}\s*\/\s*\d{2}$/.test((input.expiry ?? "").trim())) {
    throw new ApiValidationError("Enter a valid expiry date (MM/YY).")
  }
  if (!/^\d{3,4}$/.test((input.cvc ?? "").trim())) {
    throw new ApiValidationError("Enter a valid CVC.")
  }

  if (!cart || cart.lines.length === 0) {
    throw new ApiValidationError("Your cart is empty.")
  }

  const currency = cart.cost.subtotalAmount.currencyCode

  let subtotal = 0
  const items = cart.lines.map((line) => {
    const qty = Math.floor(line.quantity)
    if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY_PER_LINE) {
      throw new ApiValidationError("Invalid quantity in cart.")
    }
    const lineTotal = Number.parseFloat(line.cost.totalAmount.amount)
    subtotal += lineTotal
    const unitPrice = (lineTotal / qty).toFixed(2)
    const variant =
      line.merchandise.title && line.merchandise.title !== "Default Title" ? line.merchandise.title : null
    return {
      title: line.merchandise.product.title,
      variantTitle: variant,
      quantity: qty,
      price: unitPrice,
      imageUrl: line.merchandise.image?.url ?? null,
      productHandle: line.merchandise.product.handle,
    }
  })

  subtotal = Number(subtotal.toFixed(2))
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING
  const tax = Number((subtotal * TAX_RATE).toFixed(2))
  const total = Number((subtotal + shipping + tax).toFixed(2))

  const orderNumber = `GLW-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`

  const [created] = await db
    .insert(order)
    .values({
      userId,
      orderNumber,
      email: input.email.trim(),
      shippingName: input.name.trim(),
      shippingAddress: input.address.trim(),
      shippingCity: input.city.trim(),
      shippingZip: input.zip.trim(),
      shippingCountry: input.country.trim(),
      subtotal: subtotal.toFixed(2),
      shipping: shipping.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      currency,
      cardLast4: digits.slice(-4),
      status: "paid",
    })
    .returning()

  await db.insert(orderItem).values(items.map((it) => ({ ...it, orderId: created.id })))

  return { ...created, items }
}
